<script setup lang="ts">
import {
  CircleCheck,
  CirclePause,
  CirclePlay,
  CirclePlus,
  NotebookPen,
  PawPrint,
  Pencil,
  Trash2,
} from '@lucide/vue';
import type { CareRecordWithActor, Need, NeedWithRecords } from '#shared/types/domain';
import { compareDateOnly } from '#shared/utils/date';
import { getMeasurementValue } from '#shared/utils/measurement';
import { Temporal } from '#shared/utils/temporal';

const props = withDefaults(
  defineProps<{
    need: NeedWithRecords;
    isOwner?: boolean;
    ownerToday?: string;
    ownerTimezone?: string;
  }>(),
  { isOwner: false, ownerToday: '', ownerTimezone: 'UTC' },
);

const emit = defineEmits<{
  edit: [need: Need];
  toggle: [need: Need];
  remove: [need: Need];
  recorded: [need: Need];
}>();

const { user: sessionUser } = useUserSession();
const { t } = useI18n();
const currentUserId = computed(() => sessionUser.value?.id ?? null);

const measurementLabel = computed(() => {
  if (props.need.duration) {
    return `${props.need.duration.value} min`;
  }
  if (props.need.quantity) {
    return `${props.need.quantity.value} ${props.need.quantity.unit}`;
  }
  return '';
});

// "Every day" / "Every 2 days" / "Mon, Thu" — null (one-off) hides the badge.
const recurrenceLabel = computed(() => formatRecurrenceLabel(props.need.recurrence, t));

const unitLabel = computed(() =>
  props.need.duration ? 'min' : props.need.quantity?.unit ?? '',
);

const targetValue = computed(() => getMeasurementValue(props.need));
const loggedValue = computed(() =>
  props.need.records.reduce((sum, record) => sum + getMeasurementValue(record), 0),
);

// Legacy rule: the owner can edit or pause/resume only live needs on today
// or a future day; deleting is always allowed.
const canModify = computed(
  () =>
    props.isOwner &&
    !props.need.archived &&
    props.ownerToday !== '' &&
    compareDateOnly(props.need.dateFor, props.ownerToday) >= 0,
);

// "All Done!" is for everyone who can see the pet (owner and caretaker),
// only on the owner's current care day. Paused needs still accept records.
const canComplete = computed(
  () =>
    !props.need.completed &&
    !props.need.archived &&
    props.ownerToday !== '' &&
    props.need.dateFor === props.ownerToday,
);

const completing = ref(false);
const completeError = ref('');
const announcement = ref('');

// One click logs whatever is still missing, completing the need in one go.
async function markAllDone(): Promise<void> {
  if (completing.value) {
    return;
  }
  completing.value = true;
  completeError.value = '';
  const remaining = Math.max(targetValue.value - loggedValue.value, 1);
  try {
    const measurement = props.need.duration
      ? { duration: { value: remaining, unit: props.need.duration.unit } }
      : { quantity: { value: remaining, unit: props.need.quantity!.unit } };
    await $fetch(`/api/pets/${props.need.petId}/needs/${props.need.id}/records`, {
      method: 'POST',
      body: {
        note: '',
        timezone: Temporal.Now.timeZoneId(),
        ...measurement,
      },
    });
    announcement.value = t('needs.markedDone', { category: props.need.category });
    emit('recorded', props.need);
  } catch (error) {
    completeError.value =
      resolveFetchError(error, t);
  } finally {
    completing.value = false;
  }
}

// --- Partial logging + care log ---------------------------------------------

const logFormOpen = ref(false);
const logOpen = ref(false);
const editingRecord = ref<CareRecordWithActor | null>(null);
const removingRecord = ref<CareRecordWithActor | null>(null);
const removeBusy = ref(false);

function onPartialSaved(): void {
  logFormOpen.value = false;
  announcement.value = t('needs.careLogged', { category: props.need.category });
  emit('recorded', props.need);
}

