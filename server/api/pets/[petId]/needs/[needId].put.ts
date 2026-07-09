import { eq } from 'drizzle-orm';
import { needUpdateSchema } from '#shared/schemas/need';
import type { Need } from '#shared/types/domain';
import { hasExactlyOneMeasurement } from '#shared/utils/measurement';
import { instantToIso } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';
import { firstRow, useDb } from '../../../../db';
import { needs } from '../../../../db/schema';
import { toDomainNeed, toMeasurementColumns } from '../../../../utils/mappers';
import { requirePetOwner } from '../../../../utils/petAccess';
import { requireAppUser } from '../../../../utils/session';

export default defineEventHandler(async (event): Promise<Need> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  const needId = getRouterParam(event, 'needId');
  if (!petId || !needId) {
    notFound('Need not found');
  }
  const pet = await requirePetOwner(petId, user.id);
  const input = await readValidatedBodyOr422(event, needUpdateSchema);

  const db = useDb();
  const need = firstRow(await db.select().from(needs).where(eq(needs.id, needId)));
  if (!need || need.petId !== pet.id) {
    notFound('Need not found');
  }
  if (need.archived) {
    badRequest('Need is archived');
  }

  // A payload without a measurement keeps the need's existing one
  // (legacy updateNeed behavior). completed/archived/isActive/dateFor
  // are never editable through this endpoint.
  const measurement = hasExactlyOneMeasurement(input)
    ? toMeasurementColumns(input)
    : {
        durationValue: need.durationValue,
        durationUnit: need.durationUnit,
        quantityValue: need.quantityValue,
        quantityUnit: need.quantityUnit,
      };

  const updatedRows = await db
    .update(needs)
    .set({
      category: input.category,
      description: input.description,
      ...measurement,
      updatedAt: instantToIso(Temporal.Now.instant()),
    })
    .where(eq(needs.id, need.id))
    .returning();

  return toDomainNeed(updatedRows[0]!);
});
