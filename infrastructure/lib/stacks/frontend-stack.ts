import * as cdk from 'aws-cdk-lib';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface FrontendStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
  api: apigateway.RestApi;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  githubRepoUrl: string;
  githubBranch: string;
  githubToken: string;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const {
      projectName,
      environment,
      api,
      userPool,
      userPoolClient,
      githubRepoUrl,
      githubBranch,
      githubToken,
    } = props;
    const nameSuffix = `${projectName}-${environment}`.toLowerCase();

    // ─── AWS Amplify App ─────────────────────────────────────────────
    const amplifyApp = new amplify.CfnApp(this, 'FrontendAmplifyApp', {
      name: `${nameSuffix}-frontend`,
      repository: githubRepoUrl,
      oauthToken: githubToken,
      environmentVariables: [
        { name: 'VITE_API_URL', value: api.url },
        { name: 'VITE_USER_POOL_ID', value: userPool.userPoolId },
        { name: 'VITE_CLIENT_ID', value: userPoolClient.userPoolClientId },
        { name: 'VITE_AWS_REGION', value: this.region },
      ],
      customRules: [
        {
          source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>',
          target: '/index.html',
          status: '200',
        },
      ],
      buildSpec: `version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run --workspace=frontend build
  artifacts:
    baseDirectory: frontend/dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*`,
    });

    // ─── AWS Amplify Branch ──────────────────────────────────────────
    new amplify.CfnBranch(this, 'FrontendAmplifyBranch', {
      appId: amplifyApp.attrAppId,
      branchName: githubBranch,
      enableAutoBuild: true,
    });

    // ─── Outputs ────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${githubBranch}.${amplifyApp.attrDefaultDomain}`,
      description: 'Frontend Application Amplify Website URL',
      exportName: `${projectName}-${environment}-FrontendUrl`,
    });
  }
}
