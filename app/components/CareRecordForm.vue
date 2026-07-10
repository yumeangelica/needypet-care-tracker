<script setup lang="ts">
import { FetchError } from 'ofetch';
import { z } from 'zod';
import { careRecordSchema, careRecordUpdateSchema } from '#shared/schemas/careRecord';
import type { CareRecordWithActor, Need } from '#shared/types/domain';
import { formatTimeInTimeZone } from '#shared/utils/datetime';
import { Temporal } from '#shared/utils/temporal';

/**
 * Logs a partial care amount (POST) or edits an existing record (PATCH when
 * `record` is set). Time is optional wall-clock in the OWNER's timezone;
 * empty means "now" on create and "keep the stored time" on edit.
 */
const props = defineProps<{
  petId: string;
  need: Need;
  ownerTimezone: string;
  record?: CareRecordWithActor | null;
}>();

const emit = defineEmits<{ saved: [need: Need]; cancel: [] }>();

const { t } = useI18n();

const isEdit = computed(() => Boolean(props.record));

const unitLabel = computed(() =>
  props.need.duration ? 'min' : props.need.quantity?.unit ?? '',
);

const existing = props.record;
const value = ref(
  existing?.duration ? String(existing.duration.value)
  : existing?.quantity ? String(existing.quantity.value)
  : '',
);
const note = ref(existing?.note ?? '');
// Prefill the stored moment (owner wall-clock) on edit; only a changed value
// is sent, so an untouched field never rewrites the timestamp.
const initialTime = existing ? formatTimeInTimeZone(existing.date, props.ownerTimezone) : '';
const timeOfDay = ref(initialTime);

const submitting = ref(false);
const errorMessage = ref('');
const fieldErrors = ref<Record<string, string[]>>({});

function firstError(field: string): string | null {
  // Zod messages are i18n keys (shared/schemas/*) — translate for display.
  const key = fieldErrors.value[field]?.[0];
  return key ? t(key) : null;
}

const measurementError = computed(() => firstError('quantity') ?? firstError('duration'));

function sanitizeValue(): void {
  value.value = value.value.replace(/\D/g, '');
}

async function submit(): Promise<void> {
  if (submitting.value) {
    return;
  }
  errorMessage.value = '';
  fieldErrors.value = {};

  const numericValue = Number(value.value);
  const measurement = props.need.duration
    ? { duration: { value: numericValue, unit: 'minutes' as const } }
    : { quantity: { value: numericValue, unit: props.need.quantity?.unit ?? ('ml' as const) } };

  const timeChanged = timeOfDay.value !== '' && timeOfDay.value !== initialTime;
  const input = {
    note: note.value.trim(),
    ...(isEdit.value ? {} : { timezone: Temporal.Now.timeZoneId() }),
    ...measurement,
    ...(timeChanged ? { timeOfDay: timeOfDay.value } : {}),
  };

  const parsed = (isEdit.value ? careRecordUpdateSchema : careRecordSchema).safeParse(input);
  if (!parsed.success) {
    fieldErrors.value = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>;
    return;
  }

  submitting.value = true;
  try {
    const base = `/api/pets/${props.petId}/needs/${props.need.id}/records`;
    const saved = props.record
      ? await $fetch<Need>(`${base}/${props.record.id}`, { method: 'PATCH', body: parsed.data })
      : await $fetch<Need>(base, { method: 'POST', body: parsed.data });
    emit('saved', saved);
  } catch (error) {
    if (error instanceof FetchError && error.statusCode === 422 && error.data?.errorDetails) {
      fieldErrors.value = error.data.errorDetails;
    } else {
      errorMessage.value = resolveFetchError(error, t);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <form class="record-form" novalidate @submit.prevent="submit">
    <div class="record-form-row">
      <FormField
        v-slot="{ id, describedBy, invalid }"
        :label="$t('records.amountWithUnit', { unit: unitLabel })"
        :error="measurementError"
        class="record-form-value"
      >
        <input
          :id
          v-model="value"
          type="text"
          inputmode="numeric"
          class="form-field-input"
          :placeholder="need.duration ? $t('records.amountShortPlaceholder') : $t('records.amountLongPlaceholder')"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
          required
          @input="sanitizeValue"
        />
      </FormField>

      <FormField
        v-slot="{ id, describedBy, invalid }"
        :label="$t('records.timeOptional')"
        :error="firstError('timeOfDay')"
        :hint="isEdit ? undefined : $t('records.timeHint')"
        class="record-form-time"
      >
        <input
          :id
          v-model="timeOfDay"
          type="time"
          class="form-field-input"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
        />
      </FormField>
    </div>

    <FormField v-slot="{ id, describedBy, invalid }" :label="$t('records.noteOptional')" :error="firstError('note')">
      <input
        :id
        v-model="note"
        type="text"
        class="form-field-input"
        :placeholder="$t('records.notePlaceholder')"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
      />
    </FormField>

    <p v-if="errorMessage" class="custom-error-message" role="alert">{{ errorMessage }}</p>

    <div class="record-form-actions">
      <AppButton variant="secondary" type="button" :disabled="submitting" @click="emit('cancel')">
        {{ $t('common.cancel') }}
      </AppButton>
      <AppButton variant="primary" type="submit" :disabled="submitting">
        {{ submitting ? $t('common.justAMoment') : isEdit ? $t('common.saveChanges') : $t('records.logCare') }}
      </AppButton>
    </div>
  </form>
</template>

<style scoped>
.record-form {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.record-form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.record-form-value {
  flex: 1 1 120px;
}

.record-form-time {
  flex: 1 1 120px;
}

.record-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
</style>
