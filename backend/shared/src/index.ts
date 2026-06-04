// ─── Shared Utilities Barrel Export ──────────────────────────────
export { dynamoClient, docClient } from './clients/dynamodb.js';
export { s3Client } from './clients/s3.js';
export { ApiResponse } from './utils/response.js';
export { AppError, ValidationError, NotFoundError, ForbiddenError, UnauthorizedError } from './utils/errors';
export { validateImageUploadRequest, validatePaginationParams, sanitizeFilename } from './utils/validation';
export { logger } from './utils/logger.js';
export type { ImageMetadata, ImageStatus, ModerationStatus, AiTag, CreateImageInput } from './models/image';
export type { UserQuota } from './models/user.js';
