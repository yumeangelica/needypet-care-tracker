/**
 * Pure decision logic and shapes for the daily care-task digest. The endpoint
 * (server/api/internal/daily-digest.post.ts) owns the DB and mailer; everything
 * here is side-effect-free so the send gate stays unit-testable.
 */

/** One unfinished care task, as it appears in the digest email. */
export interface DigestNeed {
  category: string;
  description: string;
}

/** A pet's section in the digest: its name and its open tasks for today. */
export interface DigestPetSection {
  petName: string;
  needs: DigestNeed[];
}

export interface DigestGateInput {
  digestOptIn: boolean;
  emailConfirmed: boolean;
  /** Today in the user's own timezone (YYYY-MM-DD). */
  localDate: string;
  /** Current hour (0–23) in the user's own timezone. */
  localHour: number;
  /** The last date a digest was sent to this user (user-local), or null. */
  lastDigestDate: string | null;
  /** The configured local hour a user must reach before the digest is sent. */
  sendHour: number;
}

/**
 * Whether this user should receive a digest right now: opted in, confirmed,
 * past the send hour on their own clock, and not already sent today. Date
 * strings compare lexicographically (chronological for YYYY-MM-DD).
 */
export function shouldSendDigestNow(input: DigestGateInput): boolean {
  if (!input.digestOptIn || !input.emailConfirmed) {
    return false;
  }
  if (input.localHour < input.sendHour) {
    return false;
  }
  return input.lastDigestDate === null || input.lastDigestDate < input.localDate;
}
