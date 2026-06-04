import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
  rawBucket: s3.Bucket;
  processedBucket: s3.Bucket;
  imageTable: dynamodb.Table;
  userQuotaTable: dynamodb.Table;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  distribution: cloudfront.Distribution;
}

export class ApiStack extends cdk.Stack {
  public readonly apiHandlerFunction: lambda.Function;
  public readonly imageProcessorFunction: lambda.Function;
  public readonly aiAnalyzerFunction: lambda.Function;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const {
      projectName, environment,
      rawBucket, processedBucket,
      imageTable, userQuotaTable,
      userPool, userPoolClient,
      distribution,
    } = props;

    // Resolve paths to Lambda source code (relative to infrastructure/)
    const backendRoot = path.join(__dirname, '..', '..', '..', 'backend');

    // ─── Common Lambda Environment Variables ────────────────────────
    const commonEnvVars: Record<string, string> = {
      NODE_OPTIONS: '--enable-source-maps',
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1', // Reuse HTTP connections
      POWERTOOLS_SERVICE_NAME: projectName,
      POWERTOOLS_LOG_LEVEL: environment === 'production' ? 'WARN' : 'DEBUG',
      IMAGE_TABLE_NAME: imageTable.tableName,
      USER_QUOTA_TABLE_NAME: userQuotaTable.tableName,
      RAW_BUCKET_NAME: rawBucket.bucketName,
      PROCESSED_BUCKET_NAME: processedBucket.bucketName,
      CLOUDFRONT_DOMAIN: distribution.distributionDomainName,
      ENVIRONMENT: environment,
    };

