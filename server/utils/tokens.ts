import { createHash, randomBytes } from 'node:crypto';

/**
 * Single-use email tokens (confirmation, password reset). Only the sha256
 * hash is stored — a leaked database must never yield live links. The raw
 * token travels in the emailed URL exactly once.
 */

export function createToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function expiryFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}