function onRecordEdited(): void {
  editingRecord.value = null;
  announcement.value = t('needs.careLogEntryUpdated');
  emit('recorded', props.need);
}

async function confirmRemoveRecord(): Promise<void> {
  if (!removingRecord.value || removeBusy.value) {
    return;
  }
  completeError.value = '';
  removeBusy.value = true;
  try {
    await $fetch(
      `/api/pets/${props.need.petId}/needs/${props.need.id}/records/${removingRecord.value.id}`,
      { method: 'DELETE' },
    );
    removingRecord.value = null;
    announcement.value = t('needs.careLogEntryRemoved');
    emit('recorded', props.need);
  } catch (error) {
    completeError.value =
      resolveFetchError(error, t);
    removingRecord.value = null;
  } finally {
    removeBusy.value = false;
  }
}
</script>

<template>
  <article class="need-card" :class="{ 'need-card-done': need.completed }">
    <div class="need-head">
      <h4 class="need-category">{{ need.category }}</h4>
      <span class="need-badges">
        <span v-if="recurrenceLabel" class="need-recurrence">{{ recurrenceLabel }}</span>
        <span class="need-measurement">{{ measurementLabel }}</span>
      </span>
    </div>

    <p v-if="need.description" class="need-description">{{ need.description }}</p>

    <p v-if="need.completed" class="need-status need-status-done">
      <CircleCheck :size="16" aria-hidden="true" />
      {{ $t('needs.donePraise') }}
    </p>
    <!-- Archived copies are frozen history; the pause note only makes sense
         on a live (non-archived) need. A scheduled task resumes on demand;
         a one-off pause keeps the legacy "won't continue" meaning. -->
    <p v-else-if="!need.isActive && !need.archived" class="need-status need-status-paused">
      <CirclePause :size="16" aria-hidden="true" />
      {{ need.recurrence ? $t('needs.pausedNote') : $t('needs.pausedNoteOnce') }}
    </p>

    <p v-if="!need.completed && loggedValue > 0" class="need-progress">
      {{ $t('needs.progressLogged', { logged: loggedValue, target: targetValue, unit: unitLabel }) }}
    </p>

    <div v-if="canComplete" class="need-complete-row">
      <AppButton variant="primary" :disabled="completing" @click="markAllDone">
        <PawPrint :size="18" aria-hidden="true" />
        {{ completing ? $t('common.justAMoment') : $t('needs.allDone') }}
      </AppButton>
      <AppButton
        variant="secondary"
        :disabled="completing"
        :aria-expanded="logFormOpen"
        @click="logFormOpen = !logFormOpen"
      >
        <CirclePlus :size="18" aria-hidden="true" />
        {{ $t('needs.logSome') }}
      </AppButton>
    </div>

    <CareRecordForm
      v-if="logFormOpen && canComplete"
      class="need-log-form"
      :pet-id="need.petId"
      :need="need"
      :owner-timezone="ownerTimezone"
      @saved="onPartialSaved"
      @cancel="logFormOpen = false"
    />

    <p v-if="completeError" class="custom-error-message" role="alert">{{ completeError }}</p>
    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>

    <div v-if="need.records.length > 0" class="need-log-section">
      <button
        type="button"
        class="need-log-toggle"
        :aria-expanded="logOpen"
        @click="logOpen = !logOpen"
      >
        <NotebookPen :size="14" aria-hidden="true" />
        {{ $t('needs.careLogCount', { count: need.records.length }) }}
      </button>
      <CareRecordList
        v-if="logOpen"
        :records="need.records"
        :need="need"
        :is-owner="isOwner"
        :owner-timezone="ownerTimezone"
        :current-user-id="currentUserId"
        @edit="editingRecord = $event"
        @remove="removingRecord = $event"
      />
    </div>

    <div v-if="isOwner" class="need-actions">
      <button
        v-if="canModify"
        type="button"
        class="need-action-button"
        :aria-pressed="!need.isActive"
        @click="emit('toggle', need)"
      >
        <CirclePlay v-if="!need.isActive" :size="16" aria-hidden="true" />
        <CirclePause v-else :size="16" aria-hidden="true" />
        {{ need.isActive ? $t('needs.pause') : $t('needs.resume') }}
      </button>
      <button v-if="canModify" type="button" class="need-action-button" @click="emit('edit', need)">
        <Pencil :size="16" aria-hidden="true" />
        {{ $t('common.edit') }}
      </button>
      <button
        type="button"
        class="need-action-button need-action-danger"
        @click="emit('remove', need)"
      >
        <Trash2 :size="16" aria-hidden="true" />
        {{ $t('common.delete') }}
      </button>
    </div>

    <AppModal :open="editingRecord !== null" :title="$t('needs.editCareLogEntry')" @close="editingRecord = null">
      <CareRecordForm
        v-if="editingRecord"
        :pet-id="need.petId"
        :need="need"
        :owner-timezone="ownerTimezone"
        :record="editingRecord"
        @saved="onRecordEdited"
        @cancel="editingRecord = null"
      />
    </AppModal>

    <AppModal :open="removingRecord !== null" :title="$t('needs.removeEntryTitle')" @close="removingRecord = null">
      <p class="remove-note">
        {{ $t('needs.removeEntryNote', { value: removingRecord ? getMeasurementValue(removingRecord) : '', unit: unitLabel }) }}
      </p>
      <div class="remove-actions">
        <AppButton variant="secondary" :disabled="removeBusy" @click="removingRecord = null">
          {{ $t('common.keepIt') }}
        </AppButton>
        <AppButton variant="danger" :disabled="removeBusy" @click="confirmRemoveRecord">
          {{ removeBusy ? $t('common.removing') : $t('common.remove') }}
        </AppButton>
      </div>
    </AppModal>
  </article>
