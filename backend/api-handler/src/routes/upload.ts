import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { UserContext, requireAuth } from '../middleware/auth';

// ─── Lazy-loaded clients (cold start optimization) ─────────────
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
const RAW_BUCKET = process.env.RAW_BUCKET_NAME!;
const IMAGE_TABLE = process.env.IMAGE_TABLE_NAME!;
const QUOTA_TABLE = process.env.USER_QUOTA_TABLE_NAME!;
const PRESIGNED_EXPIRY = parseInt(process.env.PRESIGNED_URL_EXPIRY || '900', 10);

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._\-() ]*\.[a-zA-Z]{2,5}$/;

// File extension map
const EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

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
 * POST /v1/images/presigned-url
 * 
 * Generates a presigned URL for direct S3 upload.
 * Also creates a DynamoDB record with status=UPLOADING.
 * 
 * Request body: { filename, contentType, fileSize }
 * Response: { imageId, uploadUrl, key, expiresIn }
 */
export async function handleUpload(
  event: APIGatewayProxyEvent,
  userContext: UserContext,
): Promise<APIGatewayProxyResult> {
  requireAuth(userContext);
  const { userId } = userContext;

  // Parse and validate request body
  let body: { filename?: string; contentType?: string; fileSize?: number };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'Invalid JSON body' });
  }

  const { filename, contentType, fileSize } = body;

  // Validate filename
  if (!filename || typeof filename !== 'string') {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'filename is required' });
  }
  if (!SAFE_FILENAME_REGEX.test(filename)) {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'Invalid filename characters' });
  }
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return jsonResponse(400, { success: false, error: 'BadRequest', message: 'Path traversal not allowed' });
  }

  // Validate content type
  if (!contentType || !ALLOWED_MIME_TYPES.includes(contentType)) {
    return jsonResponse(400, {
      success: false, error: 'BadRequest',
      message: `contentType must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`,
    });
  }

  // Validate file size
  if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
    return jsonResponse(400, {
      success: false, error: 'BadRequest',
      message: `fileSize must be between 1 byte and ${MAX_FILE_SIZE / (1024 * 1024)} MB`,
    });
  }

  // Check user quota
  const quotaCheck = await checkUserQuota(userId, fileSize);
  if (!quotaCheck.allowed) {
    return jsonResponse(429, {
      success: false, error: 'QuotaExceeded',
      message: quotaCheck.reason,
    });
  }

  // Generate unique image ID (ULID is lexicographically sortable)
  const imageId = ulid();
  const now = new Date();
  const datePrefix = now.toISOString().replace(/[-:]/g, '').substring(0, 15); // YYYYMMDDTHHMMSS
  const extension = EXTENSION_MAP[contentType] || 'jpg';

  // S3 key path: users/<userId>/original/<imageId>.<ext>
  // This path structure enables:
  // 1. Per-user access isolation
  // 2. Easy cleanup when user is deleted
  // 3. S3 prefix-based event filtering
  const s3Key = `users/${userId}/original/${imageId}.${extension}`;

  // Generate presigned URL
  const s3Client = await getS3Client();
  const command = new PutObjectCommand({
    Bucket: RAW_BUCKET,
    Key: s3Key,
    ContentType: contentType,
    ContentLength: fileSize,
    Metadata: {
      'image-id': imageId,
      'user-id': userId,
      'original-filename': encodeURIComponent(filename),
    },
    // Server-side encryption
    ServerSideEncryption: 'AES256',
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: PRESIGNED_EXPIRY,
  });

  // Create DynamoDB record with status=UPLOADING
  const docClient = await getDocClient();
  const sk = `IMG#${datePrefix}#${imageId}`;

  await docClient.send(new PutCommand({
    TableName: IMAGE_TABLE,
    Item: {
      PK: `USER#${userId}`,
      SK: sk,
      imageId,
      userId,
      originalFilename: filename,
      mimeType: contentType,
      fileSize,
      originalKey: s3Key,
      status: 'UPLOADING',
      moderationStatus: 'PENDING',
      visibility: 'PRIVATE',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      // GSI2 for moderation queue
      GSI2PK: 'MOD#PENDING',
      GSI2SK: now.toISOString(),
    },
    // Ensure we don't overwrite an existing item
    ConditionExpression: 'attribute_not_exists(PK)',
  }));

  // Update user quota (atomic increment)
  await updateUserQuota(userId, fileSize);

  console.info('Presigned URL generated', { imageId, userId, s3Key, fileSize });

  return jsonResponse(200, {
    success: true,
    data: {
      imageId,
      uploadUrl,
      key: s3Key,
      expiresIn: PRESIGNED_EXPIRY,
    },
  });
}

/**
 * Check if user has remaining quota for uploads
 */
async function checkUserQuota(
  userId: string,
  fileSize: number,
): Promise<{ allowed: boolean; reason?: string }> {
  const docClient = await getDocClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  try {
    const result = await docClient.send(new GetCommand({
      TableName: QUOTA_TABLE,
      Key: {
        PK: `USER#${userId}`,
        SK: 'QUOTA#MONTHLY',
      },
    }));

    if (result.Item) {
      const quota = result.Item;

      // Check if we're in a new month — reset counter
      if (quota.periodStart < monthStart) {
        return { allowed: true }; // Will be reset on update
      }

      // Check upload count
      const maxCount = quota.maxCount || 1000;
      if (quota.currentCount >= maxCount) {
        return { allowed: false, reason: `Monthly upload limit reached (${maxCount} images)` };
      }

      // Check storage
      const maxStorage = quota.maxStorageBytes || 5 * 1024 * 1024 * 1024;
      if ((quota.currentStorageBytes || 0) + fileSize > maxStorage) {
        return {
          allowed: false,
          reason: `Storage limit exceeded (${(maxStorage / (1024 * 1024 * 1024)).toFixed(1)} GB)`,
        };
      }
    }
  } catch (error) {
    // If quota table doesn't exist or item not found, allow (first-time user)
    console.warn('Quota check failed, allowing upload', { error });
  }

  return { allowed: true };
}

/**
 * Atomically increment user's upload count and storage usage
 */
async function updateUserQuota(userId: string, fileSize: number): Promise<void> {
  const docClient = await getDocClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  try {
    await docClient.send(new UpdateCommand({
      TableName: QUOTA_TABLE,
      Key: {
        PK: `USER#${userId}`,
        SK: 'QUOTA#MONTHLY',
      },
      UpdateExpression: `
        SET currentCount = if_not_exists(currentCount, :zero) + :one,
            currentStorageBytes = if_not_exists(currentStorageBytes, :zero) + :fileSize,
            maxCount = if_not_exists(maxCount, :maxCount),
            maxStorageBytes = if_not_exists(maxStorageBytes, :maxStorage),
            periodStart = if_not_exists(periodStart, :periodStart),
            updatedAt = :now
      `,
      ExpressionAttributeValues: {
        ':zero': 0,
        ':one': 1,
        ':fileSize': fileSize,
        ':maxCount': 1000,
        ':maxStorage': 5 * 1024 * 1024 * 1024,
        ':periodStart': monthStart,
        ':now': now.toISOString(),
      },
    }));
  } catch (error) {
    console.error('Failed to update quota', { error, userId });
    // Non-blocking: don't fail the upload if quota tracking fails
  }
}
