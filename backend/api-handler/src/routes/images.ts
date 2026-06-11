import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, DeleteCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UserContext, requireAuth } from '../middleware/auth';

// ─── Lazy-loaded clients ────────────────────────────────────────
let _s3Client: any;
let _docClient: any;

async function getS3Client() {
  if (!_s3Client) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    _s3Client = new S3Client({ region: process.env.AWS_REGION });
  }
  return _s3Client;
}

async function getDocClient() {
  if (!_docClient) {
    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
    _docClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: process.env.AWS_REGION }),
      { marshallOptions: { removeUndefinedValues: true } },
    );
  }
  return _docClient;
}

// ─── Constants ──────────────────────────────────────────────────
const IMAGE_TABLE = process.env.IMAGE_TABLE_NAME!;
const RAW_BUCKET = process.env.RAW_BUCKET_NAME!;
const PROCESSED_BUCKET = process.env.PROCESSED_BUCKET_NAME!;
const DOWNLOAD_URL_EXPIRY = parseInt(process.env.PRESIGNED_URL_EXPIRY || '900', 10);
const IMAGE_URL_EXPIRY = 3600; // 1 hour for thumbnail/resized URLs

// ─── Response Helpers ───────────────────────────────────────────
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Credentials': 'true',
  'X-Content-Type-Options': 'nosniff',
};

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

/**
 * Transforms a DynamoDB image item into a client-facing response.
 * Uses S3 presigned URLs for secure, time-limited access to processed images.
 */
async function toImageResponse(item: Record<string, any>) {
  const s3Client = await getS3Client();

  let thumbnailUrl: string | null = null;
  let resizedUrl: string | null = null;

  if (item.thumbnailKey) {
    thumbnailUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: PROCESSED_BUCKET, Key: item.thumbnailKey }),
      { expiresIn: IMAGE_URL_EXPIRY },
    );
  }

  if (item.resizedKey) {
    resizedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: PROCESSED_BUCKET, Key: item.resizedKey }),
      { expiresIn: IMAGE_URL_EXPIRY },
    );
  }

  return {
    imageId: item.imageId,
    userId: item.userId,
    originalFilename: item.originalFilename,
    thumbnailUrl,
    resizedUrl,
    mimeType: item.mimeType,
    fileSize: item.fileSize,
    dimensions: item.dimensions || null,
    exifData: item.exifData || null,
    aiTags: item.aiTags || [],
    moderationStatus: item.moderationStatus,
    status: item.status,
    visibility: item.visibility,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function findUserImage(docClient: any, userId: string, imageId: string) {
  const result = await docClient.send(new QueryCommand({
    TableName: IMAGE_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    FilterExpression: 'imageId = :imageId',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'IMG#',
      ':imageId': imageId,
    },
  }));

  return result.Items?.[0] || null;
}

/**
 * GET /v1/images
 * 
 * List all images for the authenticated user with cursor-based pagination.
 * Uses DynamoDB Query on PK=USER#<userId>, SK begins_with "IMG#"
 * 
 * Query params: limit (default 20, max 100), cursor (base64-encoded LastEvaluatedKey)
 */
export async function handleListImages(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
): Promise<APIGatewayProxyResult> {
  requireAuth(userContext);
  const { userId } = userContext;
  const params = event.queryStringParameters || {};

  // Parse pagination
  let limit = parseInt(params.limit || '20', 10);
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  let exclusiveStartKey: Record<string, any> | undefined;
  if (params.cursor) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(params.cursor, 'base64').toString('utf-8'));
    } catch {
      return jsonResponse(400, { success: false, error: 'BadRequest', message: 'Invalid cursor' });
    }
  }

  const docClient = await getDocClient();

  const result = await docClient.send(new QueryCommand({
    TableName: IMAGE_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'IMG#',
    },
    // Return newest images first
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
    // Only fetch needed attributes (reduces RCU)
    ProjectionExpression: [
      'imageId', 'userId', 'originalFilename', 'thumbnailKey', 'resizedKey',
      'mimeType', 'fileSize', 'dimensions', 'exifData', 'aiTags',
      'moderationStatus', '#status', 'visibility', 'createdAt', 'updatedAt',
    ].join(', '),
    ExpressionAttributeNames: { '#status': 'status' },
  }));

  const images = await Promise.all((result.Items || []).map(toImageResponse));

  // Encode next cursor
  let nextCursor: string | null = null;
  if (result.LastEvaluatedKey) {
    nextCursor = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
  }

  return jsonResponse(200, {
    success: true,
    data: { images },
    meta: {
      nextCursor,
      count: images.length,
    },
  });
}

