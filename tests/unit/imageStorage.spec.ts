import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalDiskStorage, R2Storage } from '../../server/utils/imageStorage';

const OPTIONS = {
  endpoint: 'https://acc123.r2.cloudflarestorage.com',
  accessKeyId: 'access-key',
  secretAccessKey: 'secret-key',
  bucket: 'pet-photos',
  publicBaseUrl: 'https://pub-abc.r2.dev',
};

/** Same shape as tests/unit/mailer.spec.ts: record calls, return a real Response. */
function stubFetch(status: number, body = '') {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(body, { status });
  }) as typeof globalThis.fetch;
  return { fetchImpl, calls };
}

describe('R2Storage', () => {
  const key = 'pets/abc/photo.png';
  const objectUrl = `${OPTIONS.endpoint}/${OPTIONS.bucket}/${key}`;

  it('PUTs to the S3 object endpoint with a SigV4 signature and the given bytes', async () => {
    const { fetchImpl, calls } = stubFetch(200);
    const storage = new R2Storage(OPTIONS, fetchImpl);
    const data = Uint8Array.from([1, 2, 3, 4]);
    await storage.put(key, data, 'image/png');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(objectUrl);
    expect(calls[0]!.init.method).toBe('PUT');
    const headers = calls[0]!.init.headers as Record<string, string>;
    // SigV4 auth header, well-formed for R2 (region "auto", service "s3").
    expect(headers.Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=access-key\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/,
    );
    expect(headers['content-type']).toBe('image/png');
    expect(headers['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(headers['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
    expect(calls[0]!.init.body).toBe(data);
  });

  it('throws with status and trimmed body when put fails', async () => {
    const { fetchImpl } = stubFetch(500, 'internal error');
    const storage = new R2Storage(OPTIONS, fetchImpl);
    await expect(storage.put(key, Uint8Array.from([1]), 'image/png')).rejects.toThrow(
      /status 500.*internal error/,
    );
  });

  it('DELETEs to the S3 object endpoint with a SigV4 signature', async () => {
    const { fetchImpl, calls } = stubFetch(200);
    const storage = new R2Storage(OPTIONS, fetchImpl);
    await storage.remove(key);

    expect(calls[0]!.url).toBe(objectUrl);
    expect(calls[0]!.init.method).toBe('DELETE');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=access-key\//,
    );
    // No body is sent on a delete.
    expect(calls[0]!.init.body).toBeUndefined();
  });

  it('treats a 404 on remove as success (already gone)', async () => {
    const { fetchImpl } = stubFetch(404, 'Not found');
    const storage = new R2Storage(OPTIONS, fetchImpl);
    await expect(storage.remove(key)).resolves.toBeUndefined();
  });

  it('throws on a non-404 remove failure', async () => {
    const { fetchImpl } = stubFetch(500, 'boom');
    const storage = new R2Storage(OPTIONS, fetchImpl);
    await expect(storage.remove(key)).rejects.toThrow(/status 500.*boom/);
  });

  it('builds a public object URL from the public base', () => {
    const storage = new R2Storage(OPTIONS, stubFetch(200).fetchImpl);
    expect(storage.publicUrl(key)).toBe(`${OPTIONS.publicBaseUrl}/${key}`);
  });
});

describe('LocalDiskStorage', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'needypet-storage-'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writes then reads back the exact bytes', async () => {
    const storage = new LocalDiskStorage(root);
    const key = 'pets/p1/photo.png';
    const data = Uint8Array.from([10, 20, 30, 40]);
    await storage.put(key, data, 'image/png');
    expect(Uint8Array.from(readFileSync(join(root, key)))).toEqual(data);
  });

  it('removes a stored file and tolerates a missing one', async () => {
    const storage = new LocalDiskStorage(root);
    const key = 'pets/p2/photo.png';
    await storage.put(key, Uint8Array.from([1]), 'image/png');
    await storage.remove(key);
    // Second remove of the now-missing file must not throw.
    await expect(storage.remove(key)).resolves.toBeUndefined();
  });

  it('rejects a key that escapes the uploads root', async () => {
    const storage = new LocalDiskStorage(root);
    await expect(storage.put('../escape.png', Uint8Array.from([1]), 'image/png')).rejects.toThrow(
      /escapes the uploads root/,
    );
  });

  it('serves a relative public URL under /uploads', () => {
    const storage = new LocalDiskStorage(root);
    expect(storage.publicUrl('pets/p1/x.png')).toBe('/uploads/pets/p1/x.png');
  });
});
