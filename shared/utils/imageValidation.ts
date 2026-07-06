export interface SniffedImage {
  ext: 'jpg' | 'png' | 'webp';
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
}

/**
 * Identifies an uploaded image by magic bytes only — the client-supplied
 * filename and content type are never trusted. Allowlist: JPEG, PNG, WebP.
 */
export function sniffImageType(data: Uint8Array): SniffedImage | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  ) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (
    data.length >= 12 &&
    data[0] === 0x52 && // R
    data[1] === 0x49 && // I
    data[2] === 0x46 && // F
    data[3] === 0x46 && // F
    data[8] === 0x57 && // W
    data[9] === 0x45 && // E
    data[10] === 0x42 && // B
    data[11] === 0x50 // P
  ) {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  return null;
}