/**
 * GET /v1/images/public
 *
 * List public, safe, completed images for the community gallery.
 */
export async function handleListPublicImages(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
): Promise<APIGatewayProxyResult> {
  requireAuth(userContext);
  const params = event.queryStringParameters || {};

  let limit = parseInt(params.limit || '20', 10);
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  let exclusiveStartKey: Record<string, any> | undefined;
  if (params.cursor) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(params.cursor, 'base64').toString('utf-8'));
    } catch {
      return jsonResponse(400, { success: false, error: 'BadRequest', message: 'Invalid cursor' });
    }
  }

  const docClient = await getDocClient();
  const result = await docClient.send(new ScanCommand({
    TableName: IMAGE_TABLE,
    FilterExpression: '#visibility = :public AND moderationStatus = :safe AND #status = :completed',
    ExpressionAttributeNames: {
      '#visibility': 'visibility',
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':public': 'PUBLIC',
      ':safe': 'SAFE',
      ':completed': 'COMPLETED',
    },
    ProjectionExpression: [
      'imageId', 'userId', 'originalFilename', 'thumbnailKey', 'resizedKey',
      'mimeType', 'fileSize', 'dimensions', 'exifData', 'aiTags',
      'moderationStatus', '#status', '#visibility', 'createdAt', 'updatedAt',
    ].join(', '),
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
  }));

  const images = await Promise.all((result.Items || []).map(toImageResponse));
  let nextCursor: string | null = null;
  if (result.LastEvaluatedKey) {
    nextCursor = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
  }

  return jsonResponse(200, {
    success: true,
    data: { images },
    meta: {
      nextCursor,
      count: images.length,
    },
  });
}

/**
 * GET /v1/images/{imageId}
 * 
 * Get a single image's full details including AI tags and EXIF data.
 * Requires the image to belong to the authenticated user (row-level security).
 */
export async function handleGetImage(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
): Promise<APIGatewayProxyResult> {
  requireAuth(userContext);
  const { userId } = userContext;
  const imageId = event.pathParameters?.imageId;

  if (!imageId) {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'imageId is required' });
  }

  const docClient = await getDocClient();
  const image = await findUserImage(docClient, userId, imageId);

  if (!image) {
    return jsonResponse(404, { success: false, error: 'NotFound', message: 'Image not found' });
  }

  // Row-level security check: ensure image belongs to requesting user
  if (image.userId !== userId && !userContext.isAdmin) {
    return jsonResponse(403, { success: false, error: 'Forbidden', message: 'Access denied' });
  }

  return jsonResponse(200, {
    success: true,
    data: toImageResponse(image),
  });
}

/**
 * DELETE /v1/images/{imageId}
 * 
 * Deletes an image: removes DynamoDB record and all S3 objects.
 * Only the image owner (or admin) can delete.
 */
