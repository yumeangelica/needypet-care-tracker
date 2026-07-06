<script setup lang="ts">
import { FetchError } from 'ofetch';
import type { PetHistory, PetHistoryEntry } from '#shared/types/domain';
import { todayInTimeZone } from '#shared/utils/date';
import { addDaysDateOnly } from '#shared/utils/date';
import { formatTimeInTimeZone, groupRecordsByDay } from '#shared/utils/datetime';
import { getMeasurementValue } from '#shared/utils/measurement';

definePageMeta({ middleware: 'auth' });

const route = useRoute();
const PAGE_SIZE = 50;

const { data: history, status } = await useFetch<PetHistory>(
  `/api/pets/${route.params.petId}/records`,
  { query: { limit: PAGE_SIZE, offset: 0 } },
);

// Pages after the first accumulate here ("Show more").
const extraRecords = ref<PetHistoryEntry[]>([]);
const loadingMore = ref(false);
const loadError = ref('');

const allRecords = computed(() => [
  ...(history.value?.records ?? []),
  ...extraRecords.value,
]);

const hasMore = computed(
  () => history.value !== null && allRecords.value.length < (history.value?.total ?? 0),
);

async function loadMore(): Promise<void> {
  if (loadingMore.value || !hasMore.value) {
    return;
  }
  loadingMore.value = true;
  loadError.value = '';
  try {
    const page = await $fetch<PetHistory>(`/api/pets/${route.params.petId}/records`, {
      query: { limit: PAGE_SIZE, offset: allRecords.value.length },
    });
    extraRecords.value.push(...page.records);
  } catch (error) {
    loadError.value =
      error instanceof FetchError && error.data?.message
        ? error.data.message
        : 'Something went wrong. Please try again.';
  } finally {
    loadingMore.value = false;
  }
}

const ownerTimezone = computed(() => history.value?.owner.timezone ?? 'UTC');
const ownerToday = computed(() => todayInTimeZone(ownerTimezone.value));

const groups = computed(() => groupRecordsByDay(allRecords.value, ownerTimezone.value));

// Day headings use UTC formatting on the date-only string so the browser's
// timezone never shifts the label (same technique as DayNavigator).
function dayLabel(day: string): string {
  if (day === ownerToday.value) {
    return 'Today';
  }
  if (day === addDaysDateOnly(ownerToday.value, -1)) {
    return 'Yesterday';
  }
  const sameYear = day.slice(0, 4) === ownerToday.value.slice(0, 4);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

function entryUnit(entry: PetHistoryEntry): string {
  return entry.duration ? 'min' : entry.quantity?.unit ?? '';
}

const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const showTzHint = computed(() => browserTimezone !== ownerTimezone.value);
</script>

<template>
  <div class="content-wrapper">
    <div v-if="status === 'pending'" class="state-note" aria-live="polite">
      <p>Fetching the care diary...</p>
    </div>

    <div v-else-if="!history" class="confirmation-message">
      <p>We couldn't find that furry friend. 🐾</p>
      <NuxtLink to="/home" class="custom-button">Back to My Pets</NuxtLink>
    </div>

    <DuoCard v-else class="history-panel" :title="`${history.pet.name}'s Care Diary`">
      <template #actions>
        <NuxtLink :to="`/pets/${history.pet.id}`" class="history-back-link">
          Back to {{ history.pet.name }}
        </NuxtLink>
      </template>

      <p v-if="showTzHint" class="history-tz-hint">
        Times are shown in the owner's timezone ({{ ownerTimezone }}).
      </p>

      <div v-if="groups.length === 0" class="history-empty">
        <p class="history-empty-title">No care moments yet</p>
        <p class="history-empty-note">The diary is waiting for its first entry. 🐾</p>
      </div>

      <section
        v-for="group in groups"
        :key="group.day"
        class="history-day"
        :aria-label="`Care on ${dayLabel(group.day)}`"
      >
        <h3 class="history-day-title">{{ dayLabel(group.day) }}</h3>
        <ul class="history-list">
          <li v-for="entry in group.records" :key="entry.id" class="history-item">
            <div class="history-item-main">
              <span class="history-time">{{ formatTimeInTimeZone(entry.date, ownerTimezone) }}</span>
              <span class="history-category">{{ entry.needCategory }}</span>
              <span class="history-amount">
                {{ getMeasurementValue(entry) }} {{ entryUnit(entry) }}
              </span>
            </div>
            <p class="history-actor">
              by {{ entry.actorUserName ?? 'Deleted account' }}
            </p>
            <p v-if="entry.note" class="history-note">{{ entry.note }}</p>
          </li>
        </ul>
      </section>

      <p v-if="loadError" class="custom-error-message" role="alert">{{ loadError }}</p>

      <div v-if="hasMore" class="history-more-row">
        <AppButton variant="secondary" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Just a moment...' : 'Show more days' }}
        </AppButton>
      </div>
    </DuoCard>
  </div>
</template>

<style scoped>
.history-panel {
  max-width: var(--panel-max-width);
  margin: 0 auto;
}

.history-back-link {
  display: inline-flex;
  align-items: center;
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

.history-back-link:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

.history-tz-hint {
  margin: 0 0 var(--space-stack);
  font-size: 0.75rem;
  color: var(--color-muted-foreground);
}

.history-empty {
  padding: var(--space-stack);
  border-radius: var(--radius-field);
  background: var(--color-well);
  text-align: center;
}

.history-empty-title {
  margin: 0;
  font-weight: 650;
  color: var(--color-primary-foreground-strong);
}

.history-empty-note {
  margin: 0.3rem 0 0;
  font-size: 0.85rem;
}

.history-day {
  margin-bottom: var(--space-stack);
}

.history-day-title {
  margin: 0 0 0.4rem;
  font-size: 0.9rem;
  color: var(--color-primary-foreground);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.history-item {
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-md);
  background: var(--color-card-bg);
  box-shadow: var(--shadow-sm);
}

.history-item-main {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.3rem 0.6rem;
  font-size: 0.85rem;
}

.history-time {
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  color: var(--color-primary-foreground-strong);
}

.history-category {
  overflow-wrap: anywhere;
  font-weight: 650;
}

.history-amount {
  margin-left: auto;
  padding: 1px 10px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-control);
  color: var(--color-primary-foreground-strong);
  font-size: 0.75rem;
  white-space: nowrap;
}

.history-actor {
  margin: 0.15rem 0 0;
  font-size: 0.78rem;
  color: var(--color-muted-foreground);
}

.history-note {
  margin: 0.25rem 0 0;
  overflow-wrap: anywhere;
  font-size: 0.8rem;
}

.history-more-row {
  display: flex;
  justify-content: center;
  margin-top: var(--space-stack);
}

.state-note {
  padding: var(--space-card);
  text-align: center;
}
</style>
