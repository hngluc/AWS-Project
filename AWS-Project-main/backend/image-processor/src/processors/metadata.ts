import sharp from 'sharp';

/**
 * Metadata Extraction Module
 * 
 * Extracts EXIF metadata and image dimensions from the original image.
 * Uses Sharp's built-in metadata() function which reads EXIF from the image header
 * without fully decoding the image — very fast.
 */

export interface ImageMetadataResult {
  dimensions: {
    width: number;
    height: number;
  };
  exif: {
    camera?: string;
    focalLength?: string;
    iso?: number;
    aperture?: string;
    shutterSpeed?: string;
    dateTaken?: string;
    gps?: {
      lat: number;
      lng: number;
    };
  } | null;
  format: string;
  hasAlpha: boolean;
  colorSpace: string;
  fileSize?: number;
}

export async function extractMetadata(imageBuffer: Buffer): Promise<ImageMetadataResult> {
  const metadata = await sharp(imageBuffer).metadata();

  let exifData: ImageMetadataResult['exif'] = null;

  // Parse EXIF data if available
  if (metadata.exif) {
    try {
      // sharp exposes raw EXIF as Buffer, we need to parse it
      // Using dynamic import for tree-shaking
      const exifReader = await import('exif-reader');
      const parsedExif = exifReader.default
        ? exifReader.default(metadata.exif)
        : (exifReader as any)(metadata.exif);

      exifData = {};

      // Camera model
      if (parsedExif.Image?.Model || parsedExif.image?.Model) {
        exifData.camera = (parsedExif.Image?.Model || parsedExif.image?.Model)?.toString().trim();
      }
      if (parsedExif.Image?.Make || parsedExif.image?.Make) {
        const make = (parsedExif.Image?.Make || parsedExif.image?.Make)?.toString().trim();
        if (exifData.camera && make && !exifData.camera.startsWith(make)) {
          exifData.camera = `${make} ${exifData.camera}`;
        }
      }

      // Focal length
      const photo = parsedExif.Photo || parsedExif.exif || {};
      if (photo.FocalLength) {
        exifData.focalLength = `${photo.FocalLength}mm`;
      }

      // ISO
      if (photo.ISOSpeedRatings || photo.ISO) {
        const iso = photo.ISOSpeedRatings || photo.ISO;
        exifData.iso = Array.isArray(iso) ? iso[0] : iso;
      }

      // Aperture
      if (photo.FNumber) {
        exifData.aperture = `f/${photo.FNumber}`;
      }

      // Shutter speed
      if (photo.ExposureTime) {
        const exposure = photo.ExposureTime;
        if (exposure < 1) {
          exifData.shutterSpeed = `1/${Math.round(1 / exposure)}s`;
        } else {
          exifData.shutterSpeed = `${exposure}s`;
        }
      }

      // Date taken
      if (photo.DateTimeOriginal) {
        exifData.dateTaken = new Date(photo.DateTimeOriginal).toISOString();
      }

      // GPS coordinates
      const gps = parsedExif.GPSInfo || parsedExif.gps || {};
      if (gps.GPSLatitude && gps.GPSLongitude) {
        try {
          const lat = convertDMSToDecimal(
            gps.GPSLatitude,
            gps.GPSLatitudeRef || 'N',
          );
          const lng = convertDMSToDecimal(
            gps.GPSLongitude,
            gps.GPSLongitudeRef || 'E',
          );

          if (!isNaN(lat) && !isNaN(lng)) {
            exifData.gps = { lat, lng };
          }
        } catch {
          // GPS parsing failed — skip silently
        }
      }

      // Clean up empty exif object
      if (Object.values(exifData).every(v => v === undefined)) {
        exifData = null;
      }
    } catch (error) {
      console.warn('EXIF parsing failed, continuing without EXIF data', {
        error: error instanceof Error ? error.message : String(error),
      });
      exifData = null;
    }
  }

  return {
    dimensions: {
      width: metadata.width || 0,
      height: metadata.height || 0,
    },
    exif: exifData,
    format: metadata.format || 'unknown',
    hasAlpha: metadata.hasAlpha || false,
    colorSpace: metadata.space || 'unknown',
    fileSize: metadata.size,
  };
}

/**
 * Convert GPS DMS (Degrees, Minutes, Seconds) to decimal degrees
 */
function convertDMSToDecimal(
  dms: number[],
  ref: string,
): number {
  if (!dms || dms.length < 3) return NaN;

  let decimal = dms[0] + dms[1] / 60 + dms[2] / 3600;

  if (ref === 'S' || ref === 'W') {
    decimal = -decimal;
  }

  return Math.round(decimal * 1000000) / 1000000; // 6 decimal places
}