export async function handleDeleteImage(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
): Promise<APIGatewayProxyResult> {
  requireAuth(userContext);
  const { userId } = userContext;
  const imageId = event.pathParameters?.imageId;

  if (!imageId) {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'imageId is required' });
  }

  const docClient = await getDocClient();

  // Find the image first
  const findResult = await docClient.send(new QueryCommand({
    TableName: IMAGE_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    FilterExpression: 'imageId = :imageId',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'IMG#',
      ':imageId': imageId,
    },
  }));

  if (!findResult.Items || findResult.Items.length === 0) {
    return jsonResponse(404, { success: false, error: 'NotFound', message: 'Image not found' });
  }

  const image = findResult.Items[0];

  // Row-level security
  if (image.userId !== userId && !userContext.isAdmin) {
    return jsonResponse(403, { success: false, error: 'Forbidden', message: 'Access denied' });
  }

  // Delete S3 objects (non-blocking, best-effort)
  const s3Client = await getS3Client();
  const deletePromises: Promise<any>[] = [];

  if (image.originalKey) {
    deletePromises.push(
      s3Client.send(new DeleteObjectCommand({ Bucket: RAW_BUCKET, Key: image.originalKey }))
        .catch((err: Error) => console.error('Failed to delete raw image', { key: image.originalKey, err })),
    );
  }
  if (image.thumbnailKey) {
    deletePromises.push(
      s3Client.send(new DeleteObjectCommand({ Bucket: PROCESSED_BUCKET, Key: image.thumbnailKey }))
        .catch((err: Error) => console.error('Failed to delete thumbnail', { key: image.thumbnailKey, err })),
    );
  }
  if (image.resizedKey) {
    deletePromises.push(
      s3Client.send(new DeleteObjectCommand({ Bucket: PROCESSED_BUCKET, Key: image.resizedKey }))
        .catch((err: Error) => console.error('Failed to delete resized', { key: image.resizedKey, err })),
    );
  }

  // Delete DynamoDB record
  deletePromises.push(
    docClient.send(new DeleteCommand({
      TableName: IMAGE_TABLE,
      Key: { PK: image.PK, SK: image.SK },
    })),
  );

  await Promise.all(deletePromises);

  console.info('Image deleted', { imageId, userId, keys: [image.originalKey, image.thumbnailKey, image.resizedKey] });

  return jsonResponse(200, {
    success: true,
    data: { imageId, deleted: true },
  });
}

/**
 * DELETE /v1/images/bulk
 *
 * Deletes multiple images owned by the authenticated user.
 */
export async function handleBulkDeleteImages(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
): Promise<APIGatewayProxyResult> {
  requireAuth(userContext);
  const { userId } = userContext;

  let body: { imageIds?: unknown };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'Invalid JSON body' });
  }

  if (!Array.isArray(body.imageIds) || body.imageIds.length === 0) {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'imageIds must be a non-empty array' });
  }

  if (body.imageIds.length > 100) {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'Cannot delete more than 100 images at once' });
  }

  const requestedIds = [
    ...new Set(
      body.imageIds
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .map((id) => id.trim()),
    ),
  ];
  if (requestedIds.length === 0) {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'imageIds must contain valid strings' });
  }

  const requestedIdSet = new Set(requestedIds);
  const docClient = await getDocClient();
  const s3Client = await getS3Client();

  const queryResult = await docClient.send(new QueryCommand({
    TableName: IMAGE_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'IMG#',
    },
  }));

  const images = (queryResult.Items || []).filter((item: Record<string, any>) => requestedIdSet.has(item.imageId));
  const foundIds = new Set(images.map((item: Record<string, any>) => item.imageId));
  const notFoundIds = requestedIds.filter((id) => !foundIds.has(id));

  const deletePromises: Promise<any>[] = [];
  for (const image of images) {
    if (image.originalKey) {
      deletePromises.push(
        s3Client.send(new DeleteObjectCommand({ Bucket: RAW_BUCKET, Key: image.originalKey }))
          .catch((err: Error) => console.error('Failed to delete raw image', { key: image.originalKey, err })),
      );
    }
    if (image.thumbnailKey) {
      deletePromises.push(
        s3Client.send(new DeleteObjectCommand({ Bucket: PROCESSED_BUCKET, Key: image.thumbnailKey }))
          .catch((err: Error) => console.error('Failed to delete thumbnail', { key: image.thumbnailKey, err })),
      );
    }
    if (image.resizedKey) {
      deletePromises.push(
        s3Client.send(new DeleteObjectCommand({ Bucket: PROCESSED_BUCKET, Key: image.resizedKey }))
          .catch((err: Error) => console.error('Failed to delete resized', { key: image.resizedKey, err })),
      );
    }

    deletePromises.push(docClient.send(new DeleteCommand({
      TableName: IMAGE_TABLE,
      Key: { PK: image.PK, SK: image.SK },
    })));
  }

  await Promise.all(deletePromises);

  return jsonResponse(200, {
    success: true,
    data: {
      deletedCount: images.length,
      deletedIds: images.map((image: Record<string, any>) => image.imageId),
      notFoundIds,
    },
  });
}

