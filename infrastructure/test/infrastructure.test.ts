import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { StorageStack } from '../lib/stacks/storage-stack';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { MonitoringStack } from '../lib/stacks/monitoring-stack';

test('StorageStack creates S3 buckets', () => {
  const app = new cdk.App();
  const stack = new StorageStack(app, 'TestStorageStack', {
    projectName: 'TestProj',
    environment: 'test',
  });
  
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::S3::Bucket', 2);
});

test('DatabaseStack creates DynamoDB tables with PITR', () => {
  const app = new cdk.App();
  const stack = new DatabaseStack(app, 'TestDatabaseStack', {
    projectName: 'TestProj',
    environment: 'test',
  });
  
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::DynamoDB::Table', 3);
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    PointInTimeRecoverySpecification: {
      PointInTimeRecoveryEnabled: true
    }
  });
});

test('MonitoringStack creates SNS Topic and Subscriptions', () => {
  const app = new cdk.App();
  
  // Provide context for alarmEmail
  app.node.setContext('alarmEmail', 'test@example.com');
  
  const stack = new MonitoringStack(app, 'TestMonitoringStack', {
    projectName: 'TestProj',
    environment: 'test',
    apiHandlerFunctionName: 'ApiHandler',
    imageProcessorFunctionName: 'ImageProcessor',
    aiAnalyzerFunctionName: 'AiAnalyzer',
    apiGatewayName: 'Api',
    imageTableName: 'Images',
    rawBucketName: 'RawBucket'
  });
  
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::SNS::Topic', 1);
  template.resourceCountIs('AWS::SNS::Subscription', 1);
});
