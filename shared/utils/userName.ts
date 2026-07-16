/**
 * Display usernames support international letters while excluding control
 * characters and punctuation that makes identifiers ambiguous in UI copy.
 * Combining marks are allowed after the initial letter/number.
 */
export const USER_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]*$/u;

export function normalizeUserName(userName: string): string {
  return userName.trim().normalize('NFKC').toLowerCase();
}
