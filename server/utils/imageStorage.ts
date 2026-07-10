import { resolve, sep } from 'node:path';
// Relative (not #shared): this module is imported directly from vitest specs,
// where the Nuxt '#shared' alias is not registered.
import { instantToIso } from '../../shared/utils/datetime';
import { Temporal } from '../../shared/utils/temporal';

/**
 * Pet image storage seam, mirroring the mailer pattern: local disk for dev,
 * a production adapter (a fetch-based Cloudflare R2 class) plugs in here
 * switched on runtime config, without touching calling code.
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
    // Bun.write creates any missing parent directories and writes the bytes.
    await Bun.write(this.resolveSafe(key), data);
  }

  async remove(key: string): Promise<void> {
    try {
      await Bun.file(this.resolveSafe(key)).delete();
    } catch (error) {
      // A missing file is already "removed" (same force semantics as fs.rm).
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /** Served by server/routes/uploads/[...path].get.ts. */
  publicUrl(key: string): string {
    return `/uploads/${key}`;
  }
}

export interface R2Options {
  /** S3 API endpoint, e.g. https://<accountId>.r2.cloudflarestorage.com */
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Public read base, e.g. https://pub-<hash>.r2.dev or a custom domain. */
  publicBaseUrl: string;
}

/**
 * Production adapter: Cloudflare R2 over its S3-compatible REST API (no SDK).
 * Writes/deletes are signed with AWS Signature V4 using Web Crypto HMAC-SHA256
 * (no node:crypto). Mirrors the mailer seam — an injectable `fetchImpl` so unit
 * tests can stub the network; a non-2xx response throws with a trimmed body.
 *
 * The bucket is PUBLIC for reads: `publicUrl()` returns the public base URL, so
 * signed (expiring) URLs don't fit the interface, and the local `/uploads` route
 * is likewise unauthenticated (keys carry an unguessable UUID) — same trust model.
 */
export class R2Storage implements ImageStorage {
  private readonly host: string;

  constructor(
    private readonly options: R2Options,
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.host = new URL(options.endpoint).host;
  }

  private objectUrl(key: string): string {
    return `${this.options.endpoint}/${this.options.bucket}/${encodeS3Key(key)}`;
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    const response = await this.signedRequest('PUT', key, data, contentType);
    if (!response.ok) {
      const body = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`R2 storage put failed with status ${response.status}: ${body}`);
    }
  }

  async remove(key: string): Promise<void> {
    const response = await this.signedRequest('DELETE', key, new Uint8Array(0));
    // 404 means the object is already gone; mirror LocalDiskStorage.remove's
    // rm({ force: true }) semantics and treat that as success.
    if (!response.ok && response.status !== 404) {
      const body = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`R2 storage remove failed with status ${response.status}: ${body}`);
    }
  }

  publicUrl(key: string): string {
    return `${this.options.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }

  /** Signs one S3 request with AWS SigV4 (region "auto", service "s3"). */
  private async signedRequest(
    method: 'PUT' | 'DELETE',
    key: string,
    body: Uint8Array,
    contentType?: string,
  ): Promise<Response> {
    const now = Temporal.Now.instant();
    const amzDate = toAmzDate(now); // 20260709T120000Z
    const dateStamp = amzDate.slice(0, 8); // 20260709
    const region = 'auto';
    const service = 's3';
    const canonicalUri = `/${this.options.bucket}/${encodeS3Key(key)}`;
    const payloadHash = await sha256Hex(body);

    const headers: Record<string, string> = {
      host: this.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (contentType) {
      headers['content-type'] = contentType;
    }
    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join('');
    const signedHeaders = signedHeaderNames.join(';');

    const canonicalRequest = [
      method,
      canonicalUri,
      '', // no query string
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const scope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      await sha256Hex(new TextEncoder().encode(canonicalRequest)),
    ].join('\n');

    const signingKey = await deriveSigningKey(
      this.options.secretAccessKey,
      dateStamp,
      region,
      service,
    );
    const signature = toHex(new Uint8Array(await hmac(signingKey, stringToSign)));

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${this.options.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return this.fetchImpl(this.objectUrl(key), {
      method,
      headers: { ...headers, Authorization: authorization },
      // Uint8Array is a valid fetch body at runtime; the DOM typings for
      // BodyInit don't include it under this TS config.
      ...(method === 'PUT' ? { body: body as unknown as BodyInit } : {}),
    });
  }
}

/** Percent-encode a storage key for an S3 path, keeping "/" separators. */
function encodeS3Key(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

function toAmzDate(instant: Temporal.Instant): string {
  // SigV4 wants the compact basic form: 20260709T120000Z (no separators, no ms).
  return instantToIso(instant).replace(/[:-]|\.\d{3}/g, '');
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource)));
}

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message) as BufferSource);
}

/** AWS SigV4 signing-key derivation: HMAC chain from the secret. */
async function deriveSigningKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secret}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

let storage: ImageStorage | null = null;

export function useImageStorage(): ImageStorage {
  if (!storage) {
    const config = useRuntimeConfig().uploads;
    if (config.provider === 'r2') {
      // Fail fast: a misconfigured cloud provider must NOT silently fall back to
      // local disk in production, where the disk is ephemeral (silent photo loss).
      if (
        !config.r2Endpoint ||
        !config.r2AccessKeyId ||
        !config.r2SecretAccessKey ||
        !config.r2Bucket ||
        !config.r2PublicBaseUrl
      ) {
        throw new Error('uploads.provider is "r2" but NUXT_UPLOADS_R2_* is incomplete');
      }
      storage = new R2Storage({
        endpoint: config.r2Endpoint,
        accessKeyId: config.r2AccessKeyId,
        secretAccessKey: config.r2SecretAccessKey,
        bucket: config.r2Bucket,
        publicBaseUrl: config.r2PublicBaseUrl,
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
