<script setup lang="ts">
import { FetchError } from 'ofetch';
import type { Pet, PetImage, PetImageKey } from '#shared/types/domain';
import { PET_IMAGE_KEYS, PET_IMAGE_OPTIONS } from '#shared/utils/petImages';

/**
 * Radio group over the preset pet portraits (dog / cat / bunny), plus an
 * "own photo" tile. Edit context (a petId is set): the photo uploads immediately
 * on selection via POST /api/pets/:petId/image. Create context (no petId yet):
 * the chosen file is held via the `pendingFile` model with a local preview, and
 * PetForm uploads it once the pet exists.
 */
const props = defineProps<{
  petId?: string | null;
  currentImage?: PetImage | null;
}>();

const emit = defineEmits<{ uploaded: [pet: Pet] }>();

const { t } = useI18n();

// Localized display label per preset key (the shared PET_IMAGE_OPTIONS labels
// stay English — UI copy lives in i18n). A computed so it re-resolves when the
// user switches language live.
const presetLabel = computed<Record<PetImageKey, string>>(() => ({
  dog: t('pets.dog'),
  cat: t('pets.cat'),
  bunny: t('pets.bunny'),
}));

const model = defineModel<PetImageKey>({ required: true });
// Create context: the picked file waits here until PetForm has an id to upload to.
const pendingFile = defineModel<File | null>('pendingFile', { default: null });

const isCreate = computed(() => !props.petId);

const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const uploadError = ref('');
// Once the user picks a preset radio, the upload tile drops its selected look
// (saving the form will switch the pet back to the preset).
const presetPicked = ref(false);
watch(model, () => {
  presetPicked.value = true;
  // Picking a preset clears any pending create-mode photo.
  if (isCreate.value) {
    setPendingPreview(null);
  }
});

// Local object-URL preview for a create-mode pending file (revoked on replace).
const pendingPreview = ref<string | null>(null);
function setPendingPreview(file: File | null): void {
  if (pendingPreview.value) {
    URL.revokeObjectURL(pendingPreview.value);
  }
  pendingPreview.value = file ? URL.createObjectURL(file) : null;
  pendingFile.value = file;
  presetPicked.value = !file;
}
onBeforeUnmount(() => {
  if (pendingPreview.value) {
    URL.revokeObjectURL(pendingPreview.value);
  }
});

const uploadUrl = computed(() => {
  if (isCreate.value) {
    return pendingPreview.value;
  }
  return props.currentImage?.source === 'upload' ? props.currentImage.url : null;
});
watch(uploadUrl, (url) => {
  if (url) {
    presetPicked.value = false;
  }
});
const uploadSelected = computed(() => Boolean(uploadUrl.value) && !presetPicked.value);

async function onFileChange(changeEvent: Event): Promise<void> {
  const input = changeEvent.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // allow picking the same file again after an error
  if (!file || uploading.value) {
    return;
  }
  uploadError.value = '';

  // Create context: no pet to upload to yet — stash the file + preview; PetForm
  // uploads it right after the pet is created.
  if (isCreate.value) {
    setPendingPreview(file);
    return;
  }

  uploading.value = true;
  try {
    const form = new FormData();
    form.append('image', file);
    const pet = await $fetch<Pet>(`/api/pets/${props.petId}/image`, { method: 'POST', body: form });
    emit('uploaded', pet);
  } catch (error) {
    uploadError.value =
      error instanceof FetchError && error.data?.message
        ? error.data.message
        : t('errors.uploadFailed');
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <fieldset class="pet-image-picker">
    <legend class="form-label">{{ $t('pets.portrait') }}</legend>
    <div class="pet-image-options">
      <label
        v-for="key in PET_IMAGE_KEYS"
        :key="key"
        class="pet-image-option"
        :class="{ selected: model === key && !uploadSelected }"
      >
        <input v-model="model" type="radio" name="pet-image" :value="key" class="sr-only" />
        <img :src="PET_IMAGE_OPTIONS[key].src" alt="" class="pet-image-tile" />
        <span class="pet-image-label">{{ presetLabel[key] }}</span>
      </label>

      <button
        type="button"
        class="pet-image-option upload-option"
        :class="{ selected: uploadSelected }"
        :disabled="uploading"
        @click="fileInput?.click()"
      >
        <img v-if="uploadUrl" :src="uploadUrl" alt="" class="pet-image-tile upload-tile" />
        <span v-else class="pet-image-tile upload-placeholder" aria-hidden="true">📷</span>
        <span class="pet-image-label">{{ uploading ? $t('pets.uploading') : $t('pets.yourPhoto') }}</span>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        @change="onFileChange"
      />
    </div>
    <span class="sr-only" role="status" aria-live="polite">{{ uploading ? $t('pets.uploadingPhoto') : '' }}</span>
    <p v-if="uploadError" class="custom-error-message" role="alert">{{ uploadError }}</p>
  </fieldset>
</template>

<style scoped>
.pet-image-picker {
  margin: 0 0 0.6rem;
  padding: 0;
  border: none;
}

.pet-image-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.pet-image-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.5rem;
  border: 2px solid var(--color-card-edge);
  border-radius: var(--radius-md);
  background: var(--color-card-bg);
  font-size: 0.8rem;
  cursor: pointer;
  transition: var(--transition-interactive);
}

.pet-image-option.selected {
  border-color: var(--color-primary-foreground);
  background: var(--color-surface-control);
}

.pet-image-option:has(input:focus-visible),
.upload-option:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

.upload-option {
  font-family: var(--font-sans);
}

.upload-option:disabled {
  opacity: 0.7;
  cursor: progress;
}

.pet-image-tile {
  width: 72px;
  aspect-ratio: 1;
  object-fit: contain;
  border: 3px solid white;
  border-radius: var(--radius-md);
  background: var(--gradient-card-band);
  box-shadow: var(--shadow-control);
}

.upload-tile {
  object-fit: cover;
}

.upload-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
}

.pet-image-label {
  color: var(--color-primary-foreground-strong);
  font-weight: 650;
}
</style>
