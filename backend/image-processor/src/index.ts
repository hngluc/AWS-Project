import type { S3Event, S3EventRecord, Context } from 'aws-lambda';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { generateThumbnail, generateResized } from './processors/thumbnail';
import { extractMetadata } from './processors/metadata';
import { validateMagicBytes } from './validators/fileType';

/**
 * Image Processor Lambda — S3 Event-Driven
 * 
 * Triggered by S3 ObjectCreated events on the raw images bucket.
 * 
 * Processing pipeline:
 * 1. Validate file type (magic bytes check)
 * 2. Extract EXIF metadata
 * 3. Generate thumbnail (200x200 WebP)
 * 4. Generate resized version (max 1920x1080 WebP)
 * 5. Upload processed images to processed bucket
 * 6. Update DynamoDB status → PROCESSING → ANALYZING
 * 7. Invoke AI Analyzer Lambda asynchronously
 */

// ─── Clients (initialized outside handler for connection reuse) ──
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const ddbClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION }),
  { marshallOptions: { removeUndefinedValues: true } },
);
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION });

// ─── Constants ──────────────────────────────────────────────────
const PROCESSED_BUCKET = process.env.PROCESSED_BUCKET_NAME!;
const IMAGE_TABLE = process.env.IMAGE_TABLE_NAME!;
const AI_ANALYZER_FUNCTION = process.env.AI_ANALYZER_FUNCTION_NAME!;
const THUMBNAIL_WIDTH = parseInt(process.env.THUMBNAIL_WIDTH || '200', 10);
const THUMBNAIL_HEIGHT = parseInt(process.env.THUMBNAIL_HEIGHT || '200', 10);
const RESIZED_MAX_WIDTH = parseInt(process.env.RESIZED_MAX_WIDTH || '1920', 10);
const RESIZED_MAX_HEIGHT = parseInt(process.env.RESIZED_MAX_HEIGHT || '1080', 10);

export const handler = async (event: S3Event, context: Context): Promise<void> => {
  context.callbackWaitsForEmptyEventLoop = false;

  console.info('Image Processor invoked', {
    recordCount: event.Records.length,
    requestId: context.awsRequestId,
  });

  // Process each S3 event record
  // In practice, usually only 1 record per invocation
  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      console.error('Failed to process record', {
        key: record.s3.object.key,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Try to update status to FAILED in DynamoDB
      await updateStatusToFailed(record.s3.object.key, error);
    }
  }
};

