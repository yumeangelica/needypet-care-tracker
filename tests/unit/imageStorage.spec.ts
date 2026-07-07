import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalDiskStorage, SupabaseStorage } from '../../server/utils/imageStorage';

const OPTIONS = { url: 'https://proj.supabase.test', serviceKey: 'service-key', bucket: 'pet-photos' };

/** Same shape as tests/unit/mailer.spec.ts: record calls, return a real Response. */
function stubFetch(status: number, body = '') {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(body, { status });
  }) as typeof globalThis.fetch;
  return { fetchImpl, calls };
}

describe('SupabaseStorage', () => {
  const key = 'pets/abc/photo.png';

  it('PUTs to the object endpoint with auth, content-type and upsert', async () => {
    const { fetchImpl, calls } = stubFetch(200);
    const storage = new SupabaseStorage(OPTIONS, fetchImpl);
    const data = Uint8Array.from([1, 2, 3, 4]);
    await storage.put(key, data, 'image/png');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${OPTIONS.url}/storage/v1/object/${OPTIONS.bucket}/${key}`);
    expect(calls[0]!.init.method).toBe('POST');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer service-key');
    expect(headers['Content-Type']).toBe('image/png');
    expect(headers['x-upsert']).toBe('true');
    expect(calls[0]!.init.body).toBe(data);
  });

  it('throws with status and trimmed body when put fails', async () => {
    const { fetchImpl } = stubFetch(500, 'internal error');
    const storage = new SupabaseStorage(OPTIONS, fetchImpl);
    await expect(storage.put(key, Uint8Array.from([1]), 'image/png')).rejects.toThrow(
      /status 500.*internal error/,
    );
  });

  it('DELETEs to the object endpoint on remove', async () => {
    const { fetchImpl, calls } = stubFetch(200);
    const storage = new SupabaseStorage(OPTIONS, fetchImpl);
    await storage.remove(key);

    expect(calls[0]!.url).toBe(`${OPTIONS.url}/storage/v1/object/${OPTIONS.bucket}/${key}`);
    expect(calls[0]!.init.method).toBe('DELETE');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer service-key');
  });

  it('treats a 404 on remove as success (already gone)', async () => {
    const { fetchImpl } = stubFetch(404, 'Not found');
    const storage = new SupabaseStorage(OPTIONS, fetchImpl);
    await expect(storage.remove(key)).resolves.toBeUndefined();
  });

  it('throws on a non-404 remove failure', async () => {
    const { fetchImpl } = stubFetch(500, 'boom');
    const storage = new SupabaseStorage(OPTIONS, fetchImpl);
    await expect(storage.remove(key)).rejects.toThrow(/status 500.*boom/);
  });

  it('builds a public object URL', () => {
    const storage = new SupabaseStorage(OPTIONS, stubFetch(200).fetchImpl);
    expect(storage.publicUrl(key)).toBe(
      `${OPTIONS.url}/storage/v1/object/public/${OPTIONS.bucket}/${key}`,
    );
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
