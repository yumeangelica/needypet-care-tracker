import { describe, expect, it } from 'vitest';
import en from '../../app/i18n/en';

/**
 * Static architecture guardrails: import/call-site patterns that must never
 * appear in app/server/shared source. Each check names the decision record
 * (docs/decisions/) it enforces, so a failure explains itself. Patterns are
 * import/call-shaped on purpose — prose in comments and docs stays free to
 * mention the forbidden things.
 */

const projectRoot = decodeURIComponent(new URL('../..', import.meta.url).pathname).replace(/\/$/, '');
const sourceGlob = new Bun.Glob('**/*.{ts,vue}');
const rasterGlob = new Bun.Glob('**/*.{png,jpg,jpeg,webp,ico}');

function sourceFiles(): string[] {
  const files: string[] = [];
  for (const dir of ['app', 'server', 'shared']) {
    for (const entry of sourceGlob.scanSync({ cwd: `${projectRoot}/${dir}`, onlyFiles: true })) {
      files.push(`${dir}/${entry}`);
    }
  }
  return files.sort();
}

/** Repo-relative files where `pattern` matches, with the rule's allowlist removed. */
async function filesMatching(pattern: RegExp, allowed: string[] = []): Promise<string[]> {
  const matches: string[] = [];
  for (const file of sourceFiles()) {
    if (!allowed.includes(file) && pattern.test(await Bun.file(`${projectRoot}/${file}`).text())) {
      matches.push(file);
    }
  }
  return matches;
}

function hasBytes(bytes: Uint8Array, offset: number, expected: number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function rasterMagicMatches(file: string, bytes: Uint8Array): boolean {
  const extension = file.split('.').at(-1)?.toLowerCase();
  if (extension === 'png') {
    return hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (extension === 'jpg' || extension === 'jpeg') {
    return hasBytes(bytes, 0, [0xff, 0xd8, 0xff]);
  }
  if (extension === 'webp') {
    return hasBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
      hasBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50]);
  }
  if (extension === 'ico') {
    return hasBytes(bytes, 0, [0x00, 0x00, 0x01, 0x00]);
  }
  return false;
}

describe('architecture guardrails', () => {
  it('imports temporal-polyfill only through the shared/utils/temporal.ts seam (ADR-0004)', async () => {
    expect(
      await filesMatching(/from\s+['"]temporal-polyfill['"]/, ['shared/utils/temporal.ts']),
    ).toEqual([]);
  });

  it('never constructs a legacy Date — Temporal only (ADR-0004)', async () => {
    expect(await filesMatching(/\bnew Date\s*\(/)).toEqual([]);
  });

  it('never imports node:crypto — Web Crypto and Bun natives only (ADR-0003)', async () => {
    expect(
      await filesMatching(/from\s+['"]node:crypto['"]|require\(\s*['"]node:crypto['"]\s*\)/),
    ).toEqual([]);
  });

  it('keeps raster file extensions aligned with their real formats', async () => {
    const mismatches: string[] = [];
    for (const dir of ['app', 'public']) {
      for (const entry of rasterGlob.scanSync({ cwd: `${projectRoot}/${dir}`, onlyFiles: true })) {
        const file = `${dir}/${entry}`;
        const bytes = new Uint8Array(
          await Bun.file(`${projectRoot}/${file}`).slice(0, 12).arrayBuffer(),
        );
        if (!rasterMagicMatches(file, bytes)) {
          mismatches.push(file);
        }
      }
    }
    expect(mismatches.sort()).toEqual([]);
  });

  it('stays store-free — no pinia or defineStore (ADR-0006)', async () => {
    expect(await filesMatching(/from\s+['"]pinia['"]|\bdefineStore\s*\(/)).toEqual([]);
  });

  it('keeps English UI copy free of first-person plural — no "we/our/us" (voice rule)', () => {
    // Solo-developer voice: the app addresses the user directly ("You'll get
    // an email…"), never as a team. Finnish verb forms (lähetämme, emme)
    // can't be pattern-checked reliably, so only en.ts is enforced here.
    const offenders: string[] = [];
    const walk = (obj: Record<string, unknown>, prefix: string) => {
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === 'object') {
          walk(value as Record<string, unknown>, path);
        } else if (typeof value === 'string' && /\b(we|our|us)\b/i.test(value)) {
          offenders.push(`${path}: ${value}`);
        }
      }
    };
    walk(en, '');
    expect(offenders).toEqual([]);
  });
});
