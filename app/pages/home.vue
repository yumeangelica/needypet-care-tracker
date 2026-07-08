<script setup lang="ts">
import { CirclePlus } from '@lucide/vue';
import type { PetListItem } from '#shared/types/domain';

definePageMeta({ middleware: 'auth' });

const { data: allPets, status } = await useFetch<PetListItem[]>('/api/pets', {
  default: () => [],
});

const { t } = useI18n();

const ownPets = computed(() => allPets.value.filter((pet) => pet.isOwner));
const caredPets = computed(() => allPets.value.filter((pet) => !pet.isOwner));

function taskLabel(count: number): string {
  return t('pets.tasksToday', count, { named: { count } });
}
</script>

<template>
  <div class="content-wrapper">
    <div v-if="status === 'pending'" class="loading-note" aria-live="polite">
      <p>{{ $t('pets.fetchingFamily') }}</p>
    </div>

    <template v-else>
      <section class="pets-surface" aria-labelledby="my-pets-title">
        <div class="section-head">
          <h1 id="my-pets-title" class="page-title title-underline">{{ $t('pets.myPets') }}</h1>
          <NuxtLink to="/pets/new" class="custom-button">
            <CirclePlus :size="20" aria-hidden="true" />
            {{ $t('pets.welcomeAPet') }}
          </NuxtLink>
        </div>

        <div v-if="ownPets.length === 0 && caredPets.length === 0" class="empty-state">
          <h2 class="page-title-sm">{{ $t('pets.noPetsYet') }}</h2>
          <p>{{ $t('pets.noPetsNote') }}</p>
        </div>

        <ul v-else class="pet-grid">
          <li v-for="pet in ownPets" :key="pet.id">
            <button type="button" class="pet-card" @click="navigateTo(`/pets/${pet.id}`)">
              <PetStickerTile :image="pet.image" :pet-name="pet.name" size="md" />
              <h2 class="pet-name">{{ pet.name }}</h2>
              <span
                class="task-pill"
                :style="{ visibility: pet.todayTaskCount > 0 ? 'visible' : 'hidden' }"
              >
                {{ taskLabel(pet.todayTaskCount) }}
              </span>
            </button>
          </li>
        </ul>

        <template v-if="caredPets.length > 0">
          <h2 class="page-title-sm title-underline care-section-title">{{ $t('pets.petsIHelpCareFor') }}</h2>
          <ul class="pet-grid">
            <li v-for="pet in caredPets" :key="pet.id">
              <button type="button" class="pet-card" @click="navigateTo(`/pets/${pet.id}`)">
                <PetStickerTile :image="pet.image" :pet-name="pet.name" size="md" />
                <h3 class="pet-name">{{ pet.name }}</h3>
                <span
                  class="task-pill"
                  :style="{ visibility: pet.todayTaskCount > 0 ? 'visible' : 'hidden' }"
                >
                  {{ taskLabel(pet.todayTaskCount) }}
                </span>
              </button>
            </li>
          </ul>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* Frosted-glass backdrop for the pet sections (home signature surface). */
.pets-surface {
  padding: var(--space-card);
  border: 1px solid var(--color-glass-rim);
  border-radius: var(--radius-2xl);
  background: var(--color-home-pets-surface);
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
  box-shadow: var(--shadow-glass);
}

.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-stack);
  margin-bottom: var(--space-stack);
}

.section-head h1 {
  margin: 0;
}

.care-section-title {
  margin-top: var(--space-card);
}

.pet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  grid-auto-rows: 1fr;
  gap: var(--space-stack);
  margin: 0;
}

/* Single-cell grid so the card button stretches to the full row height. */
.pet-grid li {
  display: grid;
  min-width: 0;
  margin: 0;
}

/* Whole pet card is one big tap target. */
.pet-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  height: 100%;
  padding: var(--space-stack);
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-xl);
  background: var(--color-card-bg);
  font-family: var(--font-sans);
  box-shadow: var(--shadow-control);
  transition: var(--transition-interactive);
}

@media (hover: hover) {
  .pet-card:hover {
    box-shadow: var(--shadow-control-hover);
    transform: translateY(-5px);
  }
}

.pet-card:active {
  transform: scale(0.97);
}

.pet-card:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

/* Name and pill both reserve a fixed two-line box so every card is the
   same height regardless of name length or pill text wrapping. */
.pet-name {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  min-height: calc(2 * 1.3em);
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 1rem;
  line-height: 1.3;
  text-align: center;
}

.task-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: calc(2 * 1.4em + 6px);
  max-width: 100%;
  margin-top: auto;
  padding: 3px 12px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-control);
  color: var(--color-primary-foreground-strong);
  font-size: 0.7rem;
  line-height: 1.4;
  text-align: center;
}

.loading-note,
.empty-state {
  padding: var(--space-card);
  text-align: center;
}

@media (max-width: 568px) {
  .pet-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  }
}
</style>
