import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import middy from '@middy/core';
import httpRouterHandler from '@middy/http-router';
import httpErrorHandler from '@middy/http-error-handler';
import httpCors from '@middy/http-cors';
import { handleUpload } from './routes/upload';
import { handleListImages, handleGetImage, handleDeleteImage, handleUpdateImage } from './routes/images';
import { handleSearchByTag } from './routes/search';
import { handleListModeration, handleModerateImage } from './routes/admin';
import { extractUserContext } from './middleware/auth';

/**
 * API Handler Lambda — Middy Router
 */

// Helper to wrap our existing handlers with user context extraction
const wrapRoute = (handlerFn: Function) => {
  return async (event: APIGatewayProxyEvent, context: Context) => {
    const userContext = extractUserContext(event);
    return handlerFn(event, userContext);
  };
};

const routes = [
  {
    method: 'POST' as const,
    path: '/v1/images/presigned-url',
    handler: wrapRoute(handleUpload),
  },
  {
    method: 'GET' as const,
    path: '/v1/images',
    handler: wrapRoute(handleListImages),
  },
  {
    method: 'GET' as const,
    path: '/v1/images/{imageId}',
    handler: wrapRoute(handleGetImage),
  },
  {
    method: 'DELETE' as const,
    path: '/v1/images/{imageId}',
    handler: wrapRoute(handleDeleteImage),
  },
  {
    method: 'PATCH' as const,
    path: '/v1/images/{imageId}',
    handler: wrapRoute(handleUpdateImage),
  },
  {
    method: 'GET' as const,
    path: '/v1/images/search',
    handler: wrapRoute(handleSearchByTag),
  },
  {
    method: 'GET' as const,
    path: '/v1/admin/moderation',
    handler: wrapRoute(handleListModeration),
  },
  {
    method: 'POST' as const,
    path: '/v1/admin/moderation/{imageId}',
    handler: wrapRoute(handleModerateImage),
  },
];

export const handler = middy(httpRouterHandler(routes))
  .use(httpCors({
    origin: process.env.ALLOWED_ORIGIN || '*',
    credentials: true,
    headers: 'Content-Type,Authorization',
  }))
  .use(httpErrorHandler({ fallbackMessage: 'An unexpected error occurred' }));
