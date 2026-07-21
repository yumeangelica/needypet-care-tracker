<script setup lang="ts">
import { ChevronDown, CirclePause, CirclePlay, Pencil, Repeat, Trash2 } from '@lucide/vue';
import type { NeedSchedule } from '#shared/types/domain';

/**
 * Owner-only recurring-rules list (ADR-0015): every schedule — active and
 * paused — with pause/resume, edit and delete. This is the only handle on a
 * paused weekly/interval rule between its due days (it has no instance to
 * act on). The parent refreshes the pet on `changed`.
 */
const props = defineProps<{
  petId: string;
  schedules: NeedSchedule[];
}>();

const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();

const open = ref(false);
const errorMessage = ref('');
const announcement = ref('');
const busyId = ref<string | null>(null);

const editingSchedule = ref<NeedSchedule | null>(null);
const removingSchedule = ref<NeedSchedule | null>(null);
const removeBusy = ref(false);

function ruleLabel(schedule: NeedSchedule): string {
  return formatRecurrenceLabel(schedule.recurrence, t) ?? '';
}

async function toggle(schedule: NeedSchedule): Promise<void> {
  if (busyId.value) {
    return;
  }
  errorMessage.value = '';
  busyId.value = schedule.id;
  try {
    await $fetch(`/api/pets/${props.petId}/schedules/${schedule.id}/toggle`, { method: 'POST' });
    announcement.value = schedule.isActive
      ? t('needs.schedulePaused', { category: schedule.category })
      : t('needs.scheduleResumed', { category: schedule.category });
    emit('changed');
  } catch (error) {
    errorMessage.value = resolveFetchError(error, t);
  } finally {
    busyId.value = null;
  }
}

function onScheduleSaved(): void {
  editingSchedule.value = null;
  announcement.value = t('needs.scheduleUpdated');
  emit('changed');
}

async function confirmRemove(): Promise<void> {
  if (!removingSchedule.value || removeBusy.value) {
    return;
  }
  errorMessage.value = '';
  removeBusy.value = true;
  const target = removingSchedule.value;
  try {
    await $fetch(`/api/pets/${props.petId}/schedules/${target.id}`, { method: 'DELETE' });
    announcement.value = t('needs.scheduleRemoved', { category: target.category });
    removingSchedule.value = null;
    emit('changed');
  } catch (error) {
    errorMessage.value = resolveFetchError(error, t);
    removingSchedule.value = null;
  } finally {
    removeBusy.value = false;
  }
}
</script>

<template>
  <section class="schedule-section" aria-labelledby="recurring-title">
    <button
      id="recurring-title"
      type="button"
      class="schedule-toggle"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Repeat :size="16" aria-hidden="true" />
      {{ $t('needs.recurringTitle', { count: schedules.length }) }}
      <ChevronDown :size="16" aria-hidden="true" class="schedule-chevron" :class="{ 'is-open': open }" />
    </button>

    <div v-if="open">
      <p v-if="errorMessage" class="custom-error-message" role="alert">{{ errorMessage }}</p>
      <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>

      <p v-if="schedules.length === 0" class="schedule-empty">{{ $t('needs.noRecurring') }}</p>

      <ul v-else class="schedule-list">
        <li v-for="schedule in schedules" :key="schedule.id" class="schedule-row">
          <div class="schedule-info">
            <span class="schedule-category">{{ schedule.category }}</span>
            <span class="schedule-rule">{{ ruleLabel(schedule) }}</span>
            <span v-if="!schedule.isActive" class="schedule-paused">
              <CirclePause :size="13" aria-hidden="true" />
              {{ $t('needs.pausedBadge') }}
            </span>
          </div>
          <div class="schedule-actions">
            <button
              type="button"
              class="need-action-button"
              :disabled="busyId === schedule.id"
              :aria-pressed="!schedule.isActive"
              @click="toggle(schedule)"
            >
              <CirclePlay v-if="!schedule.isActive" :size="16" aria-hidden="true" />
              <CirclePause v-else :size="16" aria-hidden="true" />
              {{ schedule.isActive ? $t('needs.pause') : $t('needs.resume') }}
            </button>
            <button type="button" class="need-action-button" @click="editingSchedule = schedule">
              <Pencil :size="16" aria-hidden="true" />
              {{ $t('common.edit') }}
            </button>
            <button
              type="button"
              class="need-action-button need-action-danger"
              @click="removingSchedule = schedule"
            >
              <Trash2 :size="16" aria-hidden="true" />
              {{ $t('common.delete') }}
            </button>
          </div>
        </li>
      </ul>
    </div>

    <AppModal
      :open="editingSchedule !== null"
      :title="$t('needs.editCareTask')"
      @close="editingSchedule = null"
    >
      <NeedForm
        v-if="editingSchedule"
        :pet-id="petId"
        :schedule="editingSchedule"
        @saved="onScheduleSaved"
        @cancel="editingSchedule = null"
      />
    </AppModal>

    <AppModal
      :open="removingSchedule !== null"
      :title="$t('needs.removeCareTaskTitle')"
      @close="removingSchedule = null"
    >
      <p class="remove-note">
        {{ $t('needs.removeScheduleNote', { category: removingSchedule?.category }) }}
      </p>
      <div class="remove-actions">
        <AppButton variant="secondary" :disabled="removeBusy" @click="removingSchedule = null">
          {{ $t('common.keepIt') }}
        </AppButton>
        <AppButton variant="danger" :disabled="removeBusy" @click="confirmRemove">
          {{ removeBusy ? $t('common.removing') : $t('common.remove') }}
        </AppButton>
      </div>
    </AppModal>
  </section>
</template>

<style scoped>
.schedule-section {
  margin-top: var(--space-stack);
  padding-top: var(--space-stack);
  border-top: 1px solid var(--color-border-divider);
}

.schedule-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: var(--tap-target-size);
  padding: 0.3rem 0.9rem;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-pill);
  background: var(--color-card-bg);
  color: var(--color-primary-foreground-strong);
  font-family: var(--font-sans);
  font-size: 0.85rem;
  transition: var(--transition-interactive);
}

.schedule-toggle:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

.schedule-chevron {
  transition: transform 0.15s ease;
}

.schedule-chevron.is-open {
  transform: rotate(180deg);
}

.schedule-empty {
  margin: var(--space-stack) 0 0;
  font-size: 0.85rem;
  color: var(--color-muted-foreground);
}

.schedule-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: var(--space-stack) 0 0;
  padding: 0;
  list-style: none;
}

.schedule-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem 0.75rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-md);
  background: var(--color-card-bg);
}

.schedule-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}

.schedule-category {
  overflow-wrap: anywhere;
  font-size: 0.9rem;
  font-weight: 650;
  color: var(--color-primary-foreground-strong);
}

.schedule-rule {
  padding: 2px 10px;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-pill);
  background: var(--color-well);
  color: var(--color-muted-foreground);
  font-size: 0.75rem;
  white-space: nowrap;
}

.schedule-paused {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 650;
  color: var(--color-muted-foreground);
}

.schedule-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
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
