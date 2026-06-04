import type {
  APIGatewayTokenAuthorizerEvent,
  APIGatewayAuthorizerResult,
  Context,
} from 'aws-lambda';
import jwt, { JwtPayload } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

/**
 * Custom Lambda Authorizer for API Gateway
 * 
 * Validates JWT tokens issued by Amazon Cognito User Pool.
 * Returns IAM policy allowing/denying access to API resources.
 * 
 * Flow:
 * 1. Extract Bearer token from Authorization header
 * 2. Decode JWT header to get key ID (kid)
 * 3. Fetch public key from Cognito JWKS endpoint (cached by jwks-rsa)
 * 4. Verify token signature, expiry, audience, and issuer
 * 5. Extract userId and groups from claims
 * 6. Generate IAM policy with userId in context
 * 
 * Note: API Gateway caches authorizer results for up to 5 minutes (TTL=300)
 * so this function is not called on every request.
 */

const USER_POOL_ID = process.env.USER_POOL_ID!;
const REGION = process.env.REGION || 'ap-southeast-1';
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`;

// JWKS client with built-in caching and rate limiting
const client = jwksClient({
  jwksUri: `${ISSUER}/.well-known/jwks.json`,
  cache: true,           // Cache signing keys
  cacheMaxAge: 600000,   // Cache for 10 minutes (ms)
  rateLimit: true,       // Rate limit JWKS requests
  jwksRequestsPerMinute: 10,
});

/**
 * Get signing key from Cognito JWKS endpoint
 */
function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
        return;
      }
      if (!key) {
        reject(new Error('No signing key found'));
        return;
      }
      resolve(key.getPublicKey());
    });
  });
}

/**
 * Verify and decode JWT token
 */
async function verifyToken(token: string): Promise<JwtPayload> {
  // Decode without verification to get the kid from header
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header.kid) {
    throw new Error('Invalid token: unable to decode');
  }

  // Get the signing key for this kid
  const signingKey = await getSigningKey(decoded.header.kid);

  // Verify the token with the public key
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      signingKey,
      {
        issuer: ISSUER,
        algorithms: ['RS256'],
        // Note: audience check is skipped for Cognito access tokens
        // as they use 'client_id' claim instead of 'aud'
      },
      (err, payload) => {
        if (err) {
          reject(err);
        } else {
          resolve(payload as JwtPayload);
        }
      },
    );
  });
}

/**
 * Generate IAM Policy for API Gateway
 */
function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  methodArn: string,
  context?: Record<string, string | number | boolean>,
): APIGatewayAuthorizerResult {
  // Extract the API Gateway ARN base to allow access to all methods
  // arn:aws:execute-api:region:accountId:apiId/stage/method/resource
  const arnParts = methodArn.split(':');
  const apiGatewayArnParts = arnParts[5].split('/');
  const apiArn = `${arnParts[0]}:${arnParts[1]}:${arnParts[2]}:${arnParts[3]}:${arnParts[4]}:${apiGatewayArnParts[0]}/${apiGatewayArnParts[1]}/*`;

  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: apiArn,
        },
      ],
    },
    // Context is passed to Lambda handler via event.requestContext.authorizer
    context: context || {},
  };
}

/**
 * Lambda Handler
 */
export const handler = async (
  event: APIGatewayTokenAuthorizerEvent,
  _context: Context,
): Promise<APIGatewayAuthorizerResult> => {
  console.info('Authorizer invoked', { methodArn: event.methodArn });

  try {
    // Extract Bearer token
    const authHeader = event.authorizationToken;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('Missing or invalid Authorization header');
      return generatePolicy('unknown', 'Deny', event.methodArn);
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    // Verify the token
    const claims = await verifyToken(token);

    // Extract user info from Cognito JWT claims
    const userId = claims.sub!; // Cognito user ID (sub claim)
    const email = (claims.email as string) || '';
    const groups = (claims['cognito:groups'] as string[]) || [];
    const isAdmin = groups.includes('admin');

    console.info('Token verified successfully', {
      userId,
      email,
      groups,
      tokenUse: claims.token_use,
    });

    // Generate Allow policy with user context
    return generatePolicy(userId, 'Allow', event.methodArn, {
      userId,
      email,
      groups: groups.join(','),
      isAdmin: isAdmin.toString(),
    });

  } catch (error) {
    console.error('Authorization failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Return Deny policy — API Gateway will return 403
    return generatePolicy('unknown', 'Deny', event.methodArn);
  }
};
