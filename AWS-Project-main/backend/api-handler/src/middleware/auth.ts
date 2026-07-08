import type { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Auth Middleware — Extracts user context from Cognito Authorizer
 * 
 * The Cognito Authorizer (configured in API Gateway) validates the JWT token
 * and injects user claims into event.requestContext.authorizer.claims.
 * 
 * For routes using the Cognito User Pools Authorizer:
 * - claims.sub → userId (Cognito user ID)
 * - claims.email → user's email
 * - claims['cognito:groups'] → comma-separated groups
 */

export interface UserContext {
  userId: string;
  email: string;
  groups: string[];
  isAdmin: boolean;
  isAuthenticated: boolean;
}

export function extractUserContext(event: APIGatewayProxyEvent): UserContext {
  const claims = event.requestContext.authorizer?.claims;

  // If no claims, user is not authenticated (public route)
  if (!claims) {
    return {
      userId: '',
      email: '',
      groups: [],
      isAdmin: false,
      isAuthenticated: false,
    };
  }

  const userId = claims.sub || claims['cognito:username'] || '';
  const email = claims.email || '';
  const groupsClaim = claims['cognito:groups'] || '';
  const groups = typeof groupsClaim === 'string'
    ? groupsClaim.split(',').filter(Boolean)
    : Array.isArray(groupsClaim) ? groupsClaim : [];
  const isAdmin = groups.includes('admin');

  return {
    userId,
    email,
    groups,
    isAdmin,
    isAuthenticated: !!userId,
  };
}

/**
 * Require authentication — throws if user is not authenticated
 */
export function requireAuth(userContext: UserContext): asserts userContext is UserContext & { isAuthenticated: true } {
  if (!userContext.isAuthenticated || !userContext.userId) {
    const error = new Error('Authentication required') as Error & { statusCode: number; errorCode: string };
    error.statusCode = 401;
    error.errorCode = 'UNAUTHORIZED';
    throw error;
  }
}

/**
 * Require admin role — throws if user is not an admin
 */
export function requireAdmin(userContext: UserContext): void {
  requireAuth(userContext);
  if (!userContext.isAdmin) {
    const error = new Error('Admin access required') as Error & { statusCode: number; errorCode: string };
    error.statusCode = 403;
    error.errorCode = 'FORBIDDEN';
    throw error;
  }
}
