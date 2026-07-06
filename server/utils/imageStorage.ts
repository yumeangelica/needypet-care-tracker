import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

/**
 * Pet image storage seam, mirroring the mailer pattern: local disk for dev,
 * a production adapter (e.g. a fetch-based Supabase Storage class) plugs in
 * here switched on runtime config, without touching calling code.
 */
export interface ImageStorage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  publicUrl(key: string): string;
}

export class LocalDiskStorage implements ImageStorage {
  constructor(private readonly rootDir: string) {}

  private resolveSafe(key: string): string {
    const root = resolve(this.rootDir);
    const filePath = resolve(root, key);
    if (!filePath.startsWith(root + sep)) {
      throw new Error(`Storage key escapes the uploads root: ${key}`);
    }
    return filePath;
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const filePath = this.resolveSafe(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolveSafe(key), { force: true });
  }

  /** Served by server/routes/uploads/[...path].get.ts. */
  publicUrl(key: string): string {
    return `/uploads/${key}`;
  }
}

let storage: ImageStorage | null = null;

export function useImageStorage(): ImageStorage {
  if (!storage) {
    const config = useRuntimeConfig().uploads;
    // Only the local provider exists today; a cloud adapter switches here.
    storage = new LocalDiskStorage(config.dir);
  }
  return storage;
}

/** Fire-and-forget cleanup: an orphaned file must never fail the request. */
export async function removeStoredImageQuietly(key: string | null | undefined): Promise<void> {
  if (!key) {
    return;
  }
  try {
    await useImageStorage().remove(key);
  } catch (error) {
    console.error(`[imageStorage] Failed to remove ${key}:`, error);
  }
}
