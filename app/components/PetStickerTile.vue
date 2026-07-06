<script setup lang="ts">
import { computed } from 'vue';
import type { PetImage } from '#shared/types/domain';
import { getPetImageLabel, getPetImageSrc } from '#shared/utils/petImages';

const props = withDefaults(
  defineProps<{
    image: PetImage | null | undefined;
    petName: string;
    size?: 'sm' | 'md' | 'lg';
  }>(),
  { size: 'md' },
);

const src = computed(() => getPetImageSrc(props.image));
// Uploads have no species label — the pet's name alone is the right alt text.
const alt = computed(() => {
  const label = getPetImageLabel(props.image);
  return label ? `${props.petName} the ${label.toLowerCase()}` : props.petName;
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
