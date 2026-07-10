import { petSchema } from '#shared/schemas/pet';
import type { PetListItem } from '#shared/types/domain';
import { todayInTimeZone } from '#shared/utils/date';
import { isFutureDateOnly } from '#shared/utils/date';
import { DEFAULT_PET_IMAGE } from '#shared/utils/petImages';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { useDb } from '../../db';
import { pets } from '../../db/schema';
import { toDomainPet } from '../../utils/mappers';
import { requireAppUser } from '../../utils/session';

export default defineEventHandler(async (event): Promise<PetListItem> => {
  const user = await requireAppUser(event);
  const input = await readValidatedBodyOr422(event, petSchema);

  if (input.birthday && isFutureDateOnly(input.birthday, user.timezone)) {
    badRequest('Birthday cannot be in the future', 'errors.birthdayInFuture');
  }

  const image = input.image ?? DEFAULT_PET_IMAGE;
  const now = instantToIso(Temporal.Now.instant());
  const createdRows = await useDb()
    .insert(pets)
    .values({
      id: crypto.randomUUID(),
      ownerId: user.id,
      name: input.name,
      species: input.species,
      breed: input.breed,
      description: input.description,
      birthday: input.birthday ?? null,
      imageSource: image.source,
      imageKey: image.key,
      // A new pet is born rolled: today's needs start empty and the lazy
      // rollover fast path stays cheap from the first read on.
      lastRolledNeedDate: todayInTimeZone(user.timezone),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  setResponseStatus(event, 201);
  return {
    ...toDomainPet(createdRows[0]!),
    owner: { id: user.id, userName: user.userName, timezone: user.timezone },
    isOwner: true,
    todayTaskCount: 0,
    todayCompletedCount: 0,
  };
});
