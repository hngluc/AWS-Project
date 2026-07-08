import type { S3Event, S3EventRecord, Context } from 'aws-lambda';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';
import { getThumbnailTransform, getResizedTransform } from './processors/thumbnail';
import sharp from 'sharp';
import { Upload } from '@aws-sdk/lib-storage';
import { PassThrough, Readable } from 'stream';

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
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  requestHandler: new NodeHttpHandler({ httpsAgent: agent }),
});

const ddbClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.AWS_REGION,
    requestHandler: new NodeHttpHandler({ httpsAgent: agent }),
  }),
  { marshallOptions: { removeUndefinedValues: true } },
);

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION,
  requestHandler: new NodeHttpHandler({ httpsAgent: agent }),
});

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

  // ★ CRITICAL: Re-entrance guard — prevent infinite loops
  // If this Lambda accidentally receives events from the processed bucket,
  // skip immediately to avoid infinite S3 → Lambda → S3 invocation chains.
  if (bucket === PROCESSED_BUCKET) {
    console.warn('INFINITE LOOP GUARD: Ignoring event from processed bucket', { bucket, key });
    return;
  }

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

  // ★ IDEMPOTENCY GUARD: Only process images with UPLOADING status.
  // S3 delivers events at-least-once, so duplicates are possible.
  // If the image is already PROCESSING/ANALYZING/COMPLETED, skip it.
  const dbItem = await findImageRecord(userId, imageId);
  if (dbItem && dbItem.status !== 'UPLOADING') {
    console.warn('Idempotency guard: image already processed or processing', {
      imageId,
      currentStatus: dbItem.status,
    });
    return;
  }

  // Step 1: Download the original image from S3
  const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
  const s3Response = await s3Client.send(getCommand);

  if (!s3Response.Body) {
    throw new Error(`Empty body from S3 for key: ${key}`);
  }

  // Update status to PROCESSING before starting the stream
  if (dbItem) {
    await updateImageStatus(dbItem.PK, dbItem.SK, 'PROCESSING');
  }

  const s3DownloadStream = s3Response.Body as Readable;

  // Setup Sharp streams
  const metadataTransform = sharp();
  const thumbnailTransform = getThumbnailTransform(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  const resizedTransform = getResizedTransform(RESIZED_MAX_WIDTH, RESIZED_MAX_HEIGHT);

  // Split the S3 download stream into the 3 processing pipelines
  s3DownloadStream.pipe(metadataTransform);
  s3DownloadStream.pipe(thumbnailTransform);
  s3DownloadStream.pipe(resizedTransform);

  // 1. Extract metadata (this also validates the file type implicitly)
  let metadata;
  try {
    metadata = await metadataTransform.metadata();
  } catch (err) {
    console.error('Invalid file type or corrupted image detected', { key });
    throw new Error('File type validation failed: not a valid image');
  }
  
  // Format dimensions (fallback to 0)
  const dimensions = { width: metadata.width || 0, height: metadata.height || 0 };
  console.info('Metadata extracted via stream', { key, dimensions });

  // 2. Upload Thumbnail via Stream
  const thumbnailKey = `users/${userId}/thumbnails/${imageId}.webp`;
  const uploadThumbnail = new Upload({
    client: s3Client,
    params: {
      Bucket: PROCESSED_BUCKET,
      Key: thumbnailKey,
      Body: thumbnailTransform,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
      ServerSideEncryption: 'AES256',
    },
  });

  // 3. Upload Resized via Stream
  const resizedKey = `users/${userId}/resized/${imageId}.webp`;
  const uploadResized = new Upload({
    client: s3Client,
    params: {
      Bucket: PROCESSED_BUCKET,
      Key: resizedKey,
      Body: resizedTransform,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
      ServerSideEncryption: 'AES256',
    },
  });

  // Wait for both streaming uploads to finish
  await Promise.all([
    uploadThumbnail.done(),
    uploadResized.done()
  ]);

  console.info('Streaming resize and upload complete', { thumbnailKey, resizedKey });

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
        ':dimensions': dimensions,
        ':exifData': {}, // Extracted later or via separate EXIF parser stream
        ':now': new Date().toISOString(),
      },
    }));
  }

  // Step 8 (Removed): AI Analyzer is now triggered asynchronously via DynamoDB Streams
  // when the status is updated to 'ANALYZING' in Step 7.
  
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
    // No Limit — DynamoDB applies Limit BEFORE FilterExpression
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
