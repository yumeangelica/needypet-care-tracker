<script setup lang="ts">
import { FetchError } from 'ofetch';
import { z } from 'zod';
import { caretakerAddSchema } from '#shared/schemas/caretaker';
import type { PetCaretaker } from '#shared/types/domain';

/**
 * Owner-only care team editor: add a caretaker by username, remove one with
 * a confirm step. The parent refreshes the pet on `changed`.
 */
const props = defineProps<{
  petId: string;
  petName: string;
  caretakers: PetCaretaker[];
}>();

const emit = defineEmits<{ changed: [] }>();

const userName = ref('');
const adding = ref(false);
const errorMessage = ref('');
const fieldErrors = ref<Record<string, string[]>>({});
const announcement = ref('');

function firstError(field: string): string | null {
  return fieldErrors.value[field]?.[0] ?? null;
}

async function addCaretaker(): Promise<void> {
  if (adding.value) {
    return;
  }
  errorMessage.value = '';
  fieldErrors.value = {};

  const parsed = caretakerAddSchema.safeParse({ userName: userName.value.trim() });
  if (!parsed.success) {
    fieldErrors.value = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>;
    return;
  }

  adding.value = true;
  try {
    const added = await $fetch<PetCaretaker>(`/api/pets/${props.petId}/caretakers`, {
      method: 'POST',
      body: parsed.data,
    });
    userName.value = '';
    announcement.value = `${added.userName} is now helping out! 🐾`;
    emit('changed');
  } catch (error) {
    if (error instanceof FetchError && error.statusCode === 422 && error.data?.errorDetails) {
      fieldErrors.value = error.data.errorDetails;
    } else if (error instanceof FetchError && error.data?.message) {
      errorMessage.value = error.data.message;
    } else {
      errorMessage.value = 'Something went wrong. Please try again.';
    }
  } finally {
    adding.value = false;
  }
}

const removingCaretaker = ref<PetCaretaker | null>(null);
const removeBusy = ref(false);

async function confirmRemove(): Promise<void> {
  if (!removingCaretaker.value || removeBusy.value) {
    return;
  }
  errorMessage.value = '';
  removeBusy.value = true;
  const target = removingCaretaker.value;
  try {
    await $fetch(`/api/pets/${props.petId}/caretakers/${target.id}`, { method: 'DELETE' });
    announcement.value = `${target.userName} no longer helps with ${props.petName}.`;
    removingCaretaker.value = null;
    emit('changed');
  } catch (error) {
    errorMessage.value =
      error instanceof FetchError && error.data?.message
        ? error.data.message
        : 'Something went wrong. Please try again.';
    removingCaretaker.value = null;
  } finally {
    removeBusy.value = false;
  }
}
</script>

<template>
  <section class="care-team" aria-labelledby="care-team-title">
    <h3 id="care-team-title" class="care-team-title">Care Team</h3>
    <p class="care-team-note">
      Helpers can see {{ petName }} and check off care tasks, but only you can change them.
    </p>

    <ul v-if="caretakers.length > 0" class="care-team-list" aria-label="Caretakers">
      <li v-for="caretaker in caretakers" :key="caretaker.id" class="care-team-item">
        <span class="care-team-name">{{ caretaker.userName }}</span>
        <button
          type="button"
          class="care-team-remove"
          :aria-label="`Remove ${caretaker.userName} from the care team`"
          @click="removingCaretaker = caretaker"
        >
          Remove
        </button>
      </li>
    </ul>
    <p v-else class="care-team-empty">No helpers yet — you've got this covered solo. 🐾</p>

    <form class="care-team-form" novalidate @submit.prevent="addCaretaker">
      <FormField
        v-slot="{ id, describedBy, invalid }"
        label="Add a helper by username"
        :error="firstError('userName')"
        class="care-team-field"
      >
        <input
          :id
          v-model="userName"
          type="text"
          class="form-field-input"
          placeholder="e.g. helper"
          autocomplete="off"
          autocapitalize="none"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </FormField>
      <AppButton variant="secondary" type="submit" :disabled="adding" class="care-team-add">
        {{ adding ? 'Just a moment...' : 'Add Helper' }}
      </AppButton>
    </form>

    <p v-if="errorMessage" class="custom-error-message" role="alert">{{ errorMessage }}</p>
    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>

    <AppModal
      :open="removingCaretaker !== null"
      :title="`Remove ${removingCaretaker?.userName ?? ''}?`"
      @close="removingCaretaker = null"
    >
      <p class="remove-note">
        {{ removingCaretaker?.userName }} won't see {{ petName }} or log care tasks anymore.
        Their past care history stays in the diary.
      </p>
      <div class="remove-actions">
        <AppButton variant="secondary" :disabled="removeBusy" @click="removingCaretaker = null">
          Keep helping
        </AppButton>
        <AppButton variant="danger" :disabled="removeBusy" @click="confirmRemove">
          {{ removeBusy ? 'Removing...' : 'Remove' }}
        </AppButton>
      </div>
    </AppModal>
  </section>
</template>

<style scoped>
.care-team {
  margin-top: var(--space-card);
  padding-top: var(--space-stack);
  border-top: 1px solid var(--color-border-divider);
}

.care-team-title {
  margin: 0 0 0.3rem;
  font-size: 0.95rem;
  color: var(--color-primary-foreground-strong);
}

.care-team-note {
  margin: 0 0 0.6rem;
  font-size: 0.85rem;
}

.care-team-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0 0 var(--space-stack);
  padding: 0;
  list-style: none;
}

.care-team-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: var(--tap-target-size);
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-field);
  background: var(--color-well);
}

.care-team-name {
  overflow-wrap: anywhere;
  font-size: 0.9rem;
  font-weight: 650;
  color: var(--color-primary-foreground-strong);
}

.care-team-remove {
  flex-shrink: 0;
  min-height: 36px;
  padding: 0.25rem 0.8rem;
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-pill);
  background: var(--color-danger-soft);
  color: var(--color-destructive);
  font-family: var(--font-sans);
  font-size: 0.8rem;
  transition: var(--transition-interactive);
}

.care-team-remove:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

.care-team-empty {
  margin: 0 0 var(--space-stack);
  font-size: 0.85rem;
  color: var(--color-muted-foreground);
}

.care-team-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.5rem;
}

.care-team-field {
  flex: 1 1 200px;
}

.care-team-add {
  flex: 0 0 auto;
}

.remove-note {
  margin: 0 0 var(--space-stack);
  overflow-wrap: anywhere;
  font-size: 0.9rem;
}

.remove-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
