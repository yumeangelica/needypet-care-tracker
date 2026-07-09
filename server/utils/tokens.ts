/**
 * Single-use email tokens (confirmation, password reset). Only the sha256
 * hash is stored — a leaked database must never yield live links. The raw
 * token travels in the emailed URL exactly once.
 *
 * Fully Web-standard: Web Crypto (getRandomValues + subtle.digest), no node:*.
 */

/** 32 random bytes as a 43-char url-safe (base64url, unpadded) string. */
export async function createToken(): Promise<{ token: string; tokenHash: string }> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  return { token, tokenHash: await hashToken(token) };
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

export function expiryFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
