<script setup lang="ts">
import { FetchError } from 'ofetch';
import type { Pet, PetDetail } from '#shared/types/domain';

definePageMeta({ middleware: 'auth' });

const route = useRoute();
const { t } = useI18n();

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
        : t('errors.generic');
    removing.value = false;
  } finally {
    removeBusy.value = false;
  }
}
</script>

<template>
  <div class="content-wrapper">
    <div v-if="status === 'pending'" class="state-note" aria-live="polite">
      <p>{{ $t('pets.fetchingFamilyMember') }}</p>
    </div>

    <div v-else-if="!pet" class="confirmation-message">
      <p>{{ $t('pets.notFound') }}</p>
      <NuxtLink to="/home" class="custom-button">{{ $t('common.backToMyPets') }}</NuxtLink>
    </div>

    <DuoCard v-else-if="pet.isOwner" class="edit-pet-panel" :title="$t('pets.editTitle', { name: pet.name })">
      <PetForm :pet="pet" @saved="onSaved" @uploaded="refresh()" @cancel="navigateTo(`/pets/${pet.id}`)" />

      <CaretakerManager
        :pet-id="pet.id"
        :pet-name="pet.name"
        :caretakers="pet.caretakers ?? []"
        @changed="refresh()"
      />

      <section class="danger-zone" aria-labelledby="danger-zone-title">
        <h3 id="danger-zone-title" class="danger-zone-title">{{ $t('pets.sayingGoodbye') }}</h3>
        <p class="danger-zone-note">{{ $t('pets.removePetNote', { name: pet.name }) }}</p>
        <p v-if="removeError" class="custom-error-message" role="alert">{{ removeError }}</p>
        <AppButton variant="danger" @click="removing = true">{{ $t('pets.removePet', { name: pet.name }) }}</AppButton>
      </section>

      <AppModal :open="removing" :title="$t('pets.removePetTitle', { name: pet.name })" @close="removing = false">
        <p class="remove-note">{{ $t('pets.removePetConfirmNote', { name: pet.name }) }}</p>
        <div class="remove-actions">
          <AppButton variant="secondary" :disabled="removeBusy" @click="removing = false">
            {{ $t('pets.keepPet', { name: pet.name }) }}
          </AppButton>
          <AppButton variant="danger" :disabled="removeBusy" @click="confirmRemove">
            {{ removeBusy ? $t('common.removing') : $t('pets.removeForGood') }}
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
