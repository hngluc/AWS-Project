import {
  RekognitionClient,
  DetectLabelsCommand,
  type DetectLabelsResponse,
} from '@aws-sdk/client-rekognition';

/**
 * Rekognition Label Detection Service
 * 
 * Uses Amazon Rekognition to detect objects, scenes, activities, and concepts
 * in an image. Returns up to maxLabels labels with confidence scores.
 * 
 * Rekognition reads the image directly from S3 (no download needed),
 * which is more efficient and avoids Lambda memory pressure.
 */

// Client singleton — reused across invocations
const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});

/**
 * Detect labels in an image stored in S3
 * 
 * @param bucket - S3 bucket name
 * @param key - S3 object key
 * @param maxLabels - Maximum number of labels to return (default 30)
 * @param minConfidence - Minimum confidence threshold (default 50%)
 * @returns Rekognition DetectLabels response
 */
export async function detectLabels(
  bucket: string,
  key: string,
  maxLabels: number = 30,
  minConfidence: number = 50,
): Promise<DetectLabelsResponse> {
  const command = new DetectLabelsCommand({
    Image: {
      S3Object: {
        Bucket: bucket,
        Name: key,
      },
    },
    MaxLabels: maxLabels,
    MinConfidence: minConfidence,
    // Settings for more detailed detection
    Settings: {
      GeneralLabels: {
        // Label categories to include
        LabelInclusionFilters: undefined, // Include all
        LabelExclusionFilters: undefined, // Exclude none
      },
    },
  });

  try {
    const response = await rekognitionClient.send(command);

    console.info('DetectLabels response', {
      labelCount: response.Labels?.length || 0,
      labels: response.Labels?.slice(0, 5).map(l => ({
        name: l.Name,
        confidence: l.Confidence?.toFixed(1),
      })),
    });

    return response;
  } catch (error) {
    console.error('Rekognition DetectLabels failed', {
      bucket,
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
