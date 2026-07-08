#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StorageStack } from '../lib/stacks/storage-stack';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { AuthStack } from '../lib/stacks/auth-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { MonitoringStack } from '../lib/stacks/monitoring-stack';
import { FrontendStack } from '../lib/stacks/frontend-stack';

const app = new cdk.App();

// ─── Configuration ───────────────────────────────────────────────
const environment = app.node.tryGetContext('environment') || 'staging';
const projectName = 'SmartImage';

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'ap-southeast-1', // Singapore — lowest latency for Vietnam
};

const commonTags = {
  Project: projectName,
  Environment: environment,
  ManagedBy: 'CDK',
};

// ─── Stack Deployment ────────────────────────────────────────────
// Stack dependencies are declared explicitly to ensure correct deployment order

const storageStack = new StorageStack(app, `${projectName}-Storage-${environment}`, {
  env,
  projectName,
  environment,
  tags: commonTags,
});

const databaseStack = new DatabaseStack(app, `${projectName}-Database-${environment}`, {
  env,
  projectName,
  environment,
  tags: commonTags,
});

const authStack = new AuthStack(app, `${projectName}-Auth-${environment}`, {
  env,
  projectName,
  environment,
  tags: commonTags,
});

const apiStack = new ApiStack(app, `${projectName}-Api-${environment}`, {
  env,
  projectName,
  environment,
  rawBucket: storageStack.rawBucket,
  processedBucket: storageStack.processedBucket,
  imageTable: databaseStack.imageTable,
  userQuotaTable: databaseStack.userQuotaTable,
  userProfileTable: databaseStack.userProfileTable,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  tags: commonTags,
});

// API Stack depends on Storage, Database, and Auth
apiStack.addDependency(storageStack);
apiStack.addDependency(databaseStack);
apiStack.addDependency(authStack);

const monitoringStack = new MonitoringStack(app, `${projectName}-Monitoring-${environment}`, {
  env,
  projectName,
  environment,
  apiHandlerFunctionName: apiStack.apiHandlerFunction.functionName,
  imageProcessorFunctionName: apiStack.imageProcessorFunction.functionName,
  aiAnalyzerFunctionName: apiStack.aiAnalyzerFunction.functionName,
  apiGatewayName: apiStack.api.restApiName,
  imageTableName: databaseStack.imageTable.tableName,
  rawBucketName: storageStack.rawBucket.bucketName,
  tags: commonTags,
});

monitoringStack.addDependency(apiStack);

const githubRepoUrl = process.env.GITHUB_REPO_URL || 'https://github.com/hngluc/AWS-Project';
const githubBranch = process.env.GITHUB_BRANCH || environment;
const githubToken = process.env.GITHUB_TOKEN || '';

const frontendStack = new FrontendStack(app, `${projectName}-Frontend-${environment}`, {
  env,
  projectName,
  environment,
  api: apiStack.api,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  githubRepoUrl,
  githubBranch,
  githubToken,
  tags: commonTags,
});
frontendStack.addDependency(apiStack);
frontendStack.addDependency(authStack);
app.synth();
