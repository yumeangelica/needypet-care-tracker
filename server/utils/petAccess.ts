import { and, eq } from 'drizzle-orm';
import { firstRow, useDb } from '../db';
import { petCaretakers, pets } from '../db/schema';

export type PetRow = typeof pets.$inferSelect;

/**
 * Access guards preserving the old permission model:
 * - owner: full control over the pet and its needs
 * - caretaker: view + complete today's needs only
 * Authorization failures are 403; a pet that doesn't exist at all is 404.
 */

export async function requirePetOwner(petId: string, userId: string): Promise<PetRow> {
  const pet = firstRow(await useDb().select().from(pets).where(eq(pets.id, petId)));
  if (!pet) {
    notFound('Pet not found');
  }
  if (pet.ownerId !== userId) {
    forbidden();
  }
  return pet;
}

export async function requirePetAccess(petId: string, userId: string): Promise<PetRow> {
  const pet = firstRow(await useDb().select().from(pets).where(eq(pets.id, petId)));
  if (!pet) {
    notFound('Pet not found');
  }
  if (pet.ownerId === userId) {
    return pet;
  }
  const caretaker = firstRow(
    await useDb()
      .select()
      .from(petCaretakers)
      .where(and(eq(petCaretakers.petId, petId), eq(petCaretakers.userId, userId))),
  );
  if (!caretaker) {
    forbidden();
  }
  return pet;
}
