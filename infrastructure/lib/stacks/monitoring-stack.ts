import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export interface MonitoringStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
  apiHandlerFunctionName: string;
  imageProcessorFunctionName: string;
  aiAnalyzerFunctionName: string;
  apiGatewayName: string;
  imageTableName: string;
  rawBucketName: string;
}

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { projectName, environment } = props;

    // ─── SNS Topic for Alarms ───────────────────────────────────────
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `${projectName}-Alarms-${environment}`,
      displayName: `${projectName} ${environment} Alarms`,
    });

    const alarmEmail = this.node.tryGetContext('alarmEmail') || 'admin@example.com';
    
    new sns.Subscription(this, 'AlarmEmailSub', {
      topic: alarmTopic,
      protocol: sns.SubscriptionProtocol.EMAIL,
      endpoint: alarmEmail,
    });

    const alarmAction = new cloudwatch_actions.SnsAction(alarmTopic);

    // ─── Lambda Error Alarms ────────────────────────────────────────
    const lambdaFunctions = [
      { name: props.apiHandlerFunctionName, label: 'API Handler' },
      { name: props.imageProcessorFunctionName, label: 'Image Processor' },
      { name: props.aiAnalyzerFunctionName, label: 'AI Analyzer' },
    ];

    for (const fn of lambdaFunctions) {
      // Error rate alarm: >5 errors in 5 minutes
      const errorAlarm = new cloudwatch.Alarm(this, `${fn.label.replace(/\s/g, '')}ErrorAlarm`, {
        alarmName: `${projectName}-${environment}-${fn.label}-Errors`,
        alarmDescription: `High error rate in ${fn.label} Lambda`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Errors',
          dimensionsMap: { FunctionName: fn.name },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 5,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      errorAlarm.addAlarmAction(alarmAction);

      // Duration alarm: P95 > 80% of timeout
      const durationThresholds: Record<string, number> = {
        'API Handler': 12000,     // 12s (timeout=15s, 80%)
        'Image Processor': 96000, // 96s (timeout=120s, 80%)
        'AI Analyzer': 48000,     // 48s (timeout=60s, 80%)
      };

      const durationAlarm = new cloudwatch.Alarm(this, `${fn.label.replace(/\s/g, '')}DurationAlarm`, {
        alarmName: `${projectName}-${environment}-${fn.label}-SlowExecution`,
        alarmDescription: `${fn.label} Lambda execution approaching timeout`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Duration',
          dimensionsMap: { FunctionName: fn.name },
          statistic: 'p95',
          period: cdk.Duration.minutes(5),
        }),
        threshold: durationThresholds[fn.label] || 10000,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      durationAlarm.addAlarmAction(alarmAction);

      // Throttle alarm: any throttling
      const throttleAlarm = new cloudwatch.Alarm(this, `${fn.label.replace(/\s/g, '')}ThrottleAlarm`, {
        alarmName: `${projectName}-${environment}-${fn.label}-Throttled`,
        alarmDescription: `${fn.label} Lambda is being throttled`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'Throttles',
          dimensionsMap: { FunctionName: fn.name },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      throttleAlarm.addAlarmAction(alarmAction);
    }

    // ─── API Gateway Alarms ─────────────────────────────────────────
    const apiGw5xxAlarm = new cloudwatch.Alarm(this, 'ApiGw5xxAlarm', {
      alarmName: `${projectName}-${environment}-API-5xx-Errors`,
      alarmDescription: 'API Gateway returning 5xx errors',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        dimensionsMap: { ApiName: props.apiGatewayName },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    apiGw5xxAlarm.addAlarmAction(alarmAction);

    // API Gateway latency alarm: P95 > 3 seconds
    const apiGwLatencyAlarm = new cloudwatch.Alarm(this, 'ApiGwLatencyAlarm', {
      alarmName: `${projectName}-${environment}-API-HighLatency`,
      alarmDescription: 'API Gateway P95 latency is high',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Latency',
        dimensionsMap: { ApiName: props.apiGatewayName },
        statistic: 'p95',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 3000,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    apiGwLatencyAlarm.addAlarmAction(alarmAction);

    // ─── DynamoDB Alarms ────────────────────────────────────────────
    const ddbThrottleAlarm = new cloudwatch.Alarm(this, 'DdbThrottleAlarm', {
      alarmName: `${projectName}-${environment}-DDB-Throttled`,
      alarmDescription: 'DynamoDB table is being throttled',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'ThrottledRequests',
        dimensionsMap: { TableName: props.imageTableName },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    ddbThrottleAlarm.addAlarmAction(alarmAction);

    // ─── CloudWatch Dashboard ───────────────────────────────────────
    const dashboard = new cloudwatch.Dashboard(this, 'OperationalDashboard', {
      dashboardName: `${projectName}-${environment}-Operations`,
    });

    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# 🖼️ ${projectName} — ${environment} Dashboard`,
        width: 24,
        height: 1,
      }),
    );

    // Lambda metrics row
    dashboard.addWidgets(
      ...lambdaFunctions.map(fn =>
        new cloudwatch.GraphWidget({
          title: `${fn.label} — Invocations & Errors`,
          left: [
            new cloudwatch.Metric({
              namespace: 'AWS/Lambda',
              metricName: 'Invocations',
              dimensionsMap: { FunctionName: fn.name },
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
            }),
          ],
          right: [
            new cloudwatch.Metric({
              namespace: 'AWS/Lambda',
              metricName: 'Errors',
              dimensionsMap: { FunctionName: fn.name },
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
              color: '#d62728',
            }),
          ],
          width: 8,
          height: 6,
        }),
      ),
    );

    // Duration row
    dashboard.addWidgets(
      ...lambdaFunctions.map(fn =>
        new cloudwatch.GraphWidget({
          title: `${fn.label} — Duration (ms)`,
          left: [
            new cloudwatch.Metric({
              namespace: 'AWS/Lambda',
              metricName: 'Duration',
              dimensionsMap: { FunctionName: fn.name },
              statistic: 'Average',
              period: cdk.Duration.minutes(5),
            }),
            new cloudwatch.Metric({
              namespace: 'AWS/Lambda',
              metricName: 'Duration',
              dimensionsMap: { FunctionName: fn.name },
              statistic: 'p95',
              period: cdk.Duration.minutes(5),
              color: '#ff7f0e',
            }),
          ],
          width: 8,
          height: 6,
        }),
      ),
    );

    // ─── Outputs ────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: alarmTopic.topicArn,
      description: 'SNS Topic ARN for CloudWatch alarms',
    });

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${projectName}-${environment}-Operations`,
      description: 'CloudWatch Dashboard URL',
    });
  }
}