</template>

<style scoped>
.need-card {
  padding: var(--space-stack);
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-lg);
  background: var(--color-card-bg);
  box-shadow: var(--shadow-sm);
}

.need-card-done {
  background: var(--color-well);
}

.need-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem 0.75rem;
}

.need-category {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 0.95rem;
  color: var(--color-primary-foreground-strong);
}

.need-badges {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.need-measurement {
  padding: 3px 12px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-control);
  color: var(--color-primary-foreground-strong);
  font-size: 0.75rem;
  white-space: nowrap;
}

.need-recurrence {
  padding: 3px 12px;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-pill);
  background: var(--color-well);
  color: var(--color-muted-foreground);
  font-size: 0.75rem;
  white-space: nowrap;
}

.need-description {
  margin: 0.35rem 0 0;
  overflow-wrap: anywhere;
  font-size: 0.85rem;
}

.need-status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  font-weight: 650;
}

.need-status-done {
  color: var(--color-success);
}

.need-status-paused {
  color: var(--color-muted-foreground);
}

.need-progress {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: var(--color-primary-foreground);
}

.need-complete-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.6rem;
}

.need-complete-row :deep(.form-button) {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.need-log-form {
  margin-top: 0.6rem;
  padding: 0.6rem;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-md);
  background: var(--color-well);
}

.need-log-section {
  margin-top: 0.6rem;
}

.need-log-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-height: 36px;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-pill);
  background: var(--color-card-bg);
  color: var(--color-primary-foreground-strong);
  font-family: var(--font-sans);
  font-size: 0.78rem;
  transition: var(--transition-interactive);
  margin-bottom: 0.4rem;
}

.need-log-toggle:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

.need-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.6rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--color-border-divider);
}

.need-action-button {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-height: 36px;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-pill);
  background: var(--color-card-bg);
  color: var(--color-primary-foreground-strong);
  font-family: var(--font-sans);
  font-size: 0.78rem;
  transition: var(--transition-interactive);
}

@media (hover: hover) {
  .need-action-button:hover {
    box-shadow: var(--shadow-control-hover);
    transform: translateY(-1px);
  }
}

.need-action-button:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

.need-action-danger {
  border-color: var(--color-danger-border);
  color: var(--color-destructive);
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
</style>
