<script setup lang="ts">
import { computed } from 'vue';
import type { PetImage } from '#shared/types/domain';
import { getPetImageSrc, normalizePetImage } from '#shared/utils/petImages';

const props = withDefaults(
  defineProps<{
    image: PetImage | null | undefined;
    petName: string;
    size?: 'sm' | 'md' | 'lg';
  }>(),
  { size: 'md' },
);

const { t } = useI18n();

const src = computed(() => getPetImageSrc(props.image));
// Uploads have no species — the pet's name alone is the right alt text. For
// presets the species is localized via a per-key i18n label, and the alt is
// built from a whole-phrase key so no locale-breaking lowercasing is needed.
const alt = computed(() => {
  const normalized = normalizePetImage(props.image);
  if (normalized.source === 'upload') {
    return props.petName;
  }
  return t('pets.stickerAlt', {
    name: props.petName,
    species: t(`pets.species${normalized.key.charAt(0).toUpperCase()}${normalized.key.slice(1)}`),
  });
});
</script>

<template>
  <img :src="src" :alt="alt" class="sticker-tile" :class="`size-${size}`" loading="lazy" />
</template>

<style scoped>
.sticker-tile {
  border-radius: var(--radius-xl);
}

.size-sm {
  width: 64px;
}

.size-md {
  width: 108px;
}

.size-lg {
  width: clamp(130px, 38vw, 180px);
}
</style>
