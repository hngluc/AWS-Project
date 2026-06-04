/**
 * Image Metadata Type Definitions
 * 
 * These types define the shape of data stored in DynamoDB.
 * They map directly to the schema defined in the implementation plan.
 */

export type ImageStatus = 'UPLOADING' | 'PROCESSING' | 'ANALYZING' | 'COMPLETED' | 'FAILED';
export type ModerationStatus = 'PENDING' | 'SAFE' | 'FLAGGED' | 'REJECTED';
export type Visibility = 'PUBLIC' | 'PRIVATE';

export interface AiTag {
  name: string;
  confidence: number; // 0-100
}

export interface ModerationLabel {
  name: string;
  confidence: number;
  parentName?: string;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ExifData {
  camera?: string;
  focalLength?: string;
  iso?: number;
  aperture?: string;
  shutterSpeed?: string;
  gps?: {
    lat: number;
    lng: number;
  };
  dateTaken?: string;
}

export interface ImageMetadata {
  // DynamoDB Keys
  PK: string;              // USER#<userId>
  SK: string;              // IMG#<YYYYMMDD>T<HHmmss>#<ulid>

  // Core fields
  imageId: string;          // ULID
  userId: string;           // Cognito sub
  originalFilename: string;
  mimeType: string;
  fileSize: number;         // bytes

  // S3 keys
  originalKey: string;      // users/<userId>/original/<filename>
  thumbnailKey?: string;    // users/<userId>/thumbnails/<imageId>.webp
  resizedKey?: string;      // users/<userId>/resized/<imageId>.webp

  // Image data
  dimensions?: ImageDimensions;
  exifData?: ExifData;

  // AI Analysis results
  aiTags?: AiTag[];
  moderationLabels?: ModerationLabel[];
  moderationStatus: ModerationStatus;

  // Status & metadata
  status: ImageStatus;
  visibility: Visibility;
  createdAt: string;        // ISO 8601
  updatedAt: string;        // ISO 8601

  // GSI keys (denormalized for efficient querying)
  GSI1PK?: string;          // TAG#<tagName> (written per-tag in separate items)
  GSI1SK?: string;          // IMG#<imageId>
  GSI2PK?: string;          // MOD#<status>
  GSI2SK?: string;          // <timestamp>
}

/**
 * Input for creating a new image record (before upload)
 */
export interface CreateImageInput {
  userId: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
}

/**
 * Client-facing image data (returned by API)
 */
export interface ImageResponse {
  imageId: string;
  originalFilename: string;
  thumbnailUrl?: string;
  resizedUrl?: string;
  mimeType: string;
  fileSize: number;
  dimensions?: ImageDimensions;
  exifData?: ExifData;
  aiTags?: AiTag[];
  moderationStatus: ModerationStatus;
  status: ImageStatus;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
}
