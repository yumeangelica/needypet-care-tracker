import { eq } from 'drizzle-orm';
import { useDb } from '../../db';
import { users } from '../../db/schema';
import { confirmEmailMessage, useMailer } from '../../utils/mailer';
import { checkRateLimit } from '../../utils/rateLimit';
import { requireAppUser } from '../../utils/session';
import { publicOrigin } from '../../utils/siteUrl';
import { createToken, expiryFromNow } from '../../utils/tokens';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';

/** Regenerates the confirmation token (the old link dies) and resends. */
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event);
  await checkRateLimit(event, `resend:user:${user.id}`, { max: 3, windowMs: 60 * 60_000 });
  if (user.emailConfirmed) {
    badRequest('Your email is already confirmed', 'errors.emailAlreadyConfirmed');
  }
  const origin = publicOrigin(event);
  const mailer = useMailer();

  const confirm = await createToken();
  await useDb()
    .update(users)
    .set({
      emailConfirmToken: confirm.tokenHash,
      emailConfirmExpiresAt: expiryFromNow(24),
      updatedAt: instantToIso(Temporal.Now.instant()),
    })
    .where(eq(users.id, user.id));

  const confirmLink = `${origin}/confirm-email?token=${confirm.token}`;
  try {
    await mailer.send(confirmEmailMessage(user.email, confirmLink));
  } catch {
    serviceUnavailable(
      'Confirmation email could not be sent. Please try again.',
      'errors.emailSendFailed',
    );
  }

  return { message: 'Confirmation email sent! Check your inbox. 🐾' };
});
