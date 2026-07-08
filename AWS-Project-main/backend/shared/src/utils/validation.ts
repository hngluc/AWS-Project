import { ValidationError } from './errors';

/**
 * Input Validation Helpers
 * 
 * Whitelist-based validation following OWASP best practices:
 * - Validate MIME types against explicit allowlist
 * - Validate file sizes against max limits
 * - Sanitize filenames to prevent path traversal
 * - Validate pagination parameters
 */

// ─── Constants ──────────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const;

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_FILENAME_LENGTH = 255;
const MIN_FILENAME_LENGTH = 1;

// Whitelist approach: only allow safe filename characters
// Prevents path traversal (../) and null byte injection (%00)
const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._\-() ]*\.[a-zA-Z]{2,5}$/;

// ─── Upload Request Validation ──────────────────────────────────────
export interface UploadRequest {
  filename: string;
  contentType: string;
  fileSize: number;
}

export function validateImageUploadRequest(input: unknown): UploadRequest {
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Request body is required');
  }

  const body = input as Record<string, unknown>;

  // Validate filename
  if (!body.filename || typeof body.filename !== 'string') {
    throw new ValidationError('filename is required and must be a string');
  }

  const filename = body.filename.trim();

  if (filename.length < MIN_FILENAME_LENGTH || filename.length > MAX_FILENAME_LENGTH) {
    throw new ValidationError(`filename must be between ${MIN_FILENAME_LENGTH} and ${MAX_FILENAME_LENGTH} characters`);
  }

  if (!SAFE_FILENAME_REGEX.test(filename)) {
    throw new ValidationError('filename contains invalid characters. Use only letters, numbers, dots, hyphens, underscores, spaces, and parentheses');
  }

  // Prevent path traversal attacks
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new ValidationError('filename must not contain path separators');
  }

  // Validate content type
  if (!body.contentType || typeof body.contentType !== 'string') {
    throw new ValidationError('contentType is required');
  }

  if (!ALLOWED_MIME_TYPES.includes(body.contentType as typeof ALLOWED_MIME_TYPES[number])) {
    throw new ValidationError(`contentType must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`);
  }

  // Validate file size
  if (!body.fileSize || typeof body.fileSize !== 'number') {
    throw new ValidationError('fileSize is required and must be a number');
  }

  if (body.fileSize <= 0 || body.fileSize > MAX_FILE_SIZE) {
    throw new ValidationError(`fileSize must be between 1 byte and ${MAX_FILE_SIZE / (1024 * 1024)} MB`);
  }

  return {
    filename,
    contentType: body.contentType,
    fileSize: body.fileSize,
  };
}

// ─── Pagination Validation ──────────────────────────────────────────
export interface PaginationParams {
  limit: number;
  cursor?: string;
}

export function validatePaginationParams(queryParams: Record<string, string> | null): PaginationParams {
  const params = queryParams || {};

  let limit = parseInt(params.limit || '20', 10);
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100; // Cap at 100 to prevent abuse

  let cursor: string | undefined;
  if (params.cursor) {
    try {
      // Validate cursor is valid base64
      Buffer.from(params.cursor, 'base64').toString();
      cursor = params.cursor;
    } catch {
      throw new ValidationError('Invalid cursor format');
    }
  }

  return { limit, cursor };
}

// ─── Filename Sanitization ──────────────────────────────────────────
export function sanitizeFilename(filename: string): string {
  // Remove path components
  const basename = filename.replace(/^.*[\\/]/, '');
  // Remove null bytes and control characters
  const cleaned = basename.replace(/[\x00-\x1F\x7F]/g, '');
  // Replace spaces with underscores
  return cleaned.replace(/\s+/g, '_');
}
