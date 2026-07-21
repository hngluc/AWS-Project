import type { Context, DynamoDBStreamEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';
import { detectLabels } from './services/labeling';
import { detectModeration } from './services/moderation';
import { mapToAiTags, mapToModerationLabels, determineModerationStatus } from './mappers/tagMapper';

/**
 * AI Analyzer Lambda — DynamoDB Stream Event-Driven
 */

// ─── Clients (connection reuse with Keep-Alive) ─────────────────
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
});

const ddbClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.AWS_REGION,
    requestHandler: new NodeHttpHandler({ httpsAgent: agent }),
  }),
  { marshallOptions: { removeUndefinedValues: true } },
);

const IMAGE_TABLE = process.env.IMAGE_TABLE_NAME!;
const RAW_BUCKET = process.env.RAW_BUCKET_NAME!;

export const handler = async (event: DynamoDBStreamEvent, context: Context): Promise<void> => {
  context.callbackWaitsForEmptyEventLoop = false;

  console.info('AI Analyzer invoked via DynamoDB Stream', {
    recordCount: event.Records.length,
    requestId: context.awsRequestId,
  });

  for (const record of event.Records) {
    if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') {
      continue;
    }

    if (!record.dynamodb?.NewImage) continue;

    // Unmarshall DynamoDB image to normal JS object
    const newImage = unmarshall(record.dynamodb.NewImage as any);

    // Only process images that have just transitioned to ANALYZING status
    if (newImage.status !== 'ANALYZING') {
      continue;
    }

    // Skip if already analyzed (idempotency guard)
    if (newImage.aiTags && newImage.moderationStatus) {
      continue;
    }

    const { imageId, userId, originalKey, PK, SK } = newImage;
    if (!imageId || !originalKey || !PK || !SK) {
      console.warn('Missing required attributes in stream record', { imageId });
      continue;
    }

    const bucket = RAW_BUCKET;
    const key = originalKey;

    try {
      console.info('Starting AI Analysis', { imageId, bucket, key });

      // Step 1: Detect labels
      const labelsResponse = await detectLabels(bucket, key);

      // Step 2: Detect moderation labels
      const moderationResponse = await detectModeration(bucket, key);

      // Step 3: Map responses to our schema
      const aiTags = mapToAiTags(labelsResponse);
      const moderationLabels = mapToModerationLabels(moderationResponse);
      const moderationStatus = determineModerationStatus(moderationLabels);

      console.info('AI Analysis complete', {
        imageId,
        tagCount: aiTags.length,
        moderationStatus,
        topTags: aiTags.slice(0, 5).map(t => t.name),
      });

      // Step 4: Update main image record with AI results
      await ddbClient.send(new UpdateCommand({
        TableName: IMAGE_TABLE,
        Key: { PK, SK },
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
      const significantTags = aiTags.filter(tag => tag.confidence >= 70);

      if (significantTags.length > 0) {
        const batches = chunkArray(significantTags, 25);
        for (const batch of batches) {
          await ddbClient.send(new BatchWriteCommand({
            RequestItems: {
              [IMAGE_TABLE]: batch.map(tag => ({
                PutRequest: {
                  Item: {
                    PK: `TAG#${tag.name}`,
                    SK: `IMG#${imageId}`,
                    GSI1PK: `TAG#${tag.name}`,
                    GSI1SK: `IMG#${imageId}`,
                    imagePK: PK,
                    imageSK: SK,
                    imageId,
                    userId,
                    confidence: tag.confidence,
                    createdAt: new Date().toISOString(),
                  },
                },
              })),
            },
          }));
        }
      }

      console.info('AI Analyzer completed successfully for record', { imageId });

    } catch (error) {
      console.error('AI Analyzer failed for record', {
        imageId,
        error: error instanceof Error ? error.message : String(error),
      });

      try {
        await ddbClient.send(new UpdateCommand({
          TableName: IMAGE_TABLE,
          Key: { PK, SK },
          UpdateExpression: `
            SET #status = :status,
                aiAnalysisError = :error,
                moderationStatus = :modStatus,
                updatedAt = :now
          `,
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': 'COMPLETED',
            ':error': error instanceof Error ? error.message : String(error),
            ':modStatus': 'PENDING',
            ':now': new Date().toISOString(),
          },
        }));
      } catch (updateError) {
        console.error('Failed to update error status', { updateError });
      }
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
