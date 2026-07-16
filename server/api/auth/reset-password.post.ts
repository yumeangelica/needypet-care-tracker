import { and, eq, gt, sql } from 'drizzle-orm';
import { resetPasswordSchema } from '#shared/schemas/user';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { firstRow, useDb } from '../../db';
import { users } from '../../db/schema';
import { hashUserPassword } from '../../utils/password';
import { checkRateLimit, rateLimitIp } from '../../utils/rateLimit';
import { hashToken } from '../../utils/tokens';

/**
 * Public. Completing a reset also confirms the email — the link proves
 * mailbox ownership. Bumping sessionVersion invalidates every existing
 * sealed-cookie session for the account.
 */
export default defineEventHandler(async (event) => {
  await checkRateLimit(event, `reset:ip:${rateLimitIp(event)}`, {
    max: 10,
    windowMs: 60 * 60_000,
  });

  const input = await readValidatedBodyOr422(event, resetPasswordSchema);
  const db = useDb();
  const now = instantToIso(Temporal.Now.instant());

  const tokenHash = await hashToken(input.token);
  const user = firstRow(
    await db
      .update(users)
      .set({
        passwordHash: await hashUserPassword(input.newPassword),
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        emailConfirmed: true,
        emailConfirmToken: null,
        emailConfirmExpiresAt: null,
        sessionVersion: sql`${users.sessionVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(eq(users.passwordResetToken, tokenHash), gt(users.passwordResetExpiresAt, now)),
      )
      .returning({ id: users.id }),
  );
  if (!user) {
    badRequest('That reset link has expired or was already used', 'errors.resetLinkExpired');
  }

  return { message: 'Your paw code is updated! You can sign in now. 🐾' };
});
