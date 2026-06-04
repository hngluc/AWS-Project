import type { Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { detectLabels } from './services/labeling';
import { detectModeration } from './services/moderation';
import { mapToAiTags, mapToModerationLabels, determineModerationStatus } from './mappers/tagMapper';

/**
 * AI Analyzer Lambda — Asynchronous Rekognition Analysis
 * 
 * Invoked asynchronously by Image Processor Lambda.
 * 
 * Processing pipeline:
 * 1. Call Rekognition DetectLabels → get object/scene labels
 * 2. Call Rekognition DetectModerationLabels → check for unsafe content
 * 3. Map Rekognition responses to our schema format
 * 4. Determine moderation status (SAFE/FLAGGED)
 * 5. Update DynamoDB with AI tags and moderation results
 * 6. Write tag index items to GSI1 for search
 * 7. Update GSI2 for moderation queue
 */

// ─── Clients (connection reuse) ─────────────────────────────────
const ddbClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION }),
  { marshallOptions: { removeUndefinedValues: true } },
);

const IMAGE_TABLE = process.env.IMAGE_TABLE_NAME!;

// ─── Event payload from Image Processor ─────────────────────────
interface AnalyzerEvent {
  bucket: string;
  key: string;
  imageId: string;
  userId: string;
  tableName: string;
  pk: string;
  sk: string;
}

export const handler = async (event: AnalyzerEvent, context: Context): Promise<void> => {
  context.callbackWaitsForEmptyEventLoop = false;

  console.info('AI Analyzer invoked', {
    imageId: event.imageId,
    bucket: event.bucket,
    key: event.key,
    requestId: context.awsRequestId,
  });

  try {
    // Step 1: Detect labels (objects, scenes, concepts)
    console.info('Calling Rekognition DetectLabels', { bucket: event.bucket, key: event.key });
    const labelsResponse = await detectLabels(event.bucket, event.key);

    // Step 2: Detect moderation labels (unsafe content)
    console.info('Calling Rekognition DetectModerationLabels', { bucket: event.bucket, key: event.key });
    const moderationResponse = await detectModeration(event.bucket, event.key);

    // Step 3: Map responses to our schema
    const aiTags = mapToAiTags(labelsResponse);
    const moderationLabels = mapToModerationLabels(moderationResponse);
    const moderationStatus = determineModerationStatus(moderationLabels);

    console.info('AI Analysis complete', {
      imageId: event.imageId,
      tagCount: aiTags.length,
      moderationLabelCount: moderationLabels.length,
      moderationStatus,
      topTags: aiTags.slice(0, 5).map(t => t.name),
    });

    // Step 4: Update main image record with AI results
    await ddbClient.send(new UpdateCommand({
      TableName: IMAGE_TABLE,
      Key: { PK: event.pk, SK: event.sk },
      UpdateExpression: `
        SET #status = :status,
            aiTags = :aiTags,
            moderationLabels = :moderationLabels,
            moderationStatus = :moderationStatus,
            GSI2PK = :gsi2pk,
            GSI2SK = :gsi2sk,
            updatedAt = :now
      `,
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'COMPLETED',
        ':aiTags': aiTags,
        ':moderationLabels': moderationLabels,
        ':moderationStatus': moderationStatus,
        ':gsi2pk': `MOD#${moderationStatus}`,
        ':gsi2sk': new Date().toISOString(),
        ':now': new Date().toISOString(),
      },
    }));

    // Step 5: Write tag index items for GSI1 search
    // Create separate DynamoDB items for each tag to enable efficient GSI1 queries
    // Only index the top tags (confidence > 70%) to avoid noise
    const significantTags = aiTags.filter(tag => tag.confidence >= 70);

    if (significantTags.length > 0) {
      // BatchWrite supports max 25 items per request
      const batches = chunkArray(significantTags, 25);

      for (const batch of batches) {
        await ddbClient.send(new BatchWriteCommand({
          RequestItems: {
            [IMAGE_TABLE]: batch.map(tag => ({
              PutRequest: {
                Item: {
                  PK: `TAG#${tag.name}`, // Not a user item — tag index item
                  SK: `IMG#${event.imageId}`,
                  GSI1PK: `TAG#${tag.name}`,
                  GSI1SK: `IMG#${event.imageId}`,
                  imageId: event.imageId,
                  userId: event.userId,
                  confidence: tag.confidence,
                  thumbnailKey: undefined, // Will be set separately if needed
                  createdAt: new Date().toISOString(),
                },
              },
            })),
          },
        }));
      }

      console.info('Tag index items written', {
        imageId: event.imageId,
        tagCount: significantTags.length,
      });
    }

    console.info('AI Analyzer completed successfully', {
      imageId: event.imageId,
      moderationStatus,
    });

  } catch (error) {
    console.error('AI Analyzer failed', {
      imageId: event.imageId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Update status to COMPLETED with error flag (don't block the pipeline)
    // The image is still usable even if AI analysis fails
    try {
      await ddbClient.send(new UpdateCommand({
        TableName: IMAGE_TABLE,
        Key: { PK: event.pk, SK: event.sk },
        UpdateExpression: `
          SET #status = :status,
              aiAnalysisError = :error,
              moderationStatus = :modStatus,
              updatedAt = :now
        `,
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'COMPLETED', // Still mark as completed
          ':error': error instanceof Error ? error.message : String(error),
          ':modStatus': 'PENDING', // Needs manual review since AI failed
          ':now': new Date().toISOString(),
        },
      }));
    } catch (updateError) {
      console.error('Failed to update error status', { updateError });
    }
  }
};

/**
 * Split array into chunks of specified size
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}
