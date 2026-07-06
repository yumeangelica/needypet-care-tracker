import { describe, expect, it } from 'vitest';
import { sniffImageType } from '../../shared/utils/imageValidation';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
]);

describe('sniffImageType', () => {
  it('recognizes JPEG magic bytes', () => {
    expect(sniffImageType(JPEG)).toEqual({ ext: 'jpg', contentType: 'image/jpeg' });
  });

  it('recognizes PNG magic bytes', () => {
    expect(sniffImageType(PNG)).toEqual({ ext: 'png', contentType: 'image/png' });
  });

  it('recognizes WebP magic bytes (RIFF....WEBP)', () => {
    expect(sniffImageType(WEBP)).toEqual({ ext: 'webp', contentType: 'image/webp' });
  });

  it('rejects GIF, SVG, PDF and plain text', () => {
    const gif = new TextEncoder().encode('GIF89a...');
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const pdf = new TextEncoder().encode('%PDF-1.7 ...');
    const text = new TextEncoder().encode('definitely-not-an-image.png');
    for (const data of [gif, svg, pdf, text]) {
      expect(sniffImageType(data)).toBeNull();
    }
  });

  it('rejects truncated headers and empty buffers', () => {
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e]))).toBeNull();
    // RIFF container that is not WebP (e.g. WAV)
    expect(
      sniffImageType(
        Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]),
      ),
    ).toBeNull();
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
  });
});
