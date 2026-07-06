import { eq } from 'drizzle-orm';
import type { H3Event } from 'h3';
import { firstRow, useDb } from '../db';
import { users } from '../db/schema';

export type UserRow = typeof users.$inferSelect;

/**
 * Requires a valid session cookie AND a still-existing user row. Loading the
 * fresh row per request keeps deleted/edited accounts behaving correctly
 * (the session payload only ever stores the user id).
 */
export async function requireAppUser(event: H3Event): Promise<UserRow> {
  const session = await requireUserSession(event);
  const row = firstRow(await useDb().select().from(users).where(eq(users.id, session.user.id)));
  if (!row) {
    await clearUserSession(event);
    unauthorized('User not found');
  }
  return row;
}

/** Strip secrets/token fields; mirrors the old toJSON transform. */
export function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    userName: row.userName,
    email: row.email,
    emailConfirmed: row.emailConfirmed,
    timezone: row.timezone,
  };
}
