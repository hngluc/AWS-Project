import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as path from 'path';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
  rawBucket: s3.Bucket;
  processedBucket: s3.Bucket;
  imageTable: dynamodb.Table;
  userQuotaTable: dynamodb.Table;
  userProfileTable: dynamodb.Table;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
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
      imageTable, userQuotaTable, userProfileTable,
      userPool, userPoolClient,
    } = props;

    const frontendDomain = this.node.tryGetContext('frontendDomain') || '';
    const allowedOrigins = environment === 'production' && frontendDomain
      ? [frontendDomain]
      : ['http://localhost:5173', 'http://localhost:3000'];

    // Resolve paths to Lambda source code (relative to infrastructure/)
    const backendRoot = path.resolve(__dirname, '..', '..', '..', 'backend');

    // ─── Common Lambda Environment Variables ────────────────────────
    const commonEnvVars: Record<string, string> = {
      NODE_OPTIONS: '--enable-source-maps',
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1', // Reuse HTTP connections
      POWERTOOLS_SERVICE_NAME: projectName,
      POWERTOOLS_LOG_LEVEL: environment === 'production' ? 'WARN' : 'DEBUG',
      IMAGE_TABLE_NAME: imageTable.tableName,
      USER_QUOTA_TABLE_NAME: userQuotaTable.tableName,
      USER_PROFILE_TABLE_NAME: userProfileTable.tableName,
      RAW_BUCKET_NAME: rawBucket.bucketName,
      PROCESSED_BUCKET_NAME: processedBucket.bucketName,
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
        forceDockerBundling: false,
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
        forceDockerBundling: false,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // IAM: API Handler — Least Privilege
    // Can: create presigned URLs (PutObject), delete objects, CRUD DynamoDB
    rawBucket.grantPut(this.apiHandlerFunction);     // For presigned URL generation
    rawBucket.grantRead(this.apiHandlerFunction);    // For presigned download URLs
    rawBucket.grantDelete(this.apiHandlerFunction);   // For image deletion
    processedBucket.grantRead(this.apiHandlerFunction);   // For presigned URLs (thumbnails/resized)
    processedBucket.grantDelete(this.apiHandlerFunction); // Delete processed files too
    imageTable.grantReadWriteData(this.apiHandlerFunction);
    userQuotaTable.grantReadWriteData(this.apiHandlerFunction);
    userProfileTable.grantReadWriteData(this.apiHandlerFunction);

    // Cognito profile sync permissions for profile updates
    this.apiHandlerFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cognito-idp:AdminUpdateUserAttributes'],
      resources: [userPool.userPoolArn],
    }));

    // ─── Lambda: Image Processor ────────────────────────────────────
    const imageProcessorDlq = new sqs.Queue(this, 'ImageProcessorDlq', {
      queueName: `${projectName}-ImageProcessorDlq-${environment}`,
      retentionPeriod: cdk.Duration.days(14),
    });

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
      deadLetterQueue: imageProcessorDlq,
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
        externalModules: ['@aws-sdk/*', 'sharp'],
        commandHooks: {
          beforeBundling(inputDir: string, outputDir: string): string[] { return []; },
          beforeInstall(inputDir: string, outputDir: string): string[] { return []; },
          afterBundling(inputDir: string, outputDir: string): string[] {
            // Force install linux-arm64 sharp inside the Lambda bundle
            // Delete .bin folder to prevent Windows EINVAL readlink error (using cross-platform Node script)
            // Use /tmp/npm-cache to avoid permission denied error in non-root Docker container on CI/CD
            return [
              `npm install --cache /tmp/npm-cache --prefix "${outputDir}" --force @img/sharp-linux-arm64 @img/sharp-libvips-linux-arm64 sharp`,
              `node -e "const fs = require('fs'); fs.rmSync('${outputDir}/node_modules/.bin', { recursive: true, force: true });"`
            ];
          },
        },
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
    const aiAnalyzerDlq = new sqs.Queue(this, 'AiAnalyzerDlq', {
      queueName: `${projectName}-AiAnalyzerDlq-${environment}`,
      retentionPeriod: cdk.Duration.days(14),
    });

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
        forceDockerBundling: false,
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

    // Event Source: DynamoDB Streams (replaces direct invocation)
    this.aiAnalyzerFunction.addEventSource(new lambdaEventSources.DynamoEventSource(imageTable, {
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      batchSize: 10,
      retryAttempts: 3,
      onFailure: new lambdaEventSources.SqsDlq(aiAnalyzerDlq),
    }));

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
        allowOrigins: allowedOrigins,
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
    // ─── API Gateway Request Validators ─────────────────────────────
    const bodyValidator = new apigateway.RequestValidator(this, 'BodyValidator', {
      restApi: this.api,
      requestValidatorName: 'validate-body',
      validateRequestBody: true,
      validateRequestParameters: false,
    });

    // We must define a Request Model to strictly enforce body validation.
    // For this example, an empty model instructs API Gateway to accept any JSON body, 
    // but the request *must* contain a body if validateRequestBody is true.
    const emptyModel = this.api.addModel('EmptyModel', {
      contentType: 'application/json',
      schema: {},
    });

    const v1 = this.api.root.addResource('v1');

    // --- Profile routes (Authenticated) ---
    const profile = v1.addResource('profile');
    profile.addMethod('GET', apiIntegration, authMethodOptions);
    profile.addMethod('PATCH', apiIntegration, {
      ...authMethodOptions,
      requestValidator: bodyValidator,
      requestModels: { 'application/json': emptyModel },
    });

    const profileAvatar = profile.addResource('avatar');
    const profileAvatarPresigned = profileAvatar.addResource('presigned-url');
    profileAvatarPresigned.addMethod('POST', apiIntegration, {
      ...authMethodOptions,
      requestValidator: bodyValidator,
      requestModels: { 'application/json': emptyModel },
    });

    // --- Auth routes (Public) ---
    const auth = v1.addResource('auth');
    const signup = auth.addResource('signup');
    signup.addMethod('POST', apiIntegration, { 
      requestValidator: bodyValidator,
      requestModels: { 'application/json': emptyModel }
    }); // No auth required

    const login = auth.addResource('login');
    login.addMethod('POST', apiIntegration, { 
      requestValidator: bodyValidator,
      requestModels: { 'application/json': emptyModel }
    });

    const refresh = auth.addResource('refresh');
    refresh.addMethod('POST', apiIntegration, { 
      requestValidator: bodyValidator,
      requestModels: { 'application/json': emptyModel }
    });

    // --- Image routes (Authenticated) ---
    const images = v1.addResource('images');
    images.addMethod('GET', apiIntegration, authMethodOptions);    // List images

    const presignedUrl = images.addResource('presigned-url');
    presignedUrl.addMethod('POST', apiIntegration, { 
      ...authMethodOptions, 
      requestValidator: bodyValidator,
      requestModels: { 'application/json': emptyModel }
    }); // Get upload URL

    const publicImages = images.addResource('public');
    publicImages.addMethod('GET', apiIntegration); // Community gallery

    const bulk = images.addResource('bulk');
    bulk.addMethod('DELETE', apiIntegration, authMethodOptions); // Bulk delete

    const search = images.addResource('search');
    search.addMethod('GET', apiIntegration, authMethodOptions);   // Search by tag

    const imageById = images.addResource('{imageId}');
    imageById.addMethod('GET', apiIntegration, authMethodOptions);    // Get image detail
    imageById.addMethod('DELETE', apiIntegration, authMethodOptions); // Delete image
    imageById.addMethod('PATCH', apiIntegration, { 
      ...authMethodOptions, 
      requestValidator: bodyValidator,
      requestModels: { 'application/json': emptyModel }
    });  // Update image

    const download = imageById.addResource('download');
    download.addMethod('GET', apiIntegration, authMethodOptions); // Download URL

    // --- Admin routes (Authenticated + admin group check in Lambda) ---
    const admin = v1.addResource('admin');
    const moderation = admin.addResource('moderation');
    moderation.addMethod('GET', apiIntegration, authMethodOptions); // List flagged

    const moderateById = moderation.addResource('{imageId}');
    moderateById.addMethod('POST', apiIntegration, { 
      ...authMethodOptions, 
      requestValidator: bodyValidator,
      requestModels: { 'application/json': emptyModel }
    }); // Approve/reject

    // ─── AWS WAFv2 Web ACL ──────────────────────────────────────────
    const webAcl = new wafv2.CfnWebACL(this, 'ApiWebAcl', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${projectName}-WafMetrics-${environment}`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWS-AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesCommonRuleSetMetric',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'RateLimitRule',
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRuleMetric',
            sampledRequestsEnabled: true,
          },
        }
      ],
    });

    // Associate WAF to API Gateway Stage
    new wafv2.CfnWebACLAssociation(this, 'ApiWebAclAssoc', {
      resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${this.api.restApiId}/stages/${this.api.deploymentStage.stageName}`,
      webAclArn: webAcl.attrArn,
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
