import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Serves locally stored pet photos (dev/local provider). URLs are public but
 * unguessable (a UUID in the storage key); files are immutable — a replaced
 * photo gets a new key — so aggressive caching is safe.
 */
export default defineEventHandler(async (event) => {
  const rawPath = getRouterParam(event, 'path') ?? '';
  const root = resolve(useRuntimeConfig().uploads.dir);
  const filePath = resolve(root, rawPath);
  // Resolve + prefix check kills any ../ traversal attempt.
  if (!filePath.startsWith(root + sep)) {
    notFound();
  }

  const ext = filePath.split('.').pop() ?? '';
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    notFound();
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      notFound();
    }
    setResponseHeader(event, 'Content-Type', contentType);
    setResponseHeader(event, 'Content-Length', info.size);
    setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable');
    return sendStream(event, createReadStream(filePath));
  } catch {
    notFound();
  }
});
