<script setup lang="ts">
import { BookOpen, ChartColumn, CirclePlus, Settings } from '@lucide/vue';
import { FetchError } from 'ofetch';
import { MAX_NEEDS_PER_DAY } from '#shared/schemas/need';
import type { CareRecordWithActor, Need, NeedWithRecords, PetDetail, PetHistory } from '#shared/types/domain';
import { compareDateOnly, todayInTimeZone } from '#shared/utils/date';
import { bucketRecordsByNeed } from '#shared/utils/records';
import { Temporal } from '#shared/utils/temporal';

definePageMeta({ middleware: 'auth' });

const route = useRoute();
const { t } = useI18n();

const { data: pet, status, refresh } = await useFetch<PetDetail>(`/api/pets/${route.params.petId}`);

// "Today" always follows the pet owner's timezone, never the browser's.
// A one-minute ticker keeps it fresh across the owner's midnight.
const nowTick = ref(Temporal.Now.instant());
let ticker: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  ticker = setInterval(() => {
    nowTick.value = Temporal.Now.instant();
  }, 60_000);
});
onUnmounted(() => clearInterval(ticker));

const ownerToday = computed(() =>
  pet.value ? todayInTimeZone(pet.value.owner.timezone, nowTick.value) : '',
);

const currentDate = ref('');
watch(
  pet,
  (loaded) => {
    if (loaded && !currentDate.value) {
      currentDate.value = todayInTimeZone(loaded.owner.timezone);
    }
  },
  { immediate: true },
);

// --- Per-day care records ---------------------------------------------------
// Today's records arrive with the pet payload; past days are fetched on
// demand and cached per date. refresh() rebuilds the cache from scratch.

const dayRecordsCache = ref(new Map<string, CareRecordWithActor[]>());
const dayRecordsPending = ref(false);
const dayRecordsErrorDate = ref<string | null>(null);

watch(
  pet,
  (loaded) => {
    if (loaded) {
      const seeded = new Map<string, CareRecordWithActor[]>();
      seeded.set(todayInTimeZone(loaded.owner.timezone), loaded.todayRecords);
      dayRecordsCache.value = seeded;
      dayRecordsErrorDate.value = null;
    }
  },
  { immediate: true },
);

async function loadDayRecords(date: string): Promise<void> {
  // Future days can't have records, and today's came with the payload.
  if (dayRecordsCache.value.has(date) || compareDateOnly(date, ownerToday.value) >= 0) {
    return;
  }
  dayRecordsPending.value = true;
  dayRecordsErrorDate.value = null;
  try {
    const history = await $fetch<PetHistory>(`/api/pets/${route.params.petId}/records`, {
      query: { needDateFor: date, limit: 200 },
    });
    dayRecordsCache.value.set(date, history.records);
  } catch {
    dayRecordsErrorDate.value = date;
  } finally {
    dayRecordsPending.value = false;
  }
}

watch(currentDate, (date) => {
  if (date) {
    loadDayRecords(date);
  }
});

// If the user is parked on today when the owner's midnight passes, follow
// them to the new day.
watch(ownerToday, (newToday, oldToday) => {
  if (oldToday && currentDate.value === oldToday) {
    currentDate.value = newToday;
  }
});

const needsForCurrentDate = computed<NeedWithRecords[]>(() => {
  const buckets = bucketRecordsByNeed(dayRecordsCache.value.get(currentDate.value) ?? []);
  return (pet.value?.needs ?? [])
    .filter((need) => need.dateFor === currentDate.value)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((need) => ({ ...need, records: buckets.get(need.id) ?? [] }));
});

const emptyState = computed(() => {
  const relation = compareDateOnly(currentDate.value, ownerToday.value);
  if (relation > 0) {
    return {
      title: t('needs.emptyFutureTitle'),
      note: t('needs.emptyFutureNote'),
    };
  }
  if (relation < 0) {
    return {
      title: t('needs.emptyPastTitle'),
      note: t('needs.emptyPastNote'),
    };
  }
  return {
    title: t('needs.emptyTodayTitle'),
    note: t('needs.emptyTodayNote'),
  };
});

