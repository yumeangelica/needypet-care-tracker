<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue';
import { addDaysDateOnly } from '#shared/utils/date';
import { Temporal } from '#shared/utils/temporal';

const props = defineProps<{
  modelValue: string; // YYYY-MM-DD, owner-local
  ownerToday: string; // YYYY-MM-DD, owner-local
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const { t, locale } = useI18n();

const isToday = computed(() => props.modelValue === props.ownerToday);

// A PlainDate has no timezone, so the label can never shift through the
// browser's local timezone.
const dateLabel = computed(() => {
  if (isToday.value) {
    return t('common.today');
  }
  return Temporal.PlainDate.from(props.modelValue).toLocaleString(locale.value, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
});

function changeDay(days: number): void {
  emit('update:modelValue', addDaysDateOnly(props.modelValue, days));
}
</script>

<template>
  <nav class="day-navigator" :aria-label="$t('records.careDay')">
    <button type="button" class="day-nav-button" :aria-label="$t('records.previousDay')" @click="changeDay(-1)">
      <ChevronLeft :size="18" aria-hidden="true" />
      <span class="day-nav-label">{{ $t('common.previous') }}</span>
    </button>

    <div class="day-nav-current">
      <p class="day-nav-date" aria-live="polite">{{ dateLabel }}</p>
      <button v-if="!isToday" type="button" class="day-nav-today" @click="emit('update:modelValue', ownerToday)">
        {{ $t('common.today') }}
      </button>
    </div>

    <button type="button" class="day-nav-button" :aria-label="$t('records.nextDay')" @click="changeDay(1)">
      <span class="day-nav-label">{{ $t('common.next') }}</span>
      <ChevronRight :size="18" aria-hidden="true" />
    </button>
  </nav>
</template>

<style scoped>
.day-navigator {
  display: grid;
  /* Fixed-width side columns: the date label's width must never resize or
     shift the buttons as the day changes. */
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: var(--space-stack);
}

.day-nav-button {
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

@media (hover: hover) {
  .day-nav-button:hover {
    box-shadow: var(--shadow-control-hover);
    transform: translateY(-2px);
  }
}

.day-nav-button:active {
  transform: scale(0.97);
}

.day-nav-button:focus-visible,
.day-nav-today:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

.day-nav-current {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  min-width: 0;
  /* Reserve room for the Today pill so the row keeps one height whether or
     not the pill is shown — otherwise the buttons bob vertically. */
  min-height: 3.4rem;
}

.day-nav-date {
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

.day-nav-today {
  min-height: 28px;
  padding: 2px 12px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--color-surface-control);
  color: var(--color-primary-foreground-strong);
  font-family: var(--font-sans);
  font-size: 0.7rem;
  transition: var(--transition-interactive);
}

@media (max-width: 400px) {
  .day-navigator {
    gap: 0.4rem;
  }

  .day-nav-button {
    padding: 0.4rem 0.35rem;
    font-size: 0.8rem;
  }

  .day-nav-date {
    font-size: 0.85rem;
  }
}

/* The tiniest screens get chevron-only buttons (aria-labels carry the name)
   so the date label keeps enough room. */
@media (max-width: 340px) {
  .day-nav-label {
    display: none;
  }

  .day-nav-button {
    width: var(--tap-target-size);
  }
}
</style>
