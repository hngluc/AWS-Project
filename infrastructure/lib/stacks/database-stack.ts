import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface DatabaseStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
}

export class DatabaseStack extends cdk.Stack {
  public readonly imageTable: dynamodb.Table;
  public readonly userQuotaTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { projectName, environment } = props;

    // ─── Main Table: SmartImagePlatform ─────────────────────────────
    // Single-table design with composite keys
    // PK: USER#<userId>  |  SK: IMG#<YYYYMMDD>T<HHmmss>#<ulid>
    //
    // Access Patterns:
    // 1. Get image by ID           → GetItem(PK, SK)
    // 2. List user's images        → Query(PK, SK begins_with "IMG#")
    // 3. List images by date range → Query(PK, SK between "IMG#2026-06-01" and "IMG#2026-06-30")
    // 4. Search by AI tag          → Query GSI1 (TAG#<name>)
    // 5. Moderation queue          → Query GSI2 (MOD#FLAGGED)
    this.imageTable = new dynamodb.Table(this, 'ImageMetadataTable', {
      tableName: `${projectName}-Images-${environment}`,
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      // On-Demand billing: perfect for unpredictable workloads
      // No need to provision RCU/WCU — auto-scales to any load
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Encryption at rest with AWS-managed key
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      // Point-in-time recovery for disaster recovery
      pointInTimeRecovery: true,
      // DynamoDB Streams — needed for future OpenSearch sync
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      // Removal policy
      removalPolicy: environment === 'production'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // GSI1: Tag Index — Search images by AI-generated tags
    // PK: TAG#<tagName>  |  SK: IMG#<imageId>
    // Use case: "Show me all images tagged 'Mountain'"
    this.imageTable.addGlobalSecondaryIndex({
      indexName: 'GSI1-TagIndex-v2',
      partitionKey: {
        name: 'GSI1PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK',
        type: dynamodb.AttributeType.STRING,
      },
      // Project only needed attributes to minimize storage cost & RCU
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        'imageId', 'userId', 'thumbnailKey', 'originalFilename',
        'createdAt', 'moderationStatus', 'imagePK', 'imageSK'
      ],
    });

    // GSI2: Moderation Index — Query flagged images for admin review
    // PK: MOD#<status>  |  SK: <timestamp>
    // Use case: Admin dashboard showing all flagged images sorted by time
    this.imageTable.addGlobalSecondaryIndex({
      indexName: 'GSI2-ModerationIndex',
      partitionKey: {
        name: 'GSI2PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI2SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        'imageId', 'userId', 'originalKey', 'moderationLabels',
        'thumbnailKey', 'createdAt',
      ],
    });

    // ─── User Quotas Table ──────────────────────────────────────────
    // Tracks upload counts and storage usage per user per period
    // PK: USER#<userId>  |  SK: QUOTA#MONTHLY | QUOTA#STORAGE
    this.userQuotaTable = new dynamodb.Table(this, 'UserQuotaTable', {
      tableName: `${projectName}-UserQuotas-${environment}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: environment === 'production'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // ─── Outputs ────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ImageTableName', {
      value: this.imageTable.tableName,
      description: 'DynamoDB table name for image metadata',
      exportName: `${projectName}-${environment}-ImageTableName`,
    });

    new cdk.CfnOutput(this, 'ImageTableArn', {
      value: this.imageTable.tableArn,
      description: 'DynamoDB table ARN for image metadata',
      exportName: `${projectName}-${environment}-ImageTableArn`,
    });

    new cdk.CfnOutput(this, 'UserQuotaTableName', {
      value: this.userQuotaTable.tableName,
      description: 'DynamoDB table name for user quotas',
      exportName: `${projectName}-${environment}-UserQuotaTableName`,
    });
  }
}