// --- Owner need management -------------------------------------------------

const viewingToday = computed(() => currentDate.value !== '' && currentDate.value === ownerToday.value);
const dayNeedCount = computed(
  () => needsForCurrentDate.value.filter((need) => !need.archived).length,
);
const canAddNeed = computed(
  () => Boolean(pet.value?.isOwner) && viewingToday.value && dayNeedCount.value < MAX_NEEDS_PER_DAY,
);
const dayIsFull = computed(
  () => Boolean(pet.value?.isOwner) && viewingToday.value && dayNeedCount.value >= MAX_NEEDS_PER_DAY,
);

const formOpen = ref(false);
const editingNeed = ref<Need | null>(null);
const removingNeed = ref<Need | null>(null);
const removeBusy = ref(false);
const actionError = ref('');

function openAddForm(): void {
  editingNeed.value = null;
  formOpen.value = true;
}

function openEditForm(need: Need): void {
  editingNeed.value = need;
  formOpen.value = true;
}

async function onNeedSaved(): Promise<void> {
  formOpen.value = false;
  editingNeed.value = null;
  await refresh();
}

function fetchErrorMessage(error: unknown): string {
  return error instanceof FetchError && error.data?.message
    ? error.data.message
    : t('errors.generic');
}

async function toggleNeed(need: Need): Promise<void> {
  actionError.value = '';
  try {
    await $fetch(`/api/pets/${route.params.petId}/needs/${need.id}/toggle`, { method: 'POST' });
    await refresh();
  } catch (error) {
    actionError.value = fetchErrorMessage(error);
  }
}

async function confirmRemove(): Promise<void> {
  if (!removingNeed.value || removeBusy.value) {
    return;
  }
  actionError.value = '';
  removeBusy.value = true;
  try {
    await $fetch(`/api/pets/${route.params.petId}/needs/${removingNeed.value.id}`, {
      method: 'DELETE',
    });
    removingNeed.value = null;
    await refresh();
  } catch (error) {
    actionError.value = fetchErrorMessage(error);
    removingNeed.value = null;
  } finally {
    removeBusy.value = false;
  }
}

// --- Caretaker self-removal --------------------------------------------------

const { user: sessionUser } = useUserSession();
const leaving = ref(false);
const leaveBusy = ref(false);

