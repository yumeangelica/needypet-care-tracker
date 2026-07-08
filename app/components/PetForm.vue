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

const emit = defineEmits<{ saved: [pet: Pet]; cancel: []; uploaded: [pet: Pet] }>();

const { t } = useI18n();

const isEdit = computed(() => Boolean(props.pet));

const name = ref(props.pet?.name ?? '');
const species = ref(props.pet?.species ?? '');
const breed = ref(props.pet?.breed ?? '');
const description = ref(props.pet?.description ?? '');
const birthday = ref(props.pet?.birthday ?? '');
const imageKey = ref<PetImageKey>(props.pet?.image.source === 'preset' ? props.pet.image.key : 'cat');

// Saving must not silently replace an uploaded photo with the preset unless
// the user actually picked a preset in this form session.
const imageDirty = ref(false);
watch(imageKey, () => {
  imageDirty.value = true;
});

function onUploaded(pet: Pet): void {
  imageDirty.value = false;
  emit('uploaded', pet);
}

const submitting = ref(false);
const errorMessage = ref('');
const fieldErrors = ref<Record<string, string[]>>({});

function firstError(field: string): string | null {
  return fieldErrors.value[field]?.[0] ?? null;
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
    emit('saved', saved);
  } catch (error) {
    if (error instanceof FetchError && error.statusCode === 422 && error.data?.errorDetails) {
      fieldErrors.value = error.data.errorDetails;
    } else if (error instanceof FetchError && error.data?.message) {
      errorMessage.value = error.data.message;
    } else {
      errorMessage.value = t('errors.generic');
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
      :pet-id="props.pet?.id"
      :current-image="props.pet?.image"
      @uploaded="onUploaded"
    />
    <p v-if="!isEdit" class="pet-form-hint">{{ $t('pets.photoAfterSaving') }}</p>

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

.pet-form-hint {
  margin: -0.3rem 0 0.3rem;
  font-size: 0.8rem;
  color: var(--color-muted-foreground);
}

.pet-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
</style>
