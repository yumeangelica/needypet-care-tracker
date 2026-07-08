/**
 * Password hashing via Bun's native `Bun.password` (no external dependency).
 *
 * New hashes use argon2id (OWASP's first-choice password KDF). Legacy accounts
 * created before this migration carry bcrypt (`$2…`) hashes; `Bun.password.verify`
 * transparently verifies those too, so no forced reset is needed. Call sites that
 * verify a login can upgrade a legacy hash in place — see `passwordNeedsRehash`.
 *
 * These are deliberately named apart from nuxt-auth-utils' auto-imported
 * `hashPassword`/`verifyPassword` (scrypt via @adonisjs/hash) to avoid an
 * ambiguous collision — that implementation can't verify the existing bcrypt
 * hashes, so the app owns its own argon2id + bcrypt-compatible helpers.
 */

/** Hash a plaintext password with argon2id for storage. */
export function hashUserPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'argon2id' });
}

/** Verify a plaintext password against a stored hash (argon2id or legacy bcrypt). */
export function verifyUserPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

/**
 * True when a stored hash predates the argon2id migration (bcrypt `$2…`), so a
 * successful login can re-hash and store the upgraded value.
 */
export function passwordNeedsRehash(hash: string): boolean {
  return hash.startsWith('$2');
}
