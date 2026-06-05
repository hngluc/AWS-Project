import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  projectName: string;
  environment: string;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { projectName, environment } = props;
    const frontendDomain = this.node.tryGetContext('frontendDomain') || '';

    // ─── Cognito User Pool ──────────────────────────────────────────
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${projectName}-UserPool-${environment}`,

      // Self-registration enabled
      selfSignUpEnabled: true,

      // Sign-in options: email only (no username)
      signInAliases: {
        email: true,
        username: false,
        phone: false,
      },

      // Email verification required before account activation
      autoVerify: {
        email: true,
      },

      // Standard attributes required at signup
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        fullname: {
          required: true,
          mutable: true,
        },
      },

      // Custom attributes for role-based access
      customAttributes: {
        role: new cognito.StringAttribute({
          mutable: true,
          minLen: 1,
          maxLen: 20,
        }),
      },

      // Password policy: Strong but usable
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7),
      },

      // Account recovery: email only
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,

      // MFA: Optional but available (users can enable in settings)
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false, // Don't use SMS (cost + security concerns)
        otp: true,  // TOTP (Google Authenticator, etc.)
      },

      // Email configuration: Use Cognito default email for MVP
      // TODO: Switch to SES for production (custom domain, higher limits)
      email: cognito.UserPoolEmail.withCognito(),

      // Advanced security (bot protection, compromised credentials check)
      advancedSecurityMode: environment === 'production'
        ? cognito.AdvancedSecurityMode.ENFORCED
        : cognito.AdvancedSecurityMode.AUDIT,

      // Removal policy
      removalPolicy: environment === 'production'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // ─── User Pool Client ───────────────────────────────────────────
    // This is the "app" that connects to the User Pool
    this.userPoolClient = this.userPool.addClient('WebAppClient', {
      userPoolClientName: `${projectName}-WebClient-${environment}`,

      // Auth flows: SRP (Secure Remote Password) — most secure option
      authFlows: {
        userSrp: true,      // SRP protocol (recommended)
        userPassword: false, // Don't allow plain password auth
        adminUserPassword: false,
        custom: false,
      },

      // Token validity
      accessTokenValidity: cdk.Duration.minutes(60),   // 1 hour
      idTokenValidity: cdk.Duration.minutes(60),        // 1 hour
      refreshTokenValidity: cdk.Duration.days(30),      // 30 days

      // Prevent token revocation issues
      enableTokenRevocation: true,

      // Prevent user existence errors (security: don't reveal if email exists)
      preventUserExistenceErrors: true,

      // OAuth settings for future social login integration
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false, // Less secure, avoid
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: environment === 'production' && frontendDomain
          ? [`${frontendDomain}/callback`]
          : ['http://localhost:5173/callback', 'http://localhost:3000/callback'],
        logoutUrls: environment === 'production' && frontendDomain
          ? [`${frontendDomain}/logout`]
          : ['http://localhost:5173/logout', 'http://localhost:3000/logout'],
      },

      // Supported identity providers
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
    });

    // ─── Admin Group ────────────────────────────────────────────────
    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admin',
      description: 'Administrators with moderation access',
      precedence: 0, // Highest priority
    });

    new cognito.CfnUserPoolGroup(this, 'UserGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'user',
      description: 'Regular users',
      precedence: 10,
    });

    // ─── Outputs ────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${projectName}-${environment}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `${projectName}-${environment}-UserPoolClientId`,
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      description: 'Cognito User Pool ARN',
      exportName: `${projectName}-${environment}-UserPoolArn`,
    });
  }
}
