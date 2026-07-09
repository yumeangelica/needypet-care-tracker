import { and, eq, inArray } from 'drizzle-orm';
import { hourInTimeZone, todayInTimeZone } from '#shared/utils/date';
import type { DigestPetSection } from '#shared/utils/digest';
import { shouldSendDigestNow } from '#shared/utils/digest';
import { useDb } from '../../db';
import { needs, petCaretakers, pets, users } from '../../db/schema';
import { dailyDigestMessage, useMailer } from '../../utils/mailer';
import type { PetRow } from '../../utils/petAccess';
import { checkRateLimit, rateLimitIp } from '../../utils/rateLimit';
import { rollPetNeedsIfDue } from '../../utils/rollover';

/**
 * Cron-triggered daily digest of unfinished care tasks. Intended to be called
 * hourly by an external scheduler; each user is mailed at most once a day, once
 * their own local clock passes the configured hour (see nuxt.config.ts digest.*
 * and documentation/deployment.md).
 *
 * Auth is a shared secret in the `x-digest-secret` header. There is no session:
 * this runs headless, so it can't use requireAppUser.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig().digest;
  const secret = config.secret;
  // Empty secret = the feature is disabled; never accept an empty header match.
  if (!secret) {
    unauthorized('Digest endpoint is not configured');
  }

  const provided = getHeader(event, 'x-digest-secret') ?? '';
  if (!(await timingSafeStringEqual(provided, secret))) {
    unauthorized('Invalid digest secret');
  }

  // Cheap abuse guard; the real gate is the secret above.
  checkRateLimit(event, `digest:ip:${rateLimitIp(event)}`, { max: 60, windowMs: 60_000 });

  const sendHour = Number(config.hour);
  const db = useDb();
  const homeLink = `${getRequestURL(event).origin}/home`;

  // Only confirmed, opted-in users can ever receive a digest.
  const candidates = await db
    .select()
    .from(users)
    .where(and(eq(users.digestOptIn, true), eq(users.emailConfirmed, true)));

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of candidates) {
    const localDate = todayInTimeZone(user.timezone);
    const localHour = hourInTimeZone(user.timezone);
    if (
      !shouldSendDigestNow({
        digestOptIn: user.digestOptIn,
        emailConfirmed: user.emailConfirmed,
        localDate,
        localHour,
        lastDigestDate: user.lastDigestDate,
        sendHour,
      })
    ) {
      skipped += 1;
      continue;
    }

    const sections = await collectOpenTaskSections(db, user.id, user.timezone);
    if (sections.length === 0) {
      // Nothing to nudge about. Don't stamp — a later task added today should
      // still trigger a digest on a subsequent hourly run.
      skipped += 1;
      continue;
    }

    try {
      await useMailer().send(
        dailyDigestMessage(user.email, sections, homeLink, user.locale as 'en' | 'fi'),
      );
      // Stamp only after a successful send so a mailer outage retries next run.
      await db
        .update(users)
        .set({ lastDigestDate: localDate, updatedAt: new Date().toISOString() })
        .where(eq(users.id, user.id));
      sent += 1;
    } catch (error) {
      // One recipient's failure must not abort the batch (mirrors the
      // forgot-password swallow). The un-stamped user is retried next run.
      console.error(`[daily-digest] Failed to send to ${user.email}:`, error);
      failed += 1;
    }
  }

  return { sent, skipped, failed };
});

/**
 * Builds the per-pet sections of today's OPEN tasks for one recipient (owned +
 * caretaken pets), rolling each pet forward first. "Today" and the whole task
 * set are always the pet OWNER's local day, matching the dashboard's
 * todayTaskCount (server/api/pets/index.get.ts) — including that paused
 * (isActive=false) needs still count while they remain on today.
 */
async function collectOpenTaskSections(
  db: ReturnType<typeof useDb>,
  userId: string,
  ownTimezone: string,
): Promise<DigestPetSection[]> {
  const owned = await db.select().from(pets).where(eq(pets.ownerId, userId));
  const caretakenRows = await db
    .select({ pet: pets })
    .from(petCaretakers)
    .innerJoin(pets, eq(petCaretakers.petId, pets.id))
    .where(eq(petCaretakers.userId, userId));
  const caretaken = caretakenRows.map((row) => row.pet);

  const allPets: PetRow[] = [...owned, ...caretaken];
  if (allPets.length === 0) {
    return [];
  }

  // Owner timezones: the recipient's own for owned pets, looked up for caretaken.
  const foreignOwnerIds = [...new Set(caretaken.map((pet) => pet.ownerId))];
  const ownerTimezones = new Map<string, string>();
  ownerTimezones.set(userId, ownTimezone);
  if (foreignOwnerIds.length > 0) {
    const ownerRows = await db
      .select({ id: users.id, timezone: users.timezone })
      .from(users)
      .where(inArray(users.id, foreignOwnerIds));
    for (const owner of ownerRows) {
      ownerTimezones.set(owner.id, owner.timezone);
    }
  }

  // Roll each pet forward before counting; lazy rollover otherwise only fires
  // on pet reads, so a pet nobody opened today would show stale needs.
  for (const pet of allPets) {
    const tz = ownerTimezones.get(pet.ownerId);
    if (tz) {
      const rolledTo = await rollPetNeedsIfDue(pet, tz);
      if (rolledTo) {
        pet.lastRolledNeedDate = rolledTo;
      }
    }
  }

  const openNeeds = await db
    .select({ petId: needs.petId, dateFor: needs.dateFor, category: needs.category, description: needs.description })
    .from(needs)
    .where(
      and(
        inArray(needs.petId, allPets.map((pet) => pet.id)),
        eq(needs.archived, false),
        eq(needs.completed, false),
      ),
    );

  const sections: DigestPetSection[] = [];
  for (const pet of allPets) {
    const tz = ownerTimezones.get(pet.ownerId);
    const ownerToday = tz ? todayInTimeZone(tz) : null;
    const petNeeds = openNeeds.filter(
      (need) => need.petId === pet.id && need.dateFor === ownerToday,
    );
    if (petNeeds.length > 0) {
      sections.push({
        petName: pet.name,
        needs: petNeeds.map((need) => ({ category: need.category, description: need.description })),
      });
    }
  }
  return sections;
}

/**
 * Constant-time string comparison via Web Crypto (no node:crypto). Hashing both
 * sides to a fixed 32-byte SHA-256 digest first means unequal input lengths
 * don't leak and the byte comparison always runs over the same length.
 */
async function timingSafeStringEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) {
    diff |= va[i]! ^ vb[i]!;
  }
  return diff === 0;
}