/**
 * GET /v1/images/{imageId}/download
 *
 * Returns a short-lived presigned URL for the original uploaded file.
 */
export async function handleGetDownloadUrl(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
): Promise<APIGatewayProxyResult> {
  requireAuth(userContext);
  const { userId } = userContext;
  const imageId = event.pathParameters?.imageId;

  if (!imageId) {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'imageId is required' });
  }

  const docClient = await getDocClient();
  const image = await findUserImage(docClient, userId, imageId);
  if (!image) {
    return jsonResponse(404, { success: false, error: 'NotFound', message: 'Image not found' });
  }

  if (image.userId !== userId && !userContext.isAdmin) {
    return jsonResponse(403, { success: false, error: 'Forbidden', message: 'Access denied' });
  }

  if (!image.originalKey) {
    return jsonResponse(409, { success: false, error: 'ImageNotReady', message: 'Original image is not available' });
  }

  const safeFilename = (image.originalFilename || `${imageId}.jpg`).replace(/["\r\n]/g, '_');
  const s3Client = await getS3Client();
  const downloadUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: RAW_BUCKET,
      Key: image.originalKey,
      ResponseContentDisposition: `attachment; filename="${safeFilename}"`,
      ResponseContentType: image.mimeType || undefined,
    }),
    { expiresIn: DOWNLOAD_URL_EXPIRY },
  );

  return jsonResponse(200, {
    success: true,
    data: {
      imageId,
      downloadUrl,
      expiresIn: DOWNLOAD_URL_EXPIRY,
    },
  });
}

/**
 * PATCH /v1/images/{imageId}
 * 
 * Update image properties: visibility, manual tags.
 * Only the image owner can update.
 */
export async function handleUpdateImage(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
): Promise<APIGatewayProxyResult> {
  requireAuth(userContext);
  const { userId } = userContext;
  const imageId = event.pathParameters?.imageId;

  if (!imageId) {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'imageId is required' });
  }

  let body: { visibility?: string };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'Invalid JSON body' });
  }

  // Validate visibility
  if (body.visibility && !['PUBLIC', 'PRIVATE'].includes(body.visibility)) {
    return jsonResponse(400, {
      success: false, error: 'BadRequest',
      message: 'visibility must be PUBLIC or PRIVATE',
    });
  }

  const docClient = await getDocClient();

  // Find the image
  const findResult = await docClient.send(new QueryCommand({
    TableName: IMAGE_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    FilterExpression: 'imageId = :imageId',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'IMG#',
      ':imageId': imageId,
    },
  }));

  if (!findResult.Items || findResult.Items.length === 0) {
    return jsonResponse(404, { success: false, error: 'NotFound', message: 'Image not found' });
  }

  const image = findResult.Items[0];

  if (image.userId !== userId && !userContext.isAdmin) {
    return jsonResponse(403, { success: false, error: 'Forbidden', message: 'Access denied' });
  }

  // Build update expression dynamically
  const updateExpressions: string[] = ['updatedAt = :now'];
  const expressionValues: Record<string, any> = { ':now': new Date().toISOString() };

  if (body.visibility) {
    updateExpressions.push('visibility = :visibility');
    expressionValues[':visibility'] = body.visibility;
  }

  await docClient.send(new UpdateCommand({
    TableName: IMAGE_TABLE,
    Key: { PK: image.PK, SK: image.SK },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeValues: expressionValues,
    // Ensure item still exists (concurrent delete protection)
    ConditionExpression: 'attribute_exists(PK)',
  }));

  return jsonResponse(200, {
    success: true,
    data: { imageId, updated: true },
  });
}
