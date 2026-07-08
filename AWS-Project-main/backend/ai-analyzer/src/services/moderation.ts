import {
  RekognitionClient,
  DetectModerationLabelsCommand,
  type DetectModerationLabelsResponse,
} from '@aws-sdk/client-rekognition';

/**
 * Rekognition Content Moderation Service
 * 
 * Uses Amazon Rekognition to detect potentially unsafe or inappropriate
 * content in images. This is critical for user-generated content platforms.
 * 
 * Categories detected include:
 * - Explicit Nudity
 * - Suggestive
 * - Violence
 * - Visually Disturbing
 * - Drugs
 * - Tobacco
 * - Alcohol
 * - Gambling
 * - Hate Symbols
 */

const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});

/**
 * Detect moderation labels in an image stored in S3
 * 
 * @param bucket - S3 bucket name
 * @param key - S3 object key
 * @param minConfidence - Minimum confidence threshold (default 60%)
 * @returns Rekognition DetectModerationLabels response
 */
export async function detectModeration(
  bucket: string,
  key: string,
  minConfidence: number = 60,
): Promise<DetectModerationLabelsResponse> {
  const command = new DetectModerationLabelsCommand({
    Image: {
      S3Object: {
        Bucket: bucket,
        Name: key,
      },
    },
    MinConfidence: minConfidence,
  });

  try {
    const response = await rekognitionClient.send(command);

    console.info('DetectModerationLabels response', {
      labelCount: response.ModerationLabels?.length || 0,
      labels: response.ModerationLabels?.map(l => ({
        name: l.Name,
        parent: l.ParentName,
        confidence: l.Confidence?.toFixed(1),
      })),
    });

    return response;
  } catch (error) {
    console.error('Rekognition DetectModerationLabels failed', {
      bucket,
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
