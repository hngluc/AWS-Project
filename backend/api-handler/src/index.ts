import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { handleUpload } from './routes/upload';
import { handleListImages, handleGetImage, handleDeleteImage, handleUpdateImage } from './routes/images';
import { handleSearchByTag } from './routes/search';
import { handleListModeration, handleModerateImage } from './routes/admin';
import { extractUserContext } from './middleware/auth';

/**
 * API Handler Lambda — Main Entry Point
 * 
 * Acts as a lightweight router for all REST API endpoints.
 * Uses API Gateway Lambda Proxy Integration: receives full HTTP request,
 * returns full HTTP response.
 * 
 * Route matching is done by combining httpMethod + resource path.
 * The Cognito Authorizer has already validated the JWT token and 
 * injected userId, email, groups into requestContext.authorizer.
 */

// Standardized response helpers (inline for cold start optimization)
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Credentials': 'true',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function errorResponse(statusCode: number, message: string, error: string): APIGatewayProxyResult {
  return jsonResponse(statusCode, { success: false, error, message });
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  // Reduce cold start impact: don't wait for event loop to drain
  context.callbackWaitsForEmptyEventLoop = false;

  const { httpMethod, resource, pathParameters, queryStringParameters } = event;

  console.info('API Request', {
    httpMethod,
    resource,
    pathParameters,
    queryStringParameters,
    requestId: context.awsRequestId,
  });

  try {
    // Extract user context from Cognito authorizer
    // For public routes (auth/*), this will return a guest context
    const userContext = extractUserContext(event);

    // ─── Route Matching ───────────────────────────────────────────
    const routeKey = `${httpMethod} ${resource}`;

    switch (routeKey) {
      // --- Auth routes (public, handled by Cognito directly) ---
      // Note: Cognito handles signup/login/refresh via its hosted UI or SDK
      // These endpoints are placeholders for custom auth flows if needed
      case 'POST /v1/auth/signup':
      case 'POST /v1/auth/login':
      case 'POST /v1/auth/refresh':
        return jsonResponse(200, {
          success: true,
          message: 'Use Cognito SDK directly for authentication. See documentation.',
          cognitoConfig: {
            userPoolId: process.env.USER_POOL_ID,
            region: process.env.AWS_REGION,
          },
        });

      // --- Image Upload ---
      case 'POST /v1/images/presigned-url':
        return await handleUpload(event, userContext);

      // --- Image CRUD ---
      case 'GET /v1/images':
        return await handleListImages(event, userContext);

      case 'GET /v1/images/{imageId}':
        return await handleGetImage(event, userContext);

      case 'DELETE /v1/images/{imageId}':
        return await handleDeleteImage(event, userContext);

      case 'PATCH /v1/images/{imageId}':
        return await handleUpdateImage(event, userContext);

      // --- Search ---
      case 'GET /v1/images/search':
        return await handleSearchByTag(event, userContext);

      // --- Admin Moderation ---
      case 'GET /v1/admin/moderation':
        return await handleListModeration(event, userContext);

      case 'POST /v1/admin/moderation/{imageId}':
        return await handleModerateImage(event, userContext);

      // --- 404 ---
      default:
        console.warn('Route not found', { routeKey });
        return errorResponse(404, `Route ${routeKey} not found`, 'NotFound');
    }

  } catch (error: unknown) {
    // Global error handler
    console.error('Unhandled error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Check if it's an operational error with a status code
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const appError = error as { statusCode: number; message: string; errorCode: string };
      return errorResponse(
        appError.statusCode,
        appError.message,
        appError.errorCode || 'AppError',
      );
    }

    // Unknown error — don't leak internal details
    return errorResponse(500, 'An unexpected error occurred', 'InternalServerError');
  }
};
