import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import en from '../../app/i18n/en';

/**
 * Static architecture guardrails: import/call-site patterns that must never
 * appear in app/server/shared source. Each check names the decision record
 * (docs/decisions/) it enforces, so a failure explains itself. Patterns are
 * import/call-shaped on purpose — prose in comments and docs stays free to
 * mention the forbidden things.
 */

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

function sourceFiles(): string[] {
  const files: string[] = [];
  for (const dir of ['app', 'server', 'shared']) {
    for (const entry of readdirSync(resolve(projectRoot, dir), { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && /\.(ts|vue)$/.test(entry.name)) {
        // parentPath is absolute here; keep repo-relative paths for readable failures.
        files.push(join(entry.parentPath, entry.name).slice(projectRoot.length));
      }
    }
  }
  return files.sort();
}

/** Repo-relative files where `pattern` matches, with the rule's allowlist removed. */
function filesMatching(pattern: RegExp, allowed: string[] = []): string[] {
  return sourceFiles()
    .filter((file) => !allowed.includes(file))
    .filter((file) => pattern.test(readFileSync(resolve(projectRoot, file), 'utf8')));
}

describe('architecture guardrails', () => {
  it('imports temporal-polyfill only through the shared/utils/temporal.ts seam (ADR-0004)', () => {
    expect(
      filesMatching(/from\s+['"]temporal-polyfill['"]/, ['shared/utils/temporal.ts']),
    ).toEqual([]);
  });

  it('never constructs a legacy Date — Temporal only (ADR-0004)', () => {
    expect(filesMatching(/\bnew Date\s*\(/)).toEqual([]);
  });

  it('never imports node:crypto — Web Crypto and Bun natives only (ADR-0003)', () => {
    expect(
      filesMatching(/from\s+['"]node:crypto['"]|require\(\s*['"]node:crypto['"]\s*\)/),
    ).toEqual([]);
  });

  it('stays store-free — no pinia or defineStore (ADR-0006)', () => {
    expect(filesMatching(/from\s+['"]pinia['"]|\bdefineStore\s*\(/)).toEqual([]);
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
