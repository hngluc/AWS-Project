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
 * Image Processing Utilities using Sharp (Streaming Version)
 * 
 * Returns Sharp Transform streams instead of Buffers to prevent Out-Of-Memory (OOM)
 * issues when processing large images.
 */

export function getThumbnailTransform(
  width: number = 200,
  height: number = 200,
) {
  return sharp()
    .rotate() // Auto-rotate based on EXIF orientation
    .resize(width, height, {
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: false,
    })
    .webp({
      quality: 80,
      effort: 4,
      smartSubsample: true,
    });
}

export function getResizedTransform(
  maxWidth: number = 1920,
  maxHeight: number = 1080,
) {
  return sharp()
    .rotate() // Auto-rotate based on EXIF orientation
    .resize(maxWidth, maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: 85,
      effort: 4,
      smartSubsample: true,
    });
}
