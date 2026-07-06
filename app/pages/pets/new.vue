<script setup lang="ts">
import type { Pet } from '#shared/types/domain';

definePageMeta({ middleware: 'auth' });

async function onSaved(pet: Pet): Promise<void> {
  await navigateTo(`/pets/${pet.id}`);
}
</script>

<template>
  <div class="content-wrapper">
    <DuoCard class="new-pet-panel" title="Welcome a Pet">
      <p class="new-pet-intro">Tell us about your new family member 🐾</p>
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
