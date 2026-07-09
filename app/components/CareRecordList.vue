<script setup lang="ts">
import { Pencil, Trash2 } from '@lucide/vue';
import type { CareRecordWithActor, Need } from '#shared/types/domain';
import { canMutateRecord } from '#shared/utils/careRules';
import { formatTimeInTimeZone } from '#shared/utils/datetime';
import { getMeasurementValue } from '#shared/utils/measurement';
import { Temporal } from '#shared/utils/temporal';

/**
 * The care log of one need: who did what, when and how much. Times are shown
 * as the OWNER's wall clock — the same clock that defines the care day.
 */
const props = defineProps<{
  records: CareRecordWithActor[];
  need: Need;
  isOwner: boolean;
  ownerTimezone: string;
  currentUserId: string | null;
}>();

const emit = defineEmits<{
  edit: [record: CareRecordWithActor];
  remove: [record: CareRecordWithActor];
}>();

const unitLabel = computed(() =>
  props.need.duration ? 'min' : props.need.quantity?.unit ?? '',
);

// When the viewer's clock differs from the owner's, label whose clock it is.
const browserTimezone = Temporal.Now.timeZoneId();
const showTzHint = computed(() => browserTimezone !== props.ownerTimezone);

function recordTime(record: CareRecordWithActor): string {
  return formatTimeInTimeZone(record.date, props.ownerTimezone);
}

function canMutate(record: CareRecordWithActor): boolean {
  return (
    !props.need.archived &&
    props.currentUserId !== null &&
    canMutateRecord(record, props.currentUserId, props.isOwner)
  );
}
</script>

<template>
  <div class="record-log">
    <p v-if="showTzHint" class="record-log-tz-hint">
      {{ $t('records.tzHint', { timezone: ownerTimezone }) }}
    </p>
    <ul class="record-log-list" :aria-label="$t('records.careLogEntries')">
      <li v-for="record in records" :key="record.id" class="record-log-item">
        <div class="record-log-main">
          <span class="record-log-time">{{ recordTime(record) }}</span>
          <span class="record-log-actor">{{ record.actorUserName ?? $t('common.deletedAccount') }}</span>
          <span class="record-log-amount">{{ getMeasurementValue(record) }} {{ unitLabel }}</span>
        </div>
        <p v-if="record.note" class="record-log-note">{{ record.note }}</p>
        <div v-if="canMutate(record)" class="record-log-actions">
          <button
            type="button"
            class="record-log-button"
            :aria-label="$t('records.editEntryAria', { time: recordTime(record) })"
            @click="emit('edit', record)"
          >
            <Pencil :size="14" aria-hidden="true" />
            {{ $t('common.edit') }}
          </button>
          <button
            type="button"
            class="record-log-button record-log-danger"
            :aria-label="$t('records.removeEntryAria', { time: recordTime(record) })"
            @click="emit('remove', record)"
          >
            <Trash2 :size="14" aria-hidden="true" />
            {{ $t('common.remove') }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.record-log-tz-hint {
  margin: 0 0 0.4rem;
  font-size: 0.72rem;
  color: var(--color-muted-foreground);
}

.record-log-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.record-log-item {
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-md);
  background: var(--color-well);
}

.record-log-main {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.3rem 0.6rem;
  font-size: 0.8rem;
}

.record-log-time {
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  color: var(--color-primary-foreground-strong);
}

.record-log-actor {
  overflow-wrap: anywhere;
}

.record-log-amount {
  margin-left: auto;
  padding: 1px 10px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-control);
  color: var(--color-primary-foreground-strong);
  font-size: 0.72rem;
  white-space: nowrap;
}

.record-log-note {
  margin: 0.25rem 0 0;
  overflow-wrap: anywhere;
  font-size: 0.78rem;
  color: var(--color-muted-foreground);
}

.record-log-actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.35rem;
}

.record-log-button {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 32px;
  padding: 0.2rem 0.7rem;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-pill);
  background: var(--color-card-bg);
  color: var(--color-primary-foreground-strong);
  font-family: var(--font-sans);
  font-size: 0.74rem;
  transition: var(--transition-interactive);
}

.record-log-button:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

.record-log-danger {
  border-color: var(--color-danger-border);
  color: var(--color-destructive);
}
</style>
