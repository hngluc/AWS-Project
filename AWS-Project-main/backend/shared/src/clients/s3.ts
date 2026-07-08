import { S3Client } from '@aws-sdk/client-s3';

/**
 * S3 Client Singleton
 * 
 * Reuses the same client instance across Lambda invocations.
 * Connection reuse is enabled via AWS_NODEJS_CONNECTION_REUSE_ENABLED env var.
 */

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});

export { s3Client };