async function confirmLeave(): Promise<void> {
  if (leaveBusy.value || !sessionUser.value) {
    return;
  }
  actionError.value = '';
  leaveBusy.value = true;
  try {
    await $fetch(`/api/pets/${route.params.petId}/caretakers/${sessionUser.value.id}`, {
      method: 'DELETE',
    });
    await navigateTo('/home');
  } catch (error) {
    actionError.value = fetchErrorMessage(error);
    leaving.value = false;
  } finally {
    leaveBusy.value = false;
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

    <DuoCard v-else class="pet-panel" :title="pet.name">
      <template v-if="pet.isOwner" #actions>
        <NuxtLink :to="`/pets/${pet.id}/edit`" class="pet-edit-link" :aria-label="$t('pets.editAria', { name: pet.name })">
          <Settings :size="20" aria-hidden="true" />
          <span class="pet-edit-label">{{ $t('common.edit') }}</span>
        </NuxtLink>
      </template>
      <div class="pet-info">
        <PetStickerTile :image="pet.image" :pet-name="pet.name" size="lg" />
        <dl class="pet-facts">
          <template v-if="pet.description">
            <dt>{{ $t('pets.description') }}</dt>
            <dd>{{ pet.description }}</dd>
          </template>
          <template v-if="pet.species">
            <dt>{{ $t('pets.species') }}</dt>
            <dd>{{ pet.species }}</dd>
          </template>
          <template v-if="pet.breed">
            <dt>{{ $t('pets.breed') }}</dt>
            <dd>{{ pet.breed }}</dd>
          </template>
          <template v-if="pet.birthday">
            <dt>{{ $t('pets.birthday') }}</dt>
            <dd>{{ pet.birthday }}</dd>
          </template>
          <dt>{{ $t('pets.owner') }}</dt>
          <dd>{{ pet.isOwner ? $t('common.you') : pet.owner.userName }}</dd>
        </dl>
      </div>

      <section aria-labelledby="care-tasks-title" class="tasks-section">
        <div class="tasks-heading-row">
          <h3 id="care-tasks-title" class="page-title-sm title-underline">{{ $t('needs.dailyCareTasks') }}</h3>
          <div class="tasks-heading-links">
            <NuxtLink :to="`/pets/${pet.id}/stats`" class="diary-link">
              <ChartColumn :size="16" aria-hidden="true" />
              {{ $t('needs.stats') }}
            </NuxtLink>
            <NuxtLink :to="`/pets/${pet.id}/history`" class="diary-link">
              <BookOpen :size="16" aria-hidden="true" />
              {{ $t('needs.careDiary') }}
            </NuxtLink>
          </div>
        </div>

        <DayNavigator v-model="currentDate" :owner-today="ownerToday" />

        <p v-if="actionError" class="custom-error-message" role="alert">{{ actionError }}</p>

        <p v-if="dayRecordsPending" class="day-records-note" role="status" aria-live="polite">
          {{ $t('needs.fetchingCareHistory') }}
        </p>
        <div v-else-if="dayRecordsErrorDate === currentDate" class="day-records-error">
          <p class="custom-error-message" role="alert">{{ $t('records.loadDayError') }}</p>
          <AppButton variant="secondary" @click="loadDayRecords(currentDate)">{{ $t('common.tryAgain') }}</AppButton>
        </div>

        <ul v-if="needsForCurrentDate.length > 0" class="need-list" :aria-label="$t('needs.tasksForSelectedDay')">
          <li v-for="need in needsForCurrentDate" :key="need.id">
            <NeedCard
              :need="need"
              :is-owner="pet.isOwner"
              :owner-today="ownerToday"
              :owner-timezone="pet.owner.timezone"
              @edit="openEditForm"
              @toggle="toggleNeed"
              @remove="removingNeed = $event"
              @recorded="refresh()"
            />
          </li>
        </ul>

        <div v-else class="tasks-empty">
          <p class="tasks-empty-title">{{ emptyState.title }}</p>
          <p class="tasks-empty-note">{{ emptyState.note }}</p>
        </div>

        <div v-if="canAddNeed" class="tasks-add-row">
          <button type="button" class="custom-button" @click="openAddForm">
            <CirclePlus :size="20" aria-hidden="true" />
            {{ $t('needs.addCareTask') }}
          </button>
        </div>
        <p v-else-if="dayIsFull" class="tasks-full-note">{{ $t('needs.dayFull') }}</p>
      </section>

      <section v-if="!pet.isOwner" class="leave-section" aria-labelledby="leave-title">
        <h3 id="leave-title" class="leave-title">{{ $t('pets.leaveTitle') }}</h3>
        <p class="leave-note">{{ $t('pets.leaveNote', { name: pet.name }) }}</p>
        <AppButton variant="danger" @click="leaving = true">
          {{ $t('pets.stopHelpingWith', { name: pet.name }) }}
        </AppButton>
      </section>

      <AppModal
        :open="formOpen"
        :title="editingNeed ? $t('needs.editCareTask') : $t('needs.addCareTask')"
        @close="formOpen = false"
      >
        <NeedForm
          v-if="formOpen"
          :pet-id="String(route.params.petId)"
          :date-for="currentDate"
          :need="editingNeed"
          @saved="onNeedSaved"
          @cancel="formOpen = false"
        />
      </AppModal>

      <AppModal :open="leaving" :title="$t('pets.stopHelpingTitle', { name: pet.name })" @close="leaving = false">
        <p class="remove-note">{{ $t('pets.leaveConfirmNote', { name: pet.name }) }}</p>
        <div class="remove-actions">
          <AppButton variant="secondary" :disabled="leaveBusy" @click="leaving = false">
            {{ $t('pets.keepHelping') }}
          </AppButton>
          <AppButton variant="danger" :disabled="leaveBusy" @click="confirmLeave">
            {{ leaveBusy ? $t('common.justAMoment') : $t('pets.stopHelping') }}
          </AppButton>
        </div>
      </AppModal>

      <AppModal :open="removingNeed !== null" :title="$t('needs.removeCareTaskTitle')" @close="removingNeed = null">
        <p class="remove-note">
          {{ $t('needs.removeCareTaskNote', { category: removingNeed?.category }) }}
        </p>
        <div class="remove-actions">
          <AppButton variant="secondary" :disabled="removeBusy" @click="removingNeed = null">
            {{ $t('common.keepIt') }}
          </AppButton>
          <AppButton variant="danger" :disabled="removeBusy" @click="confirmRemove">
            {{ removeBusy ? $t('common.removing') : $t('common.remove') }}
          </AppButton>
        </div>
      </AppModal>
    </DuoCard>
  </div>
</template>

<style scoped>
.pet-edit-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-height: var(--tap-target-size);
  padding: 0.3rem 0.9rem;
  border: 1px solid var(--color-glass-rim);
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.45);
  color: var(--color-primary-foreground-strong);
  font-size: 0.85rem;
  text-decoration: none;
  transition: var(--transition-interactive);
}

