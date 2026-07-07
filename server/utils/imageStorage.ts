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

/**
 * Production adapter: Supabase Storage over its plain REST API (no SDK
 * dependency). Mirrors ResendMailer — an options object plus an injectable
 * `fetchImpl` so unit tests can stub the network; a non-2xx response throws
 * with the status and a trimmed body.
 *
 * The bucket is PUBLIC on purpose: `publicUrl()` is synchronous, so signed
 * (expiring) URLs don't fit the interface, and the local `/uploads` route is
 * likewise unauthenticated (keys carry an unguessable UUID) — same trust model.
 */
export class SupabaseStorage implements ImageStorage {
  constructor(
    private readonly options: { url: string; serviceKey: string; bucket: string },
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  private objectUrl(key: string): string {
    return `${this.options.url}/storage/v1/object/${this.options.bucket}/${key}`;
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    const response = await this.fetchImpl(this.objectUrl(key), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.options.serviceKey}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      // Uint8Array is a valid fetch body at runtime; the DOM typings for
      // BodyInit don't include it under this TS config.
      body: data as unknown as BodyInit,
    });
    if (!response.ok) {
      const body = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`Supabase storage put failed with status ${response.status}: ${body}`);
    }
  }

  async remove(key: string): Promise<void> {
    const response = await this.fetchImpl(this.objectUrl(key), {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${this.options.serviceKey}` },
    });
    // 404 means the object is already gone; mirror LocalDiskStorage.remove's
    // rm({ force: true }) semantics and treat that as success.
    if (!response.ok && response.status !== 404) {
      const body = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`Supabase storage remove failed with status ${response.status}: ${body}`);
    }
  }

  publicUrl(key: string): string {
    return `${this.options.url}/storage/v1/object/public/${this.options.bucket}/${key}`;
  }
}

let storage: ImageStorage | null = null;

export function useImageStorage(): ImageStorage {
  if (!storage) {
    const config = useRuntimeConfig().uploads;
    if (config.provider === 'supabase') {
      // Fail fast: a misconfigured cloud provider must NOT silently fall back to
      // local disk in production, where the disk is ephemeral (silent photo loss).
      if (!config.supabaseUrl || !config.supabaseServiceKey || !config.supabaseBucket) {
        throw new Error('uploads.provider is "supabase" but NUXT_UPLOADS_SUPABASE_* is incomplete');
      }
      storage = new SupabaseStorage({
        url: config.supabaseUrl,
        serviceKey: config.supabaseServiceKey,
        bucket: config.supabaseBucket,
      });
    } else {
      storage = new LocalDiskStorage(config.dir);
    }
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