async function processRecord(record: S3EventRecord): Promise<void> {
  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
  const size = record.s3.object.size;

  console.info('Processing image', { bucket, key, size });

  // Parse userId and imageId from the S3 key
  // Expected format: users/<userId>/original/<imageId>.<ext>
  const keyParts = key.split('/');
  if (keyParts.length < 4 || keyParts[0] !== 'users' || keyParts[2] !== 'original') {
    console.warn('Skipping non-user-upload key', { key });
    return;
  }

  const userId = keyParts[1];
  const filename = keyParts[3];
  const imageId = filename.split('.')[0]; // Remove extension

  // Step 1: Download the original image from S3
  const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
  const s3Response = await s3Client.send(getCommand);

  if (!s3Response.Body) {
    throw new Error(`Empty body from S3 for key: ${key}`);
  }

  // Convert stream to Buffer
  const chunks: Uint8Array[] = [];
  const stream = s3Response.Body as any;
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const imageBuffer = Buffer.concat(chunks);

  console.info('Image downloaded', { key, bufferSize: imageBuffer.length });

  // Step 2: Validate magic bytes (file type security check)
  const detectedType = validateMagicBytes(imageBuffer);
  if (!detectedType) {
    console.error('Invalid file type detected', { key });
    throw new Error('File type validation failed: not a valid image');
  }

  console.info('Magic bytes validated', { key, detectedType });

  // Step 3: Update status to PROCESSING
  const dbItem = await findImageRecord(userId, imageId);
  if (dbItem) {
    await updateImageStatus(dbItem.PK, dbItem.SK, 'PROCESSING');
  }

  // Step 4: Extract EXIF metadata
  const metadata = await extractMetadata(imageBuffer);
  console.info('Metadata extracted', { key, dimensions: metadata.dimensions });

  // Step 5: Generate thumbnail (200x200, cover crop, WebP)
  const thumbnailKey = `users/${userId}/thumbnails/${imageId}.webp`;
  const thumbnailBuffer = await generateThumbnail(imageBuffer, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

  await s3Client.send(new PutObjectCommand({
    Bucket: PROCESSED_BUCKET,
    Key: thumbnailKey,
    Body: thumbnailBuffer,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable', // 1 year cache
    ServerSideEncryption: 'AES256',
  }));

  console.info('Thumbnail uploaded', { thumbnailKey, size: thumbnailBuffer.length });

  // Step 6: Generate resized version (max 1920x1080, WebP)
  const resizedKey = `users/${userId}/resized/${imageId}.webp`;
  const resizedBuffer = await generateResized(imageBuffer, RESIZED_MAX_WIDTH, RESIZED_MAX_HEIGHT);

  await s3Client.send(new PutObjectCommand({
    Bucket: PROCESSED_BUCKET,
    Key: resizedKey,
    Body: resizedBuffer,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
    ServerSideEncryption: 'AES256',
  }));

  console.info('Resized image uploaded', { resizedKey, size: resizedBuffer.length });

  // Step 7: Update DynamoDB with processed image info
  if (dbItem) {
    await ddbClient.send(new UpdateCommand({
      TableName: IMAGE_TABLE,
      Key: { PK: dbItem.PK, SK: dbItem.SK },
      UpdateExpression: `
        SET #status = :status,
            thumbnailKey = :thumbnailKey,
            resizedKey = :resizedKey,
            dimensions = :dimensions,
            exifData = :exifData,
            updatedAt = :now
      `,
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'ANALYZING',
        ':thumbnailKey': thumbnailKey,
        ':resizedKey': resizedKey,
        ':dimensions': metadata.dimensions,
        ':exifData': metadata.exif || {},
        ':now': new Date().toISOString(),
      },
    }));
  }

  // Step 8: Invoke AI Analyzer asynchronously
  console.info('Invoking AI Analyzer', { imageId, bucket, key });

  await lambdaClient.send(new InvokeCommand({
    FunctionName: AI_ANALYZER_FUNCTION,
    InvocationType: 'Event', // Async invocation — don't wait for response
    Payload: Buffer.from(JSON.stringify({
      bucket,
      key,
      imageId,
      userId,
      tableName: IMAGE_TABLE,
      pk: dbItem?.PK,
      sk: dbItem?.SK,
    })),
  }));

  console.info('Image processing complete', { imageId, userId });
}

/**
 * Find image record in DynamoDB by userId and imageId
 */
async function findImageRecord(userId: string, imageId: string) {
  const result = await ddbClient.send(new QueryCommand({
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

  return result.Items?.[0] || null;
}

/**
 * Update image status in DynamoDB
 */
async function updateImageStatus(pk: string, sk: string, status: string) {
  await ddbClient.send(new UpdateCommand({
    TableName: IMAGE_TABLE,
    Key: { PK: pk, SK: sk },
    UpdateExpression: 'SET #status = :status, updatedAt = :now',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': status,
      ':now': new Date().toISOString(),
    },
  }));
}

/**
 * Update status to FAILED with error details
 */
async function updateStatusToFailed(s3Key: string, error: unknown) {
  try {
    const keyParts = s3Key.split('/');
    if (keyParts.length < 4) return;

    const userId = keyParts[1];
    const imageId = keyParts[3].split('.')[0];
    const dbItem = await findImageRecord(userId, imageId);

    if (dbItem) {
      await ddbClient.send(new UpdateCommand({
        TableName: IMAGE_TABLE,
        Key: { PK: dbItem.PK, SK: dbItem.SK },
        UpdateExpression: 'SET #status = :status, errorMessage = :error, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'FAILED',
          ':error': error instanceof Error ? error.message : String(error),
          ':now': new Date().toISOString(),
        },
      }));
    }
  } catch (updateError) {
    console.error('Failed to update FAILED status', { updateError });
  }
}
