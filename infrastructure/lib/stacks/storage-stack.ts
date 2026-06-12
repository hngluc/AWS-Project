import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface StorageStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
}

export class StorageStack extends cdk.Stack {
  public readonly rawBucket: s3.Bucket;
  public readonly processedBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { projectName, environment } = props;
    const nameSuffix = `${projectName}-${environment}`.toLowerCase();
    const frontendDomain = this.node.tryGetContext('frontendDomain') || '';
    const allowedOrigins = environment === 'production' && frontendDomain
      ? [frontendDomain]
      : ['http://localhost:5173', 'http://localhost:3000'];

    // ─── S3 Bucket: Raw Images ──────────────────────────────────────
    // Stores original uploaded images. NOT publicly accessible.
    // Lifecycle: Standard → IA (90 days) → Glacier (365 days)
    this.rawBucket = new s3.Bucket(this, 'RawImageBucket', {
      bucketName: `${nameSuffix}-raw-images-${this.account}`,
      // Security: Block ALL public access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // Encryption at rest (SSE-S3)
      encryption: s3.BucketEncryption.S3_MANAGED,
      // Enable versioning for accidental delete recovery
      versioned: true,
      // Enforce SSL for all requests
      enforceSSL: true,
      // CORS: Allow frontend to upload via presigned URL
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: allowedOrigins,
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3600,
        },
      ],
      // Lifecycle rules: cost optimization
      lifecycleRules: [
        {
          id: 'TransitionToIA',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
        },
        {
          // Clean up incomplete multipart uploads after 7 days
          id: 'AbortIncompleteMultipart',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
        {
          // Delete non-current versions after 30 days (cost control)
          id: 'DeleteOldVersions',
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
      // Auto-delete for non-production environments
      removalPolicy: environment === 'production'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'production',
    });

    // ─── S3 Bucket: Processed Images ────────────────────────────────
    // Stores thumbnails and resized images. Accessed via presigned URLs.
    this.processedBucket = new s3.Bucket(this, 'ProcessedImageBucket', {
      bucketName: `${nameSuffix}-processed-images-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: allowedOrigins,
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          id: 'AbortIncompleteMultipart',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
      removalPolicy: environment === 'production'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'production',
    });

    // ─── NOTE: CloudFront Distribution ──────────────────────────────
    // CloudFront is temporarily disabled because the AWS account has not
    // been verified for CloudFront access yet. Once verified, re-enable
    // by uncommenting the CloudFront section and adding:
    //   public readonly distribution: cloudfront.Distribution;
    // See: https://console.aws.amazon.com/support/home#/

    // ─── Outputs ────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'RawBucketName', {
      value: this.rawBucket.bucketName,
      description: 'Name of the raw images S3 bucket',
      exportName: `${projectName}-${environment}-RawBucketName`,
    });

    new cdk.CfnOutput(this, 'ProcessedBucketName', {
      value: this.processedBucket.bucketName,
      description: 'Name of the processed images S3 bucket',
      exportName: `${projectName}-${environment}-ProcessedBucketName`,
    });
  }
}
