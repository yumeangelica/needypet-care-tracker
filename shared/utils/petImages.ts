import type { PetImage, PetImageKey } from '../types/domain';

/**
 * Preset pet images plus the uploaded-photo variant
 * (`{ source: 'upload', url }`, served from /uploads or the storage provider).
 */

export const PET_IMAGE_KEYS: readonly PetImageKey[] = ['dog', 'cat', 'bunny'] as const;

export const DEFAULT_PET_IMAGE = { source: 'preset', key: 'cat' } as const satisfies PetImage;

export const PET_IMAGE_OPTIONS: Record<PetImageKey, { label: string; src: string }> = {
  dog: { label: 'Dog', src: '/images/pets/needypet-dog-img.png' },
  cat: { label: 'Cat', src: '/images/pets/needypet-cat-img.png' },
  bunny: { label: 'Bunny', src: '/images/pets/needypet-bunny-img.png' },
};

function isPetImageKey(key: unknown): key is PetImageKey {
  return typeof key === 'string' && (PET_IMAGE_KEYS as readonly string[]).includes(key);
}

/**
 * Coerce arbitrary image metadata to a valid variant. A valid upload needs a
 * non-empty url; everything else falls back to a preset, unknown presets fall
 * back to the cat (matches the old app on both ends).
 */
export function normalizePetImage(image: unknown): PetImage {
  if (typeof image !== 'object' || image === null) {
    return DEFAULT_PET_IMAGE;
  }
  const candidate = image as { source?: unknown; key?: unknown; url?: unknown };
  if (candidate.source === 'upload' && typeof candidate.url === 'string' && candidate.url.length > 0) {
    return { source: 'upload', url: candidate.url };
  }
  if (candidate.source === 'preset' && isPetImageKey(candidate.key)) {
    return { source: 'preset', key: candidate.key };
  }
  return DEFAULT_PET_IMAGE;
}

export function getPetImageSrc(image: unknown): string {
  const normalized = normalizePetImage(image);
  if (normalized.source === 'upload') {
    return normalized.url;
  }
  return PET_IMAGE_OPTIONS[normalized.key].src;
}

/** Display label; uploads have no species-flavoured label. */
export function getPetImageLabel(image: unknown): string | null {
  const normalized = normalizePetImage(image);
  if (normalized.source === 'upload') {
    return null;
  }
  return PET_IMAGE_OPTIONS[normalized.key].label;
}
