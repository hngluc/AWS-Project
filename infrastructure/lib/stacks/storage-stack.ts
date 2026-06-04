import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface StorageStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
}

export class StorageStack extends cdk.Stack {
  public readonly rawBucket: s3.Bucket;
  public readonly processedBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { projectName, environment } = props;
    const nameSuffix = `${projectName}-${environment}`.toLowerCase();

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
          allowedOrigins: environment === 'production'
            ? ['https://your-domain.com'] // TODO: Replace with actual domain
            : ['http://localhost:5173', 'http://localhost:3000'],
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
    // Stores thumbnails and resized images. Served via CloudFront ONLY.
    this.processedBucket = new s3.Bucket(this, 'ProcessedImageBucket', {
      bucketName: `${nameSuffix}-processed-images-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // No lifecycle transitions — these are frequently accessed via CDN
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

    // ─── CloudFront Distribution with OAC ───────────────────────────
    // Origin Access Control (OAC) — newer and more secure than OAI
    // CloudFront signs requests to S3 using SigV4
    const oac = new cloudfront.CfnOriginAccessControl(this, 'ProcessedBucketOAC', {
      originAccessControlConfig: {
        name: `${nameSuffix}-processed-oac`,
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
        description: 'OAC for processed images bucket',
      },
    });

    // CloudFront Distribution
    this.distribution = new cloudfront.Distribution(this, 'CDNDistribution', {
      comment: `${projectName} ${environment} - Image CDN`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.processedBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        compress: true, // Enable Gzip/Brotli compression
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT,
      },
      // Price class: Use only edge locations in Asia, Europe, North America
      // (cheapest option that covers Vietnam)
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      // Enable HTTP/2 and HTTP/3 for better performance
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      // Minimum TLS version
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      // Custom error responses — return 404 instead of XML error for missing images
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: undefined,
          ttl: cdk.Duration.seconds(10),
        },
      ],
    });

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

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
      exportName: `${projectName}-${environment}-CloudFrontDomain`,
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
      exportName: `${projectName}-${environment}-CloudFrontDistId`,
    });
  }
}
