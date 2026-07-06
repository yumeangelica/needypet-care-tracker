<script setup lang="ts">
import { FetchError } from 'ofetch';
import type { Pet, PetDetail } from '#shared/types/domain';

definePageMeta({ middleware: 'auth' });

const route = useRoute();

const { data: pet, status, refresh } = await useFetch<PetDetail>(`/api/pets/${route.params.petId}`);

// Editing is owner-only; caretakers get bounced back to the detail view.
watch(
  pet,
  (loaded) => {
    if (loaded && !loaded.isOwner) {
      navigateTo(`/pets/${loaded.id}`, { replace: true });
    }
  },
  { immediate: true },
);

async function onSaved(saved: Pet): Promise<void> {
  await navigateTo(`/pets/${saved.id}`);
}

const removing = ref(false);
const removeBusy = ref(false);
const removeError = ref('');

async function confirmRemove(): Promise<void> {
  if (removeBusy.value) {
    return;
  }
  removeBusy.value = true;
  removeError.value = '';
  try {
    await $fetch(`/api/pets/${route.params.petId}`, { method: 'DELETE' });
    await navigateTo('/home');
  } catch (error) {
    removeError.value =
      error instanceof FetchError && error.data?.message
        ? error.data.message
        : 'Something went wrong. Please try again.';
    removing.value = false;
  } finally {
    removeBusy.value = false;
  }
}
</script>

<template>
  <div class="content-wrapper">
    <div v-if="status === 'pending'" class="state-note" aria-live="polite">
      <p>Fetching your family member...</p>
    </div>

    <div v-else-if="!pet" class="confirmation-message">
      <p>We couldn't find that furry friend. 🐾</p>
      <NuxtLink to="/home" class="custom-button">Back to My Pets</NuxtLink>
    </div>

    <DuoCard v-else-if="pet.isOwner" class="edit-pet-panel" :title="`Edit ${pet.name}`">
      <PetForm :pet="pet" @saved="onSaved" @uploaded="refresh()" @cancel="navigateTo(`/pets/${pet.id}`)" />

      <CaretakerManager
        :pet-id="pet.id"
        :pet-name="pet.name"
        :caretakers="pet.caretakers ?? []"
        @changed="refresh()"
      />

      <section class="danger-zone" aria-labelledby="danger-zone-title">
        <h3 id="danger-zone-title" class="danger-zone-title">Saying goodbye?</h3>
        <p class="danger-zone-note">
          Removing {{ pet.name }} also removes all care tasks and their history.
        </p>
        <p v-if="removeError" class="custom-error-message" role="alert">{{ removeError }}</p>
        <AppButton variant="danger" @click="removing = true">Remove {{ pet.name }}</AppButton>
      </section>

      <AppModal :open="removing" :title="`Remove ${pet.name}?`" @close="removing = false">
        <p class="remove-note">
          This removes {{ pet.name }}, every care task and the whole care history. There is no
          undo.
        </p>
        <div class="remove-actions">
          <AppButton variant="secondary" :disabled="removeBusy" @click="removing = false">
            Keep {{ pet.name }}
          </AppButton>
          <AppButton variant="danger" :disabled="removeBusy" @click="confirmRemove">
            {{ removeBusy ? 'Removing...' : 'Remove for good' }}
          </AppButton>
        </div>
      </AppModal>
    </DuoCard>
  </div>
</template>

<style scoped>
.edit-pet-panel {
  max-width: var(--panel-max-width);
  margin: 0 auto;
}

.danger-zone {
  margin-top: var(--space-card);
  padding: var(--space-stack);
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
}

.danger-zone-title {
  margin: 0 0 0.3rem;
  font-size: 0.95rem;
  color: var(--color-destructive);
}

.danger-zone-note {
  margin: 0 0 0.6rem;
  font-size: 0.85rem;
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

.state-note {
  padding: var(--space-card);
  text-align: center;
}
</style>
