import { and, asc, eq } from 'drizzle-orm';
import type { PetCaretaker, PetDetail } from '#shared/types/domain';
import { todayInTimeZone } from '#shared/utils/date';
import { firstRow, useDb } from '../../db';
import { careRecords, needs, petCaretakers, users } from '../../db/schema';
import { toDomainCareRecord, toDomainNeed, toDomainPet } from '../../utils/mappers';
import { requirePetAccess } from '../../utils/petAccess';
import { rollPetNeedsIfDue } from '../../utils/rollover';
import { requireAppUser } from '../../utils/session';

export default defineEventHandler(async (event): Promise<PetDetail> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  if (!petId) {
    notFound('Pet not found');
  }
  const pet = await requirePetAccess(petId, user.id);
  const db = useDb();

  const owner = firstRow(
    await db
      .select({ id: users.id, userName: users.userName, timezone: users.timezone })
      .from(users)
      .where(eq(users.id, pet.ownerId)),
  );

  // Lazy rollover before reading the needs, always by the owner's timezone.
  const rolledTo = await rollPetNeedsIfDue(pet, owner?.timezone ?? 'UTC');
  if (rolledTo) {
    pet.lastRolledNeedDate = rolledTo;
  }

  const needRows = await db.select().from(needs).where(eq(needs.petId, pet.id));

  // Only the current care day's records ride along — that's the only day
  // where record CRUD is legal. History days load on demand via
  // /api/pets/:petId/records?needDateFor=YYYY-MM-DD.
  const ownerToday = todayInTimeZone(owner?.timezone ?? 'UTC');
  const recordRows = await db
    .select({ record: careRecords, actorUserName: users.userName })
    .from(careRecords)
    .innerJoin(needs, eq(careRecords.needId, needs.id))
    .leftJoin(users, eq(careRecords.careTakerId, users.id))
    .where(and(eq(careRecords.petId, pet.id), eq(needs.dateFor, ownerToday)))
    .orderBy(asc(careRecords.date));
  const todayRecords = recordRows.map((row) => toDomainCareRecord(row.record, row.actorUserName));

  const isOwner = pet.ownerId === user.id;

  // The care team is the owner's business only; caretakers never see it.
  let caretakers: PetCaretaker[] | undefined;
  if (isOwner) {
    caretakers = await db
      .select({ id: users.id, userName: users.userName })
      .from(petCaretakers)
      .innerJoin(users, eq(petCaretakers.userId, users.id))
      .where(eq(petCaretakers.petId, pet.id))
      .orderBy(petCaretakers.createdAt);
  }

  return {
    ...toDomainPet(pet),
    owner: owner ?? { id: pet.ownerId, userName: 'Unknown', timezone: 'UTC' },
    isOwner,
    needs: needRows.map((row) => toDomainNeed(row)),
    todayRecords,
    ...(caretakers ? { caretakers } : {}),
  };
});
