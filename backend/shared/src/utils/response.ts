/**
 * Standardized API Response Builder
 * 
 * Ensures all Lambda responses follow the same format with:
 * - Correct HTTP status codes
 * - CORS headers
 * - JSON content type
 * - Consistent body structure: { success, data?, error?, message? }
 */

interface ApiResponseBody {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
  meta?: {
    nextCursor?: string;
    totalCount?: number;
  };
}

export class ApiResponse {
  private static readonly CORS_HEADERS: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    // Security headers
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };

  static success(data: unknown, statusCode: number = 200, meta?: ApiResponseBody['meta']) {
    const body: ApiResponseBody = {
      success: true,
      data,
    };
    if (meta) {
      body.meta = meta;
    }

    return {
      statusCode,
      headers: this.CORS_HEADERS,
      body: JSON.stringify(body),
    };
  }

  static created(data: unknown) {
    return this.success(data, 201);
  }

  static noContent() {
    return {
      statusCode: 204,
      headers: this.CORS_HEADERS,
      body: '',
    };
  }

  static error(message: string, statusCode: number = 500, error?: string) {
    const body: ApiResponseBody = {
      success: false,
      error: error || 'InternalServerError',
      message,
    };

    return {
      statusCode,
      headers: this.CORS_HEADERS,
      body: JSON.stringify(body),
    };
  }

  static badRequest(message: string) {
    return this.error(message, 400, 'BadRequest');
  }

  static unauthorized(message: string = 'Unauthorized') {
    return this.error(message, 401, 'Unauthorized');
  }

  static forbidden(message: string = 'Forbidden') {
    return this.error(message, 403, 'Forbidden');
  }

  static notFound(message: string = 'Resource not found') {
    return this.error(message, 404, 'NotFound');
  }

  static tooManyRequests(message: string = 'Rate limit exceeded') {
    return this.error(message, 429, 'TooManyRequests');
  }
}