@media (hover: hover) {
  .pet-edit-link:hover {
    background: rgba(255, 255, 255, 0.7);
    box-shadow: var(--shadow-control-hover);
  }
}

.pet-edit-link:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

.pet-info {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-card);
  margin-bottom: var(--space-card);
}

.pet-facts {
  flex: 1 1 240px;
  min-width: 0;
  margin: 0;
}

.pet-facts dt {
  color: var(--color-primary-foreground);
  font-size: 0.8rem;
  font-weight: 650;
}

.pet-facts dd {
  margin: 0 0 0.6rem;
  overflow-wrap: anywhere;
  font-size: 0.9rem;
}

.tasks-section {
  padding-top: var(--space-stack);
  border-top: 1px solid var(--color-border-divider);
}

.tasks-heading-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem 0.75rem;
  margin-bottom: 0.6rem;
}

.tasks-heading-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.diary-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-height: var(--tap-target-size);
  padding: 0.3rem 0.9rem;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-pill);
  background: var(--color-card-bg);
  color: var(--color-primary-foreground-strong);
  font-size: 0.82rem;
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  transition: var(--transition-interactive);
}

@media (hover: hover) {
  .diary-link:hover {
    box-shadow: var(--shadow-control-hover);
    transform: translateY(-1px);
  }
}

.diary-link:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

.day-records-note {
  margin: 0 0 var(--space-stack);
  font-size: 0.85rem;
  text-align: center;
  color: var(--color-muted-foreground);
}

.day-records-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: var(--space-stack);
}

.need-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tasks-empty {
  padding: var(--space-stack);
  border-radius: var(--radius-field);
  background: var(--color-well);
  text-align: center;
}

.tasks-empty-title {
  margin: 0;
  font-weight: 650;
  color: var(--color-primary-foreground-strong);
}

.tasks-empty-note {
  margin: 0.3rem 0 0;
  font-size: 0.85rem;
}

.tasks-add-row {
  display: flex;
  justify-content: center;
  margin-top: var(--space-stack);
}

.tasks-full-note {
  margin: var(--space-stack) 0 0;
  font-size: 0.85rem;
  text-align: center;
  color: var(--color-muted-foreground);
}

.leave-section {
  margin-top: var(--space-card);
  padding: var(--space-stack);
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
}

.leave-title {
  margin: 0 0 0.3rem;
  font-size: 0.95rem;
  color: var(--color-destructive);
}

.leave-note {
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

@media (max-width: 568px) {
  .pet-info {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .pet-facts dd {
    margin-bottom: 0.5rem;
  }
}
</style>
