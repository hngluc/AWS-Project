import sharp from 'sharp';

/**
 * Image Processing Utilities using Sharp
 * 
 * Sharp is the fastest Node.js image processing library.
 * It uses libvips under the hood (10x faster than ImageMagick).
 * 
 * Output format: WebP
 * - 25-35% smaller than JPEG at same quality
 * - Supports transparency (unlike JPEG)
 * - Widely supported in modern browsers
 */

/**
 * Generate a thumbnail with cover crop (fills the frame, crops excess)
 * 
 * @param imageBuffer - Original image buffer
 * @param width - Target thumbnail width (default 200)
 * @param height - Target thumbnail height (default 200)
 * @returns WebP buffer of the thumbnail
 */
export async function generateThumbnail(
  imageBuffer: Buffer,
  width: number = 200,
  height: number = 200,
): Promise<Buffer> {
  return sharp(imageBuffer)
    .rotate() // Auto-rotate based on EXIF orientation
    .resize(width, height, {
      fit: 'cover',       // Fill the frame, crop if needed
      position: 'centre', // Center the crop
      withoutEnlargement: false, // Allow upscaling for small images
    })
    .webp({
      quality: 80,        // Good quality for thumbnails
      effort: 4,          // Compression effort (0-6, higher = slower + smaller)
      smartSubsample: true,
    })
    .toBuffer();
}

/**
 * Generate a resized version that fits within max dimensions
 * Preserves aspect ratio (no cropping).
 * 
 * @param imageBuffer - Original image buffer
 * @param maxWidth - Maximum width (default 1920)
 * @param maxHeight - Maximum height (default 1080)
 * @returns WebP buffer of the resized image
 */
export async function generateResized(
  imageBuffer: Buffer,
  maxWidth: number = 1920,
  maxHeight: number = 1080,
): Promise<Buffer> {
  return sharp(imageBuffer)
    .rotate() // Auto-rotate based on EXIF orientation
    .resize(maxWidth, maxHeight, {
      fit: 'inside',              // Fit within bounds, preserve aspect ratio
      withoutEnlargement: true,   // Don't upscale if already smaller
    })
    .webp({
      quality: 85,                // Higher quality for full-size view
      effort: 4,
      smartSubsample: true,
    })
    .toBuffer();
}
