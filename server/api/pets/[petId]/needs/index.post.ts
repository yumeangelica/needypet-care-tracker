import { and, eq } from 'drizzle-orm';
import { MAX_NEEDS_PER_DAY, needSchema } from '#shared/schemas/need';
import type { Need } from '#shared/types/domain';
import { compareDateOnly, todayInTimeZone } from '#shared/utils/date';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { useDb } from '../../../../db';
import { needs } from '../../../../db/schema';
import { toDomainNeed, toMeasurementColumns } from '../../../../utils/mappers';
import { requirePetOwner } from '../../../../utils/petAccess';
import { requireAppUser } from '../../../../utils/session';

export default defineEventHandler(async (event): Promise<Need> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  if (!petId) {
    notFound('Pet not found');
  }
  const pet = await requirePetOwner(petId, user.id);
  const input = await readValidatedBodyOr422(event, needSchema);

  // requirePetOwner guarantees the requester IS the owner, so user.timezone
  // is the owner's timezone that defines the pet's care day.
  const ownerToday = todayInTimeZone(user.timezone);
  if (compareDateOnly(input.dateFor, ownerToday) < 0) {
    badRequest('Cannot add a need for a past day');
  }

  const db = useDb();
  const dayRows = await db
    .select({ id: needs.id })
    .from(needs)
    .where(and(eq(needs.petId, pet.id), eq(needs.dateFor, input.dateFor), eq(needs.archived, false)));
  if (dayRows.length >= MAX_NEEDS_PER_DAY) {
    badRequest('Maximum number of needs for the day reached');
  }

  const now = instantToIso(Temporal.Now.instant());
  const createdRows = await db
    .insert(needs)
    .values({
      id: crypto.randomUUID(),
      petId: pet.id,
      dateFor: input.dateFor,
      category: input.category,
      description: input.description,
      ...toMeasurementColumns(input),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  setResponseStatus(event, 201);
  return toDomainNeed(createdRows[0]!);
});
