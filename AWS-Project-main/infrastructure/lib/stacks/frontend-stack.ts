import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import * as path from 'path';

export interface FrontendStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
  api: apigateway.RestApi;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { projectName, environment, api, userPool, userPoolClient } = props;
    const nameSuffix = `${projectName}-${environment}`.toLowerCase();

    // ─── S3 Bucket: Frontend Hosting ────────────────────────────────
    const websiteBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `${nameSuffix}-frontend-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: environment === 'production'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'production',
    });

    // ─── CloudFront Distribution with OAC ───────────────────────────
    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      comment: `${projectName} ${environment} - Frontend App`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      // Since it's an SPA (React/Vite), redirect 403/404 to index.html
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    // ─── Dynamic Config & Bucket Deployment ─────────────────────────
    // Generates a config.js file containing backend environment variables
    const configJsContent = `
window.API_URL = "${api.url}";
window.COGNITO_USER_POOL_ID = "${userPool.userPoolId}";
window.COGNITO_CLIENT_ID = "${userPoolClient.userPoolClientId}";
window.COGNITO_REGION = "${this.region}";
    `.trim();

    new s3deploy.BucketDeployment(this, 'DeployFrontendApp', {
      sources: [
        // Source 1: The built React app (assumes `npm run build` was run first)
        s3deploy.Source.asset(path.join(__dirname, '..', '..', '..', 'frontend', 'dist')),
        // Source 2: The dynamically generated config.js file
        s3deploy.Source.data('config.js', configJsContent),
      ],
      destinationBucket: websiteBucket,
      distribution: distribution, // Invalidate CloudFront cache on deploy
      distributionPaths: ['/*'],
    });

    // ─── Outputs ────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'Frontend Application URL',
      exportName: `${projectName}-${environment}-FrontendUrl`,
    });
  }
}