    // ─── Lambda: Authorizer ─────────────────────────────────────────
    // Validates JWT tokens from Cognito and generates IAM policies
    const authorizerFunction = new lambdaNodejs.NodejsFunction(this, 'AuthorizerFunction', {
      functionName: `${projectName}-Authorizer-${environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64, // Graviton2: 20% cheaper + faster
      handler: 'handler',
      entry: path.join(backendRoot, 'authorizer', 'src', 'index.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        ...commonEnvVars,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        REGION: this.region,
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'es2022',
        // Exclude AWS SDK v3 — already available in Lambda runtime
        externalModules: ['@aws-sdk/*'],
      },
      logRetention: logs.RetentionDays.TWO_WEEKS,
    });

    // ─── Lambda: API Handler ────────────────────────────────────────
    // Handles all REST API requests: CRUD, presigned URLs, search
    this.apiHandlerFunction = new lambdaNodejs.NodejsFunction(this, 'ApiHandlerFunction', {
      functionName: `${projectName}-ApiHandler-${environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'handler',
      entry: path.join(backendRoot, 'api-handler', 'src', 'index.ts'),
      memorySize: 512,
      timeout: cdk.Duration.seconds(15),
      environment: {
        ...commonEnvVars,
        USER_POOL_ID: userPool.userPoolId,
        PRESIGNED_URL_EXPIRY: '900', // 15 minutes
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'es2022',
        externalModules: ['@aws-sdk/*'],
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // IAM: API Handler — Least Privilege
    // Can: create presigned URLs (PutObject), delete objects, CRUD DynamoDB
    rawBucket.grantPut(this.apiHandlerFunction);     // For presigned URL generation
    rawBucket.grantDelete(this.apiHandlerFunction);   // For image deletion
    processedBucket.grantDelete(this.apiHandlerFunction); // Delete processed files too
    imageTable.grantReadWriteData(this.apiHandlerFunction);
    userQuotaTable.grantReadWriteData(this.apiHandlerFunction);

    // ─── Lambda: Image Processor ────────────────────────────────────
    // Triggered by S3 events. Resizes images, extracts EXIF, invokes AI analyzer.
    this.imageProcessorFunction = new lambdaNodejs.NodejsFunction(this, 'ImageProcessorFunction', {
      functionName: `${projectName}-ImageProcessor-${environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'handler',
      entry: path.join(backendRoot, 'image-processor', 'src', 'index.ts'),
      memorySize: 1536, // Sharp needs more memory for image processing
      timeout: cdk.Duration.seconds(120), // Large images may take time
      ephemeralStorageSize: cdk.Size.mebibytes(1024), // 1GB /tmp for image processing
      environment: {
        ...commonEnvVars,
        AI_ANALYZER_FUNCTION_NAME: '', // Will be set after AI analyzer is created
        THUMBNAIL_WIDTH: '200',
        THUMBNAIL_HEIGHT: '200',
        RESIZED_MAX_WIDTH: '1920',
        RESIZED_MAX_HEIGHT: '1080',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'es2022',
        externalModules: ['@aws-sdk/*'],
        // Sharp needs native binaries — install for Lambda's Linux ARM64
        nodeModules: ['sharp'],
        forceDockerBundling: false,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // IAM: Image Processor — Least Privilege
    // Can: read raw images, write processed images, update DynamoDB status
    rawBucket.grantRead(this.imageProcessorFunction);
    processedBucket.grantPut(this.imageProcessorFunction);
    imageTable.grantReadWriteData(this.imageProcessorFunction);

    // Import the raw bucket to avoid circular dependency
    const rawBucketImported = s3.Bucket.fromBucketAttributes(this, 'ImportedRawBucket', {
      bucketName: rawBucket.bucketName,
      bucketArn: rawBucket.bucketArn,
    });

    // S3 Event Notification: Trigger Image Processor on new upload
    rawBucketImported.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.imageProcessorFunction),
      {
        prefix: 'users/', // Only trigger for user uploads, not system files
        suffix: undefined, // All file types (validation happens in Lambda)
      },
    );

    // ─── Lambda: AI Analyzer ────────────────────────────────────────
    // Called asynchronously by Image Processor. Runs Rekognition analysis.
    this.aiAnalyzerFunction = new lambdaNodejs.NodejsFunction(this, 'AiAnalyzerFunction', {
      functionName: `${projectName}-AiAnalyzer-${environment}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'handler',
      entry: path.join(backendRoot, 'ai-analyzer', 'src', 'index.ts'),
      memorySize: 512,
      timeout: cdk.Duration.seconds(60), // Rekognition can be slow
      environment: commonEnvVars,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'es2022',
        externalModules: ['@aws-sdk/*'],
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // IAM: AI Analyzer — Least Privilege
    // Can: read raw images (for Rekognition), call Rekognition, update DynamoDB
    rawBucket.grantRead(this.aiAnalyzerFunction);
    imageTable.grantReadWriteData(this.aiAnalyzerFunction);

    // Rekognition permissions (no resource-level restrictions available)
    this.aiAnalyzerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'rekognition:DetectLabels',
        'rekognition:DetectModerationLabels',
      ],
      resources: ['*'], // Rekognition doesn't support resource-level policies
    }));

    // Image Processor can invoke AI Analyzer asynchronously
    this.aiAnalyzerFunction.grantInvoke(this.imageProcessorFunction);

    // Update Image Processor's env with AI Analyzer function name
    // (We couldn't set it earlier because the function didn't exist yet)
    this.imageProcessorFunction.addEnvironment(
      'AI_ANALYZER_FUNCTION_NAME',
      this.aiAnalyzerFunction.functionName,
    );

    // ─── API Gateway ────────────────────────────────────────────────
    // REST API with Cognito Authorizer
    const logGroup = new logs.LogGroup(this, 'ApiGatewayAccessLogs', {
      logGroupName: `/aws/apigateway/${projectName}-${environment}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.api = new apigateway.RestApi(this, 'RestApi', {
      restApiName: `${projectName}-API-${environment}`,
      description: `${projectName} REST API - ${environment}`,

      // Deploy to a stage
      deployOptions: {
        stageName: environment === 'production' ? 'prod' : 'dev',
        tracingEnabled: true, // X-Ray tracing
        accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
        // Throttling: Protect against abuse
        throttlingRateLimit: 1000,  // requests per second
        throttlingBurstLimit: 500,  // burst capacity
        metricsEnabled: true,
      },

      // CORS configuration
      defaultCorsPreflightOptions: {
        allowOrigins: environment === 'production'
          ? ['https://your-domain.com'] // TODO: Replace with actual domain
          : ['http://localhost:5173', 'http://localhost:3000'],
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        allowCredentials: true,
        maxAge: cdk.Duration.hours(1),
      },

      // Binary media types (for potential future image proxy)
      binaryMediaTypes: ['image/*'],

      // Endpoint type: REGIONAL (best for Singapore region)
      endpointTypes: [apigateway.EndpointType.REGIONAL],
    });

    // ─── Cognito Authorizer ─────────────────────────────────────────
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: `${projectName}-CognitoAuth-${environment}`,
      identitySource: 'method.request.header.Authorization',
    });

    // Default method options (require auth)
    const authMethodOptions: apigateway.MethodOptions = {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // Lambda integration
    const apiIntegration = new apigateway.LambdaIntegration(this.apiHandlerFunction, {
      proxy: true, // Lambda proxy integration — pass full request to handler
    });

    // ─── API Routes ─────────────────────────────────────────────────
    const v1 = this.api.root.addResource('v1');

    // --- Auth routes (Public) ---
    const auth = v1.addResource('auth');
    const signup = auth.addResource('signup');
    signup.addMethod('POST', apiIntegration); // No auth required

    const login = auth.addResource('login');
    login.addMethod('POST', apiIntegration);

    const refresh = auth.addResource('refresh');
    refresh.addMethod('POST', apiIntegration);

    // --- Image routes (Authenticated) ---
    const images = v1.addResource('images');
    images.addMethod('GET', apiIntegration, authMethodOptions);    // List images

    const presignedUrl = images.addResource('presigned-url');
    presignedUrl.addMethod('POST', apiIntegration, authMethodOptions); // Get upload URL

    const search = images.addResource('search');
    search.addMethod('GET', apiIntegration, authMethodOptions);   // Search by tag

    const imageById = images.addResource('{imageId}');
    imageById.addMethod('GET', apiIntegration, authMethodOptions);    // Get image detail
    imageById.addMethod('DELETE', apiIntegration, authMethodOptions); // Delete image
    imageById.addMethod('PATCH', apiIntegration, authMethodOptions);  // Update image

    const download = imageById.addResource('download');
    download.addMethod('GET', apiIntegration, authMethodOptions); // Download URL

    // --- Admin routes (Authenticated + admin group check in Lambda) ---
    const admin = v1.addResource('admin');
    const moderation = admin.addResource('moderation');
    moderation.addMethod('GET', apiIntegration, authMethodOptions); // List flagged

    const moderateById = moderation.addResource('{imageId}');
    moderateById.addMethod('POST', apiIntegration, authMethodOptions); // Approve/reject

    // ─── API Gateway Request Validators ─────────────────────────────
    const bodyValidator = new apigateway.RequestValidator(this, 'BodyValidator', {
      restApi: this.api,
      requestValidatorName: 'validate-body',
      validateRequestBody: true,
      validateRequestParameters: false,
    });

    // ─── Outputs ────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.url,
      description: 'API Gateway endpoint URL',
      exportName: `${projectName}-${environment}-ApiUrl`,
    });

    new cdk.CfnOutput(this, 'ApiHandlerFunctionName', {
      value: this.apiHandlerFunction.functionName,
      description: 'API Handler Lambda function name',
    });

    new cdk.CfnOutput(this, 'ImageProcessorFunctionName', {
      value: this.imageProcessorFunction.functionName,
      description: 'Image Processor Lambda function name',
    });

    new cdk.CfnOutput(this, 'AiAnalyzerFunctionName', {
      value: this.aiAnalyzerFunction.functionName,
      description: 'AI Analyzer Lambda function name',
    });
  }
}
