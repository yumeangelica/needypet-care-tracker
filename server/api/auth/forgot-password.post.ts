import { eq } from 'drizzle-orm';
import { forgotPasswordSchema } from '#shared/schemas/user';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { firstRow, useDb } from '../../db';
import { users } from '../../db/schema';
import { passwordResetMessage, useMailer } from '../../utils/mailer';
import { checkRateLimit, rateLimitIp } from '../../utils/rateLimit';
import { publicOrigin } from '../../utils/siteUrl';
import { createToken, expiryFromNow } from '../../utils/tokens';

/**
 * Public. ALWAYS answers 200 with the same message so the endpoint can't be
 * used to probe which emails have accounts. A repeated request overwrites
 * the previous token — the latest link wins.
 */
export default defineEventHandler(async (event) => {
  // Resolve production configuration before account lookup so configuration
  // failures cannot reveal whether an address exists.
  const origin = publicOrigin(event);
  const mailer = useMailer();

  await checkRateLimit(event, `forgot:ip:${rateLimitIp(event)}`, {
    max: 5,
    windowMs: 60 * 60_000,
  });

  const input = await readValidatedBodyOr422(event, forgotPasswordSchema);
  const db = useDb();
  const email = input.email.toLowerCase();

  // Per-address cap keeps the endpoint from being used to flood a mailbox.
  await checkRateLimit(event, `forgot:email:${email}`, { max: 3, windowMs: 60 * 60_000 });

  const user = firstRow(await db.select({ id: users.id }).from(users).where(eq(users.email, email)));

  // Keep provider and token-work latency off the request path. Scheduling the
  // same microtask for known and unknown addresses also keeps the observable
  // response path identical after the account lookup. Nitro forwards
  // waitUntil to deployment adapters that support background work.
  event.waitUntil(
    Promise.resolve().then(async () => {
      if (!user) {
        return;
      }
      try {
        const reset = await createToken();
        await db
          .update(users)
          .set({
            passwordResetToken: reset.tokenHash,
            passwordResetExpiresAt: expiryFromNow(1),
            updatedAt: instantToIso(Temporal.Now.instant()),
          })
          .where(eq(users.id, user.id));

        const resetLink = `${origin}/reset-password?token=${reset.token}`;
        await mailer.send(passwordResetMessage(email, resetLink));
      } catch {
        // Keep the response identical for every address and avoid logging PII,
        // tokens or provider response bodies.
        console.error('[forgot-password] Reset delivery failed');
      }
    }),
  );

  return { message: 'If that email is with us, a reset link is on its way. 🐾' };
});
