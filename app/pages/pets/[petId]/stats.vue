<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import type { PetWeekStats } from '#shared/types/domain';
import { addDaysDateOnly, weekStartOf } from '#shared/utils/date';
import { Temporal } from '#shared/utils/temporal';

definePageMeta({ middleware: 'auth' });

const route = useRoute();
const { t, locale } = useI18n();

// Empty string = "owner's current week" (server default); set by Prev/Next.
const weekStart = ref('');
const statsQuery = computed(() => (weekStart.value ? { weekStart: weekStart.value } : {}));

const { data: stats, status, error } = await useFetch<PetWeekStats>(
  `/api/pets/${route.params.petId}/stats`,
  { query: statsQuery },
);

const currentWeekStart = computed(() =>
  stats.value ? weekStartOf(stats.value.ownerToday) : '',
);
const isCurrentWeek = computed(
  () => Boolean(stats.value) && stats.value?.weekStart === currentWeekStart.value,
);

function changeWeek(days: number): void {
  if (stats.value) {
    weekStart.value = addDaysDateOnly(stats.value.weekStart, days);
  }
}

// Date-only labels use PlainDate (no timezone) so the browser's timezone can
// never shift them (same technique as DayNavigator / history).
function shortDate(day: string, withYear = false): string {
  return Temporal.PlainDate.from(day).toLocaleString(locale.value, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

const weekLabel = computed(() => {
  if (!stats.value) {
    return '';
  }
  if (isCurrentWeek.value) {
    return t('stats.thisWeek');
  }
  const withYear = stats.value.weekStart.slice(0, 4) !== stats.value.ownerToday.slice(0, 4);
  return t('stats.weekRange', {
    start: shortDate(stats.value.weekStart),
    end: shortDate(stats.value.weekEnd, withYear),
  });
});

function weekdayInitial(day: string): string {
  return Temporal.PlainDate.from(day).toLocaleString(locale.value, { weekday: 'narrow' });
}

function weekdayFull(day: string): string {
  return Temporal.PlainDate.from(day).toLocaleString(locale.value, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

const maxDayCount = computed(() =>
  Math.max(1, ...(stats.value?.days.map((d) => d.recordCount) ?? [])),
);

// Bars are comparable only within the same unit; each row scales against the
// max total of its own unit group (minutes never share a scale with ml/g).
const maxTotalByUnit = computed(() => {
  const maxima = new Map<string, number>();
  for (const category of stats.value?.categories ?? []) {
    maxima.set(category.unit, Math.max(maxima.get(category.unit) ?? 0, category.total));
  }
  return maxima;
});

function categoryBarWidth(total: number, unit: string): string {
  const max = maxTotalByUnit.value.get(unit) ?? total;
  return `${Math.max(4, Math.round((total / max) * 100))}%`;
}

function formatTotal(total: number): string {
  return Number.isInteger(total) ? String(total) : total.toFixed(1);
}
</script>

<template>
  <div class="content-wrapper">
    <div v-if="status === 'pending' && !stats" class="state-note" aria-live="polite">
      <p>{{ $t('stats.counting') }}</p>
    </div>

    <div v-else-if="error || !stats" class="confirmation-message">
      <p>{{ $t('pets.notFound') }}</p>
      <NuxtLink to="/home" class="custom-button">{{ $t('common.backToMyPets') }}</NuxtLink>
    </div>

    <DuoCard v-else class="stats-panel" :title="$t('stats.weekTitle', { name: stats.pet.name })">
      <template #actions>
        <NuxtLink :to="`/pets/${stats.pet.id}`" class="stats-back-link">
          {{ $t('records.backToPet', { name: stats.pet.name }) }}
        </NuxtLink>
      </template>

      <nav class="week-nav" :aria-label="$t('stats.week')">
        <button type="button" class="week-nav-button" :aria-label="$t('stats.previousWeek')" @click="changeWeek(-7)">
          <ChevronLeft :size="18" aria-hidden="true" />
          <span class="week-nav-label">{{ $t('common.previous') }}</span>
        </button>
        <p class="week-nav-current" aria-live="polite">{{ weekLabel }}</p>
        <button
          type="button"
          class="week-nav-button"
          :aria-label="$t('stats.nextWeek')"
          :disabled="isCurrentWeek"
          @click="changeWeek(7)"
        >
          <span class="week-nav-label">{{ $t('common.next') }}</span>
          <ChevronRight :size="18" aria-hidden="true" />
        </button>
      </nav>

      <div class="stat-tiles">
        <div class="stat-tile">
          <p class="stat-tile-value">{{ stats.streak }}</p>
          <p class="stat-tile-label">{{ $t('stats.dayStreak') }} {{ stats.streak > 0 ? '🔥' : '' }}</p>
        </div>
        <div class="stat-tile">
          <p class="stat-tile-value">{{ stats.totalRecords }}</p>
          <p class="stat-tile-label">{{ $t('stats.careMomentsThisWeek') }}</p>
        </div>
      </div>

      <section :aria-label="$t('stats.careMomentsPerDay')">
        <h3 class="stats-section-title">{{ $t('stats.carePerDay') }}</h3>
        <ul class="day-bars">
          <li
            v-for="day in stats.days"
            :key="day.day"
            class="day-bar-column"
            :class="{ today: day.day === stats.ownerToday }"
          >
            <span class="sr-only">{{ $t('stats.dayCountSr', { weekday: weekdayFull(day.day), count: day.recordCount }) }}</span>
            <span class="day-bar-count" aria-hidden="true">{{ day.recordCount || '' }}</span>
            <span class="day-bar-track" aria-hidden="true">
              <span
                class="day-bar-fill"
                :style="{ blockSize: day.recordCount ? `${Math.round((day.recordCount / maxDayCount) * 100)}%` : '0%' }"
              />
            </span>
            <span class="day-bar-weekday" aria-hidden="true">{{ weekdayInitial(day.day) }}</span>
          </li>
        </ul>
      </section>

      <section :aria-label="$t('stats.totalsPerCareTask')">
        <h3 class="stats-section-title">{{ $t('stats.totalsPerCareTask') }}</h3>
        <div v-if="stats.categories.length === 0" class="stats-empty">
          <p class="stats-empty-title">{{ $t('stats.quietWeek') }}</p>
          <p class="stats-empty-note">{{ $t('stats.quietWeekNote') }}</p>
        </div>
        <ul v-else class="category-list">
          <li v-for="category in stats.categories" :key="`${category.category}-${category.unit}`" class="category-row">
            <div class="category-row-header">
              <span class="category-name">{{ category.category }}</span>
              <span class="category-total">{{ formatTotal(category.total) }} {{ category.unit }}</span>
            </div>
            <div class="category-track" aria-hidden="true">
              <div class="category-fill" :style="{ inlineSize: categoryBarWidth(category.total, category.unit) }" />
            </div>
          </li>
        </ul>
      </section>
    </DuoCard>
  </div>
</template>

<style scoped>
.stats-panel {
  max-width: var(--panel-max-width);
  margin: 0 auto;
}

.stats-back-link {
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

.stats-back-link:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

/* Same stable layout rules as DayNavigator: fixed-width buttons, the label
   width never moves them. */
.week-nav {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: var(--space-stack);
}

.week-nav-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  width: clamp(5.9rem, 27vw, 7.25rem);
  min-height: var(--tap-target-size);
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-pill);
  background: var(--color-card-bg);
  color: var(--color-primary-foreground-strong);
  font-family: var(--font-sans);
  font-size: 0.85rem;
  box-shadow: var(--shadow-sm);
  transition: var(--transition-interactive);
}

.week-nav-button:disabled {
  opacity: 0.5;
  box-shadow: none;
}

@media (hover: hover) {
  .week-nav-button:not(:disabled):hover {
    box-shadow: var(--shadow-control-hover);
    transform: translateY(-2px);
  }
}

.week-nav-button:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

.week-nav-current {
  max-width: 100%;
  margin: 0;
  overflow: hidden;
  font-size: 0.95rem;
  font-weight: 650;
  color: var(--color-primary-foreground-strong);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
  margin-bottom: var(--space-stack);
}

.stat-tile {
  padding: 0.7rem;
  border-radius: var(--radius-field);
  background: var(--color-well);
  text-align: center;
}

.stat-tile-value {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: var(--color-primary-foreground-strong);
}

.stat-tile-label {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-muted-foreground);
}

.stats-section-title {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
  color: var(--color-primary-foreground);
}

.day-bars {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.4rem;
  align-items: end;
  margin: 0 0 var(--space-stack);
  padding: 0;
  list-style: none;
}

.day-bar-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
}

.day-bar-count {
  min-height: 1rem;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--color-muted-foreground);
}

