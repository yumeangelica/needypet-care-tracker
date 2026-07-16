import { and, eq, gt } from 'drizzle-orm';
import { confirmEmailSchema } from '#shared/schemas/user';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { firstRow, useDb } from '../../db';
import { users } from '../../db/schema';
import { checkRateLimit, rateLimitIp } from '../../utils/rateLimit';
import { hashToken } from '../../utils/tokens';

/**
 * Public (works logged out — the link may be opened on another device).
 * One generic failure message: no oracle for token-vs-expiry.
 */
export default defineEventHandler(async (event) => {
  await checkRateLimit(event, `confirm:ip:${rateLimitIp(event)}`, {
    max: 10,
    windowMs: 60 * 60_000,
  });

  const input = await readValidatedBodyOr422(event, confirmEmailSchema);
  const db = useDb();
  const now = instantToIso(Temporal.Now.instant());

  const tokenHash = await hashToken(input.token);
  const user = firstRow(
    await db
      .update(users)
      .set({
        emailConfirmed: true,
        emailConfirmToken: null,
        emailConfirmExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(eq(users.emailConfirmToken, tokenHash), gt(users.emailConfirmExpiresAt, now)),
      )
      .returning({ id: users.id }),
  );
  if (!user) {
    badRequest('That confirmation link has expired or was already used', 'errors.confirmLinkExpired');
  }

  return { message: 'Your email is confirmed! 🐾' };
});
