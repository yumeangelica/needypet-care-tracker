<script setup lang="ts">
import { FetchError } from 'ofetch';
import { z } from 'zod';
import { petSchema } from '#shared/schemas/pet';
import type { Pet, PetImageKey } from '#shared/types/domain';

/**
 * Add/edit form for a pet. Owns its own request: POST for a new pet, PUT when
 * `pet` is set. Emits the saved pet so the caller can navigate/refresh.
 */
const props = defineProps<{ pet?: Pet | null }>();

const emit = defineEmits<{
  saved: [pet: Pet, photoUploadFailed?: boolean];
  cancel: [];
  uploaded: [pet: Pet];
}>();

const { t } = useI18n();

const isEdit = computed(() => Boolean(props.pet));

const name = ref(props.pet?.name ?? '');
const species = ref(props.pet?.species ?? '');
const breed = ref(props.pet?.breed ?? '');
const description = ref(props.pet?.description ?? '');
const birthday = ref(props.pet?.birthday ?? '');
const imageKey = ref<PetImageKey>(props.pet?.image.source === 'preset' ? props.pet.image.key : 'cat');
// Create context only: a photo chosen before the pet exists, uploaded right
// after the pet is created (edit uploads immediately inside PetImagePicker).
const pendingFile = ref<File | null>(null);

// Saving must not silently replace an uploaded photo with the preset unless
// the user actually picked a preset in this form session. Driven by the
// picker's preset-picked event (not a watch on imageKey) so re-clicking the
// already-selected preset counts too.
const imageDirty = ref(false);

function onUploaded(pet: Pet): void {
  imageDirty.value = false;
  emit('uploaded', pet);
}

const submitting = ref(false);
const errorMessage = ref('');
const fieldErrors = ref<Record<string, string[]>>({});

function firstError(field: string): string | null {
  // Zod messages are i18n keys (shared/schemas/*) — translate for display.
  const key = fieldErrors.value[field]?.[0];
  return key ? t(key) : null;
}

async function submit() {
  if (submitting.value) {
    return;
  }
  errorMessage.value = '';
  fieldErrors.value = {};

  const keepUpload = isEdit.value && props.pet?.image.source === 'upload' && !imageDirty.value;
  const input = {
    name: name.value.trim(),
    species: species.value.trim(),
    breed: breed.value.trim(),
    description: description.value.trim(),
    birthday: birthday.value || null,
    // Omitting image keeps the current one (the uploaded photo).
    ...(keepUpload ? {} : { image: { source: 'preset' as const, key: imageKey.value } }),
  };

  // Same schema the server uses -> identical messages, instant feedback.
  const parsed = petSchema.safeParse(input);
  if (!parsed.success) {
    fieldErrors.value = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>;
    return;
  }

  submitting.value = true;
  try {
    const saved = props.pet
      ? await $fetch<Pet>(`/api/pets/${props.pet.id}`, { method: 'PUT', body: parsed.data })
      : await $fetch<Pet>('/api/pets', { method: 'POST', body: parsed.data });

    // Create context: upload the photo chosen before the pet existed. A failed
    // upload must NOT lose the just-created pet — the flag lets the caller
    // surface it on the pet page (the photo can be retried from edit).
    let savedWithImage = saved;
    let photoUploadFailed = false;
    if (!props.pet && pendingFile.value) {
      try {
        const form = new FormData();
        form.append('image', pendingFile.value);
        savedWithImage = await $fetch<Pet>(`/api/pets/${saved.id}/image`, {
          method: 'POST',
          body: form,
        });
      } catch (uploadError) {
        console.error('[PetForm] Pet created but photo upload failed:', uploadError);
        photoUploadFailed = true;
      }
    }
    emit('saved', savedWithImage, photoUploadFailed);
  } catch (error) {
    if (error instanceof FetchError && error.statusCode === 422 && error.data?.errorDetails) {
      fieldErrors.value = error.data.errorDetails;
    } else {
      errorMessage.value = resolveFetchError(error, t);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <form class="pet-form" novalidate @submit.prevent="submit">
    <PetImagePicker
      v-model="imageKey"
      v-model:pending-file="pendingFile"
      :pet-id="props.pet?.id"
      :current-image="props.pet?.image"
      @uploaded="onUploaded"
      @preset-picked="imageDirty = true"
    />

    <FormField v-slot="{ id, describedBy, invalid }" :label="$t('pets.name')" :error="firstError('name')">
      <input
        :id
        v-model="name"
        type="text"
        class="form-field-input"
        :placeholder="$t('pets.namePlaceholder')"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
        required
      />
    </FormField>

    <FormField v-slot="{ id, describedBy, invalid }" :label="$t('pets.speciesOptional')" :error="firstError('species')">
      <input
        :id
        v-model="species"
        type="text"
        class="form-field-input"
        :placeholder="$t('pets.speciesPlaceholder')"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
      />
    </FormField>

    <FormField v-slot="{ id, describedBy, invalid }" :label="$t('pets.breedOptional')" :error="firstError('breed')">
      <input
        :id
        v-model="breed"
        type="text"
        class="form-field-input"
        :placeholder="$t('pets.breedPlaceholder')"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
      />
    </FormField>

    <FormField
      v-slot="{ id, describedBy, invalid }"
      :label="$t('pets.descriptionOptional')"
      :error="firstError('description')"
    >
      <textarea
        :id
        v-model="description"
        class="form-field-input pet-form-textarea"
        rows="3"
        :placeholder="$t('pets.descriptionPlaceholder')"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
      />
    </FormField>

    <FormField v-slot="{ id, describedBy, invalid }" :label="$t('pets.birthdayOptional')" :error="firstError('birthday')">
      <input
        :id
        v-model="birthday"
        type="date"
        class="form-field-input"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
      />
    </FormField>

    <p v-if="errorMessage" class="custom-error-message" role="alert">{{ errorMessage }}</p>

    <div class="pet-form-actions">
      <AppButton variant="secondary" type="button" :disabled="submitting" @click="emit('cancel')">
        {{ $t('common.cancel') }}
      </AppButton>
      <AppButton variant="primary" type="submit" :disabled="submitting">
        {{ submitting ? $t('common.justAMoment') : isEdit ? $t('common.saveChanges') : $t('pets.welcomeAPet') }}
      </AppButton>
    </div>
  </form>
</template>

<style scoped>
.pet-form {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.pet-form-textarea {
  resize: vertical;
  min-height: 80px;
}

.pet-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
</style>
