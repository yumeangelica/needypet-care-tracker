import { and, eq, inArray } from 'drizzle-orm';
import type { PetListItem } from '#shared/types/domain';
import { normalizePetImage } from '#shared/utils/petImages';
import { todayInTimeZone } from '#shared/utils/date';
import { useDb } from '../../db';
import { needs, petCaretakers, pets, users } from '../../db/schema';
import type { PetRow } from '../../utils/petAccess';
import { rollPetNeedsIfDue } from '../../utils/rollover';
import { requireAppUser } from '../../utils/session';

/**
 * Lists the pets the user owns plus the pets they help care for.
 * Reading the list lazily rolls each pet's needs forward to the owner's
 * current day (guarded by pets.last_rolled_need_date).
 */
export default defineEventHandler(async (event): Promise<PetListItem[]> => {
  const user = await requireAppUser(event);
  const db = useDb();

  const owned = await db.select().from(pets).where(eq(pets.ownerId, user.id));
  const caretakenRows = await db
    .select({ pet: pets })
    .from(petCaretakers)
    .innerJoin(pets, eq(petCaretakers.petId, pets.id))
    .where(eq(petCaretakers.userId, user.id));
  const caretaken = caretakenRows.map((row) => row.pet);

  const allPets: PetRow[] = [...owned, ...caretaken];
  if (allPets.length === 0) {
    return [];
  }

  const ownerIds = [...new Set(allPets.map((pet) => pet.ownerId))];
  const ownerRows = await db
    .select({ id: users.id, userName: users.userName, timezone: users.timezone })
    .from(users)
    .where(inArray(users.id, ownerIds));
  const owners = new Map(ownerRows.map((owner) => [owner.id, owner]));

  // Roll needs forward before counting today's tasks. A caretaker's read
  // rolls the pet too — always by the OWNER's timezone.
  for (const pet of allPets) {
    const owner = owners.get(pet.ownerId);
    if (owner) {
      const rolledTo = await rollPetNeedsIfDue(pet, owner.timezone);
      if (rolledTo) {
        pet.lastRolledNeedDate = rolledTo;
      }
    }
  }

  // Today's open tasks per pet, where "today" is the owner's local day.
  const openNeeds = await db
    .select({ petId: needs.petId, dateFor: needs.dateFor })
    .from(needs)
    .where(
      and(
        inArray(needs.petId, allPets.map((pet) => pet.id)),
        eq(needs.archived, false),
        eq(needs.completed, false),
      ),
    );

  return allPets.map((pet) => {
    const owner = owners.get(pet.ownerId);
    const ownerToday = owner ? todayInTimeZone(owner.timezone) : null;
    return {
      id: pet.id,
      ownerId: pet.ownerId,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      description: pet.description,
      birthday: pet.birthday,
      image: normalizePetImage({ source: pet.imageSource, key: pet.imageKey, url: pet.imageUrl }),
      lastRolledNeedDate: pet.lastRolledNeedDate,
      createdAt: pet.createdAt,
      updatedAt: pet.updatedAt,
      owner: owner ?? { id: pet.ownerId, userName: 'Unknown', timezone: 'UTC' },
      isOwner: pet.ownerId === user.id,
      todayTaskCount: openNeeds.filter(
        (need) => need.petId === pet.id && need.dateFor === ownerToday,
      ).length,
    };
  });
});