.day-bar-track {
  display: flex;
  align-items: flex-end;
  block-size: 72px;
  inline-size: min(100%, 26px);
  border-radius: 4px;
  background: var(--color-well);
}

.day-bar-fill {
  inline-size: 100%;
  border-radius: 4px;
  background: var(--color-primary-foreground);
  transition: block-size 0.25s ease;
}

.day-bar-weekday {
  font-size: 0.75rem;
  font-weight: 650;
  color: var(--color-muted-foreground);
}

.day-bar-column.today .day-bar-weekday {
  color: var(--color-primary-foreground-strong);
}

.day-bar-column.today .day-bar-fill {
  background: var(--color-primary-foreground-strong);
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.category-row-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.2rem;
  font-size: 0.85rem;
}

.category-name {
  overflow-wrap: anywhere;
  font-weight: 650;
}

.category-total {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--color-primary-foreground-strong);
}

.category-track {
  block-size: 10px;
  border-radius: 4px;
  background: var(--color-well);
}

.category-fill {
  block-size: 100%;
  border-radius: 4px;
  background: var(--color-primary-foreground);
  transition: inline-size 0.25s ease;
}

.stats-empty {
  padding: var(--space-stack);
  border-radius: var(--radius-field);
  background: var(--color-well);
  text-align: center;
}

.stats-empty-title {
  margin: 0;
  font-weight: 650;
  color: var(--color-primary-foreground-strong);
}

.stats-empty-note {
  margin: 0.3rem 0 0;
  font-size: 0.85rem;
}

.state-note {
  padding: var(--space-card);
  text-align: center;
}

@media (max-width: 400px) {
  .week-nav {
    gap: 0.4rem;
  }

  .week-nav-button {
    padding: 0.4rem 0.35rem;
    font-size: 0.8rem;
  }

  .week-nav-current {
    font-size: 0.85rem;
  }
}

@media (max-width: 340px) {
  .week-nav-label {
    display: none;
  }

  .week-nav-button {
    width: var(--tap-target-size);
  }
}
</style>
