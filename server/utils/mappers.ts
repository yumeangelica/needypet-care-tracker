import type {
  CareRecordWithActor,
  DurationUnit,
  MeasurementShape,
  Need,
  Pet,
  QuantityUnit,
} from '#shared/types/domain';
import { normalizePetImage } from '#shared/utils/petImages';
import type { careRecords, needs } from '../db/schema';
import type { PetRow } from './petAccess';

export type NeedRow = typeof needs.$inferSelect;
export type CareRecordRow = typeof careRecords.$inferSelect;

/** Maps a needs row's flat measurement columns back into the domain shape. */
export function toDomainNeed(row: NeedRow): Need {
  const need: Need = {
    id: row.id,
    petId: row.petId,
    dateFor: row.dateFor,
    category: row.category,
    description: row.description,
    completed: row.completed,
    archived: row.archived,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.durationValue !== null) {
    need.duration = { value: row.durationValue, unit: (row.durationUnit ?? 'minutes') as DurationUnit };
  }
  if (row.quantityValue !== null && row.quantityUnit !== null) {
    need.quantity = { value: row.quantityValue, unit: row.quantityUnit as QuantityUnit };
  }
  return need;
}

/** Inverse of toDomainNeed's measurement mapping, for INSERT/UPDATE values. */
export function toMeasurementColumns(shape: MeasurementShape): {
  durationValue: number | null;
  durationUnit: string | null;
  quantityValue: number | null;
  quantityUnit: string | null;
} {
  return {
    durationValue: shape.duration?.value ?? null,
    durationUnit: shape.duration?.unit ?? null,
    quantityValue: shape.quantity?.value ?? null,
    quantityUnit: shape.quantity?.unit ?? null,
  };
}

/** Maps a care_records row + resolved author name into the domain shape. */
export function toDomainCareRecord(row: CareRecordRow, actorUserName: string | null): CareRecordWithActor {
  const record: CareRecordWithActor = {
    id: row.id,
    needId: row.needId,
    petId: row.petId,
    careTakerId: row.careTakerId,
    date: row.date,
    note: row.note,
    timezone: row.timezone,
    createdAt: row.createdAt,
    actorUserName,
  };
  if (row.durationValue !== null) {
    record.duration = { value: row.durationValue, unit: (row.durationUnit ?? 'minutes') as DurationUnit };
  }
  if (row.quantityValue !== null && row.quantityUnit !== null) {
    record.quantity = { value: row.quantityValue, unit: row.quantityUnit as QuantityUnit };
  }
  return record;
}

export function toDomainPet(row: PetRow): Pet {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    species: row.species,
    breed: row.breed,
    description: row.description,
    birthday: row.birthday,
    image: normalizePetImage({ source: row.imageSource, key: row.imageKey, url: row.imageUrl }),
    lastRolledNeedDate: row.lastRolledNeedDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
