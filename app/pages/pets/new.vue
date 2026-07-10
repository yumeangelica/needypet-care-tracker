<script setup lang="ts">
import type { Pet } from '#shared/types/domain';

definePageMeta({ middleware: 'auth' });

async function onSaved(pet: Pet, photoUploadFailed?: boolean): Promise<void> {
  // The pet page surfaces the one-shot notice when the chosen photo
  // could not be uploaded after the pet itself was created.
  await navigateTo({
    path: `/pets/${pet.id}`,
    ...(photoUploadFailed ? { query: { photoFailed: '1' } } : {}),
  });
}
</script>

<template>
  <div class="content-wrapper">
    <DuoCard class="new-pet-panel" :title="$t('pets.welcomeAPet')">
      <p class="new-pet-intro">{{ $t('pets.newPetIntro') }}</p>
      <PetForm @saved="onSaved" @cancel="navigateTo('/home')" />
    </DuoCard>
  </div>
</template>

<style scoped>
.new-pet-panel {
  max-width: var(--panel-max-width);
  margin: 0 auto;
}

.new-pet-intro {
  margin: 0 0 var(--space-stack);
  text-align: center;
}
</style>
