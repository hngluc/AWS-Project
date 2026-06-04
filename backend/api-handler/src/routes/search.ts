import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
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

const IMAGE_TABLE = process.env.IMAGE_TABLE_NAME!;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN!;

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

  // Query GSI1 for all images with this tag
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

  const images = (result.Items || []).map((item: Record<string, any>) => ({
    imageId: item.imageId,
    userId: item.userId,
    originalFilename: item.originalFilename,
    thumbnailUrl: item.thumbnailKey
      ? `https://${CLOUDFRONT_DOMAIN}/${item.thumbnailKey}`
      : null,
    moderationStatus: item.moderationStatus,
    createdAt: item.createdAt,
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
