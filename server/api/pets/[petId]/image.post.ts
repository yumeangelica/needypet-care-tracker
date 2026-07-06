import { eq } from 'drizzle-orm';
import type { Pet } from '#shared/types/domain';
import { sniffImageType } from '#shared/utils/imageValidation';
import { useDb } from '../../../db';
import { pets } from '../../../db/schema';
import { removeStoredImageQuietly, useImageStorage } from '../../../utils/imageStorage';
import { toDomainPet } from '../../../utils/mappers';
import { requirePetOwner } from '../../../utils/petAccess';
import { requireAppUser } from '../../../utils/session';

/**
 * Owner-only photo upload (multipart, field name "image"). Type is decided
 * by magic bytes, never the client filename. The preset imageKey is kept as
 * the fallback the pet reverts to when the photo is removed.
 */
export default defineEventHandler(async (event): Promise<Pet> => {
  const user = await requireAppUser(event);
  const petId = getRouterParam(event, 'petId');
  if (!petId) {
    notFound('Pet not found');
  }
  const pet = await requirePetOwner(petId, user.id);

  const parts = await readMultipartFormData(event);
  const filePart = parts?.find((part) => part.name === 'image' && part.data.length > 0);
  if (!filePart) {
    badRequest('No image file provided');
  }

  const config = useRuntimeConfig().uploads;
  if (filePart.data.length > config.maxBytes) {
    badRequest(`Image is too large (max ${Math.floor(config.maxBytes / (1024 * 1024))} MB)`);
  }
  const sniffed = sniffImageType(filePart.data);
  if (!sniffed) {
    badRequest('Only JPEG, PNG or WebP images are allowed');
  }

  const storage = useImageStorage();
  const key = `pets/${pet.id}/${crypto.randomUUID()}.${sniffed.ext}`;
  await storage.put(key, filePart.data, sniffed.contentType);

  const previousKey = pet.imageStorageKey;
  const updatedRows = await useDb()
    .update(pets)
    .set({
      imageSource: 'upload',
      imageUrl: storage.publicUrl(key),
      imageStorageKey: key,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(pets.id, pet.id))
    .returning();

  // Row updated first, then best-effort cleanup of the replaced file.
  await removeStoredImageQuietly(previousKey);

  return toDomainPet(updatedRows[0]!);
});
