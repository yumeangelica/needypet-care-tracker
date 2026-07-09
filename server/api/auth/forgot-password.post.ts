import { eq } from 'drizzle-orm';
import { forgotPasswordSchema } from '#shared/schemas/user';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { firstRow, useDb } from '../../db';
import { users } from '../../db/schema';
import { passwordResetMessage, useMailer } from '../../utils/mailer';
import { checkRateLimit, rateLimitIp } from '../../utils/rateLimit';
import { createToken, expiryFromNow } from '../../utils/tokens';

/**
 * Public. ALWAYS answers 200 with the same message so the endpoint can't be
 * used to probe which emails have accounts. A repeated request overwrites
 * the previous token — the latest link wins.
 */
export default defineEventHandler(async (event) => {
  checkRateLimit(event, `forgot:ip:${rateLimitIp(event)}`, { max: 5, windowMs: 60 * 60_000 });

  const input = await readValidatedBodyOr422(event, forgotPasswordSchema);
  const db = useDb();
  const email = input.email.toLowerCase();

  // Per-address cap keeps the endpoint from being used to flood a mailbox.
  checkRateLimit(event, `forgot:email:${email}`, { max: 3, windowMs: 60 * 60_000 });

  const user = firstRow(await db.select({ id: users.id }).from(users).where(eq(users.email, email)));
  if (user) {
    const reset = await createToken();
    await db
      .update(users)
      .set({
        passwordResetToken: reset.tokenHash,
        passwordResetExpiresAt: expiryFromNow(1),
        updatedAt: instantToIso(Temporal.Now.instant()),
      })
      .where(eq(users.id, user.id));

    const resetLink = `${getRequestURL(event).origin}/reset-password?token=${reset.token}`;
    try {
      await useMailer().send(passwordResetMessage(email, resetLink));
    } catch (error) {
      // A mailer outage must not break the always-200 contract (that would
      // also leak which emails have accounts). The token is stored, so a
      // retried request simply issues a fresh link.
      console.error('[forgot-password] Failed to send reset email:', error);
    }
  }

  return { message: 'If that email is with us, a reset link is on its way. 🐾' };
});
