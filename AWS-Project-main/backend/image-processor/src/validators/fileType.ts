/**
 * File Type Validator — Magic Bytes Check
 * 
 * Validates that the uploaded file is actually an image by checking
 * the first few bytes (magic bytes / file signatures).
 * 
 * This is a critical security measure because:
 * - Content-Type headers can be spoofed
 * - File extensions can be changed
 * - Magic bytes are embedded in the file itself and cannot be spoofed
 *   without corrupting the file
 * 
 * This prevents attacks like:
 * - Uploading executable files disguised as images
 * - Uploading HTML files for XSS attacks
 * - Uploading ZIP/polyglot files
 */

interface MagicBytesSignature {
  mimeType: string;
  signatures: number[][];
  offset?: number; // Byte offset where signature starts (default 0)
}

const SIGNATURES: MagicBytesSignature[] = [
  {
    mimeType: 'image/jpeg',
    signatures: [
      [0xFF, 0xD8, 0xFF, 0xE0], // JFIF
      [0xFF, 0xD8, 0xFF, 0xE1], // EXIF
      [0xFF, 0xD8, 0xFF, 0xE2], // Canon JPEG
      [0xFF, 0xD8, 0xFF, 0xE8], // SPIFF
      [0xFF, 0xD8, 0xFF, 0xDB], // Samsung JPEG
      [0xFF, 0xD8, 0xFF, 0xEE], // Adobe JPEG
    ],
  },
  {
    mimeType: 'image/png',
    signatures: [
      [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], // PNG
    ],
  },
  {
    mimeType: 'image/gif',
    signatures: [
      [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
      [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
    ],
  },
  {
    mimeType: 'image/webp',
    // RIFF....WEBP
    signatures: [
      [0x52, 0x49, 0x46, 0x46], // RIFF header (first 4 bytes)
    ],
  },
  {
    // HEIC/HEIF (iPhone photos)
    mimeType: 'image/heic',
    signatures: [
      // ftyp box: offset 4 bytes, then "ftyp" followed by brand
      [0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], // ftypheic
      [0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x78], // ftypheix
      [0x66, 0x74, 0x79, 0x70, 0x6D, 0x69, 0x66, 0x31], // ftypmif1
    ],
    offset: 4,
  },
];

/**
 * Validate file's magic bytes and return detected MIME type
 * 
 * @param buffer - File buffer (at least first 16 bytes needed)
 * @returns Detected MIME type string, or null if not a valid image
 */
export function validateMagicBytes(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 8) {
    return null;
  }

  for (const sig of SIGNATURES) {
    const offset = sig.offset || 0;

    for (const signature of sig.signatures) {
      if (buffer.length < offset + signature.length) {
        continue;
      }

      let match = true;
      for (let i = 0; i < signature.length; i++) {
        if (buffer[offset + i] !== signature[i]) {
          match = false;
          break;
        }
      }

      if (match) {
        // Additional check for WebP: verify "WEBP" at offset 8
        if (sig.mimeType === 'image/webp') {
          if (buffer.length >= 12) {
            const webpMarker = buffer.slice(8, 12).toString('ascii');
            if (webpMarker !== 'WEBP') {
              continue; // RIFF but not WebP (could be WAV, AVI, etc.)
            }
          } else {
            continue;
          }
        }

        return sig.mimeType;
      }
    }
  }

  return null;
}

/**
 * Check if a MIME type is in the allowed list
 */
export function isAllowedMimeType(mimeType: string): boolean {
  const ALLOWED = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
  ];
  return ALLOWED.includes(mimeType);
}
