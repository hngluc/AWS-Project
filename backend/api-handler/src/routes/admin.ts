import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UserContext, requireAdmin } from '../middleware/auth';

// ─── Lazy-loaded client ─────────────────────────────────────────
let _docClient: any;

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

let _s3Client: any;

async function getS3Client() {
  if (!_s3Client) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    _s3Client = new S3Client({ region: process.env.AWS_REGION });
  }
  return _s3Client;
}

const IMAGE_TABLE = process.env.IMAGE_TABLE_NAME!;
const PROCESSED_BUCKET = process.env.PROCESSED_BUCKET_NAME!;
const IMAGE_URL_EXPIRY = 3600;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'X-Content-Type-Options': 'nosniff',
};

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

/**
 * GET /v1/admin/moderation
 * 
 * Lists all images flagged by Rekognition moderation.
 * Uses GSI2 (ModerationIndex): PK=MOD#FLAGGED, sorted by timestamp.
 * 
 * Admin only.
 */
export async function handleListModeration(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
): Promise<APIGatewayProxyResult> {
  requireAdmin(userContext);

  const params = event.queryStringParameters || {};
  const status = params.status || 'FLAGGED'; // FLAGGED, PENDING, REJECTED

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
    IndexName: 'GSI2-ModerationIndex',
    KeyConditionExpression: 'GSI2PK = :modStatus',
    ExpressionAttributeValues: {
      ':modStatus': `MOD#${status}`,
    },
    // Newest first
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
  }));

  const s3Client = await getS3Client();

  const images = await Promise.all((result.Items || []).map(async (item: Record<string, any>) => {
    let thumbnailUrl: string | null = null;
    if (item.thumbnailKey) {
      thumbnailUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: PROCESSED_BUCKET, Key: item.thumbnailKey }),
        { expiresIn: IMAGE_URL_EXPIRY },
      );
    }
    return {
      imageId: item.imageId,
      userId: item.userId,
      thumbnailUrl,
      originalKey: item.originalKey,
      moderationLabels: item.moderationLabels || [],
      createdAt: item.createdAt,
    };
  }));

  let nextCursor: string | null = null;
  if (result.LastEvaluatedKey) {
    nextCursor = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
  }

  return jsonResponse(200, {
    success: true,
    data: {
      moderationStatus: status,
      images,
    },
    meta: {
      nextCursor,
      count: images.length,
    },
  });
}

/**
 * POST /v1/admin/moderation/{imageId}
 * 
 * Approve or reject a flagged image.
 * Updates moderationStatus and GSI2 keys.
 * 
 * Request body: { action: "APPROVE" | "REJECT" }
 */
export async function handleModerateImage(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
): Promise<APIGatewayProxyResult> {
  requireAdmin(userContext);

  const imageId = event.pathParameters?.imageId;
  if (!imageId) {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'imageId is required' });
  }

  let body: { action?: string };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'Invalid JSON body' });
  }

  if (!body.action || !['APPROVE', 'REJECT'].includes(body.action)) {
    return jsonResponse(400, {
      success: false, error: 'BadRequest',
      message: 'action must be APPROVE or REJECT',
    });
  }

  const newStatus = body.action === 'APPROVE' ? 'SAFE' : 'REJECTED';

  const docClient = await getDocClient();

  // Find the image in moderation queue (search across all users)
  // We need to find it in GSI2 first to get PK/SK
  const findResult = await docClient.send(new QueryCommand({
    TableName: IMAGE_TABLE,
    IndexName: 'GSI2-ModerationIndex',
    KeyConditionExpression: 'GSI2PK = :modStatus',
    FilterExpression: 'imageId = :imageId',
    ExpressionAttributeValues: {
      ':modStatus': 'MOD#FLAGGED',
      ':imageId': imageId,
    },
    Limit: 10,
  }));

  if (!findResult.Items || findResult.Items.length === 0) {
    return jsonResponse(404, { success: false, error: 'NotFound', message: 'Flagged image not found' });
  }

  // Now we need to find the main table item to get PK/SK
  const flaggedItem = findResult.Items[0];
  const userId = flaggedItem.userId;

  // Query main table to get exact PK/SK
  const mainResult = await docClient.send(new QueryCommand({
    TableName: IMAGE_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    FilterExpression: 'imageId = :imageId',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':skPrefix': 'IMG#',
      ':imageId': imageId,
    },
    Limit: 1,
  }));

  if (!mainResult.Items || mainResult.Items.length === 0) {
    return jsonResponse(404, { success: false, error: 'NotFound', message: 'Image not found in main table' });
  }

  const image = mainResult.Items[0];

  // Update moderation status
  await docClient.send(new UpdateCommand({
    TableName: IMAGE_TABLE,
    Key: { PK: image.PK, SK: image.SK },
    UpdateExpression: `
      SET moderationStatus = :newStatus,
          GSI2PK = :newGsi2Pk,
          updatedAt = :now
    `,
    ExpressionAttributeValues: {
      ':newStatus': newStatus,
      ':newGsi2Pk': `MOD#${newStatus}`,
      ':now': new Date().toISOString(),
    },
  }));

  console.info('Image moderated', {
    imageId,
    action: body.action,
    newStatus,
    moderatedBy: userContext.userId,
  });

  return jsonResponse(200, {
    success: true,
    data: {
      imageId,
      moderationStatus: newStatus,
      moderatedBy: userContext.email,
    },
  });
}
