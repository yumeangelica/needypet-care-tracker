/**
 * Core domain types shared by the app and the server.
 *
 * Date conventions (do not break these):
 * - Date-only values (pet birthday, need dateFor, lastRolledNeedDate) are
 *   `YYYY-MM-DD` strings representing the PET OWNER's local calendar day.
 *   They are compared as strings, never shifted through a timezone.
 * - Care record `date` is a full UTC ISO-8601 timestamp; the acting user's
 *   IANA `timezone` is stored alongside it for audit context only.
 */

export type PetImageKey = 'dog' | 'cat' | 'bunny';

/** Preset sticker or the owner's uploaded photo (storage key stays server-side). */
export type PetImage =
  | { source: 'preset'; key: PetImageKey }
  | { source: 'upload'; url: string };

export type DurationUnit = 'minutes';
export type QuantityUnit = 'ml' | 'g';

export interface DurationMeasurement {
  value: number; // 1..1440 minutes
  unit: DurationUnit;
}

export interface QuantityMeasurement {
  value: number; // >= 1
  unit: QuantityUnit;
}

/** A need or care record carries exactly one of these shapes. */
export interface MeasurementShape {
  duration?: DurationMeasurement | null;
  quantity?: QuantityMeasurement | null;
}

export interface PublicUser {
  id: string;
  userName: string;
  email: string;
  emailConfirmed: boolean;
  timezone: string;
  digestOptIn: boolean;
}

export interface Pet {
  id: string;
  ownerId: string;
  name: string;
  species: string | null;
  breed: string | null;
  description: string | null;
  birthday: string | null; // YYYY-MM-DD
  image: PetImage;
  lastRolledNeedDate: string | null; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}

export interface Need extends MeasurementShape {
  id: string;
  petId: string;
  dateFor: string; // YYYY-MM-DD, owner-local care day
  category: string;
  description: string;
  completed: boolean;
  archived: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CareRecord extends MeasurementShape {
  id: string;
  needId: string;
  petId: string;
  careTakerId: string | null;
  date: string; // UTC ISO timestamp
  note: string | null;
  timezone: string; // acting user's IANA timezone (audit)
  createdAt: string;
}

/** Pet as returned by the pets API: owner info + role of the requesting user. */
export interface PetListItem extends Pet {
  owner: { id: string; userName: string; timezone: string };
  isOwner: boolean;
  todayTaskCount: number;
}

/** Care record with its author's display name resolved (null = deleted account). */
export interface CareRecordWithActor extends CareRecord {
  actorUserName: string | null;
}

export interface NeedWithRecords extends Need {
  records: CareRecordWithActor[];
}

/**
 * Pet as returned by GET /api/pets/:petId. Carries every need row (all days,
 * archived rolled-over copies included) so day navigation works client-side,
 * but records only for the owner's current day — history days are fetched on
 * demand via GET /api/pets/:petId/records?needDateFor=YYYY-MM-DD.
 */
export interface PetDetail extends Pet {
  owner: { id: string; userName: string; timezone: string };
  isOwner: boolean;
  needs: Need[];
  /** Records whose parent need belongs to the owner's current care day. */
  todayRecords: CareRecordWithActor[];
  /** Present only when the requesting user is the owner. */
  caretakers?: PetCaretaker[];
}

export interface PetCaretaker {
  id: string;
  userName: string;
}

/** One care diary row: a record plus its parent need's category. */
export interface PetHistoryEntry extends CareRecordWithActor {
  needCategory: string;
}

/** Response of GET /api/pets/:petId/stats (weekly summary). */
export interface PetWeekStats {
  pet: { id: string; name: string };
  owner: { id: string; userName: string; timezone: string };
  weekStart: string; // Monday, YYYY-MM-DD (owner-local week)
  weekEnd: string; // Sunday, YYYY-MM-DD, inclusive
  ownerToday: string; // YYYY-MM-DD in the owner's timezone
  days: { day: string; recordCount: number }[]; // always length 7
  categories: { category: string; unit: 'min' | 'ml' | 'g'; total: number; perDay: number[] }[];
  totalRecords: number;
  streak: number; // consecutive owner-local days with care, back from today
}

/** Response of GET /api/pets/:petId/records (the care diary). */
export interface PetHistory {
  pet: { id: string; name: string };
  owner: { id: string; userName: string; timezone: string };
  isOwner: boolean;
  total: number;
  records: PetHistoryEntry[]; // ordered by date DESC
}
