import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PET_IMAGE,
  getPetImageLabel,
  getPetImageSrc,
  normalizePetImage,
} from '../../shared/utils/petImages';

describe('normalizePetImage', () => {
  it('keeps valid presets', () => {
    expect(normalizePetImage({ source: 'preset', key: 'dog' })).toEqual({
      source: 'preset',
      key: 'dog',
    });
    expect(normalizePetImage({ source: 'preset', key: 'bunny' })).toEqual({
      source: 'preset',
      key: 'bunny',
    });
  });

  it('coerces unknown keys and shapes to the cat default', () => {
    expect(normalizePetImage({ source: 'preset', key: 'dragon' })).toEqual(DEFAULT_PET_IMAGE);
    expect(normalizePetImage({ source: 'upload', key: 'dog' })).toEqual(DEFAULT_PET_IMAGE);
    expect(normalizePetImage({})).toEqual(DEFAULT_PET_IMAGE);
    expect(normalizePetImage(null)).toEqual(DEFAULT_PET_IMAGE);
    expect(normalizePetImage(undefined)).toEqual(DEFAULT_PET_IMAGE);
    expect(normalizePetImage('cat')).toEqual(DEFAULT_PET_IMAGE);
  });

  it('keeps uploads with a non-empty url', () => {
    expect(normalizePetImage({ source: 'upload', url: '/uploads/pets/p1/a.jpg' })).toEqual({
      source: 'upload',
      url: '/uploads/pets/p1/a.jpg',
    });
  });

  it('falls back to the cat for uploads without a usable url', () => {
    expect(normalizePetImage({ source: 'upload', url: '' })).toEqual(DEFAULT_PET_IMAGE);
    expect(normalizePetImage({ source: 'upload', url: 42 })).toEqual(DEFAULT_PET_IMAGE);
    expect(normalizePetImage({ source: 'upload' })).toEqual(DEFAULT_PET_IMAGE);
  });
});

describe('getPetImageSrc / getPetImageLabel', () => {
  it('maps presets to public asset paths', () => {
    expect(getPetImageSrc({ source: 'preset', key: 'dog' })).toBe(
      '/images/pets/needypet-dog-img.png',
    );
    expect(getPetImageSrc({ source: 'preset', key: 'cat' })).toBe(
      '/images/pets/needypet-cat-img.png',
    );
    expect(getPetImageSrc({ source: 'preset', key: 'bunny' })).toBe(
      '/images/pets/needypet-bunny-img.png',
    );
  });

  it('falls back to the cat asset for anything unknown', () => {
    expect(getPetImageSrc(null)).toBe('/images/pets/needypet-cat-img.png');
    expect(getPetImageLabel({ source: 'preset', key: 'nope' })).toBe('Cat');
  });

  it('serves the upload url and a null label for uploaded photos', () => {
    const upload = { source: 'upload', url: '/uploads/pets/p1/a.webp' };
    expect(getPetImageSrc(upload)).toBe('/uploads/pets/p1/a.webp');
    expect(getPetImageLabel(upload)).toBeNull();
  });
});
