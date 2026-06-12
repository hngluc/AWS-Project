import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { BatchGetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UserContext, requireAuth } from '../middleware/auth';

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
const IMAGE_URL_EXPIRY = 3600; // 1 hour

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
 * GET /v1/images/search?tag={tagName}&limit={limit}&cursor={cursor}
 * 
 * Search images by AI-generated tag using GSI1 (TagIndex).
 * GSI1PK = TAG#<tagName>, GSI1SK = IMG#<imageId>
 * 
 * This searches across ALL users' images (filtered by visibility=PUBLIC or owner).
 * For user-scoped search, filter results by userId.
 */
export async function handleSearchByTag(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
): Promise<APIGatewayProxyResult> {
  requireAuth(userContext);
  const { userId } = userContext;
  const params = event.queryStringParameters || {};

  const tag = params.tag?.trim();
  if (!tag) {
    return jsonResponse(400, {
      success: false, error: 'BadRequest',
      message: 'Query parameter "tag" is required',
    });
  }

  // Sanitize tag name: capitalize first letter for consistency
  const normalizedTag = tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase();

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

  // Query GSI1 for all images with this tag.
  // The index projection is intentionally small, so fetch full records before
  // enforcing visibility rules.
  const result = await docClient.send(new QueryCommand({
    TableName: IMAGE_TABLE,
    IndexName: 'GSI1-TagIndex',
    KeyConditionExpression: 'GSI1PK = :tagKey',
    ExpressionAttributeValues: {
      ':tagKey': `TAG#${normalizedTag}`,
    },
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
  }));

  const indexItems = result.Items || [];
  const keys = indexItems
    .filter((item: Record<string, any>) => item.imagePK && item.imageSK)
    .map((item: Record<string, any>) => ({ PK: item.imagePK, SK: item.imageSK }));

  let fullItems: Record<string, any>[] = [];
  if (keys.length > 0) {
    const fullResult = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [IMAGE_TABLE]: {
          Keys: keys,
          ProjectionExpression: [
            'imageId', 'userId', 'originalFilename', 'thumbnailKey', 'resizedKey',
            'mimeType', 'fileSize', 'dimensions', 'exifData', 'aiTags',
            'moderationStatus', '#status', '#visibility', 'createdAt', 'updatedAt',
          ].join(', '),
          ExpressionAttributeNames: {
            '#status': 'status',
            '#visibility': 'visibility',
          },
        },
      },
    }));

    fullItems = fullResult.Responses?.[IMAGE_TABLE] || [];
  } else {
    fullItems = indexItems;
  }

  const visibleItems = fullItems.filter((item: Record<string, any>) => (
    userContext.isAdmin ||
    item.userId === userId ||
    (item.visibility === 'PUBLIC' && item.moderationStatus === 'SAFE')
  ));

  const s3Client = await getS3Client();

  const images = await Promise.all(visibleItems.map(async (item: Record<string, any>) => {
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
  }));

  let nextCursor: string | null = null;
  if (result.LastEvaluatedKey) {
    nextCursor = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
  }

  return jsonResponse(200, {
    success: true,
    data: {
      tag: normalizedTag,
      images,
    },
    meta: {
      nextCursor,
      count: images.length,
    },
  });
}
