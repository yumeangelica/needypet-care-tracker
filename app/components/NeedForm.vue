<script setup lang="ts">
import { FetchError } from 'ofetch';
import { z } from 'zod';
import { needSchema, needUpdateSchema, scheduleUpdateSchema } from '#shared/schemas/need';
import type { Need, NeedSchedule } from '#shared/types/domain';
import { MAX_INTERVAL_DAYS, MIN_INTERVAL_DAYS } from '#shared/utils/recurrence';

/**
 * Add/edit form for a care task. Owns its own request: POST for a new need,
 * PUT to the need when `need` is set, PUT to the schedule when `schedule` is
 * set (the rules-list edit — there the task cannot become a one-off). The
 * measurement type is chosen on create and fixed afterwards (a record must
 * always match its parent need's type).
 */
const props = defineProps<{
  petId: string;
  dateFor?: string; // YYYY-MM-DD the new need is created for (owner-local)
  need?: Need | null;
  schedule?: NeedSchedule | null;
}>();

const emit = defineEmits<{ saved: [saved: Need | NeedSchedule]; cancel: [] }>();

const { t } = useI18n();

const source = computed(() => props.schedule ?? props.need ?? null);
const isScheduleEdit = computed(() => Boolean(props.schedule));
const isEdit = computed(() => source.value !== null);

const category = ref(source.value?.category ?? '');
const description = ref(source.value?.description ?? '');
const measurementType = ref<'duration' | 'quantity'>(source.value?.quantity ? 'quantity' : 'duration');
const value = ref(
  source.value?.duration ? String(source.value.duration.value)
  : source.value?.quantity ? String(source.value.quantity.value)
  : '',
);
const quantityUnit = ref<'ml' | 'g'>(source.value?.quantity?.unit ?? 'ml');

// Recurrence: a schedule always has a rule; a need may be a one-off (null).
const initialRule = props.schedule?.recurrence ?? props.need?.recurrence ?? null;
const recurrenceType = ref<'once' | 'daily' | 'interval' | 'weekly'>(
  isEdit.value ? (initialRule?.type ?? 'once') : 'daily',
);
const intervalDays = ref(initialRule?.type === 'interval' ? String(initialRule.intervalDays) : '');
const weekdays = ref<number[]>(initialRule?.type === 'weekly' ? [...initialRule.weekdays] : []);

const recurrenceOptions = computed(() =>
  (isScheduleEdit.value
    ? (['daily', 'interval', 'weekly'] as const)
    : (['once', 'daily', 'interval', 'weekly'] as const)),
);

function toggleWeekday(day: number): void {
  weekdays.value = weekdays.value.includes(day)
    ? weekdays.value.filter((existing) => existing !== day)
    : [...weekdays.value, day].sort((a, b) => a - b);
}

const submitting = ref(false);
const errorMessage = ref('');
const fieldErrors = ref<Record<string, string[]>>({});

function firstError(field: string): string | null {
  // Zod messages are i18n keys (shared/schemas/*) — translate for display.
  const key = fieldErrors.value[field]?.[0];
  return key ? t(key) : null;
}

// The exactly-one-measurement schema issue lands on the `quantity` path;
// show it (and any measurement error) under the shared value input.
const measurementError = computed(() => firstError('quantity') ?? firstError('duration'));
const recurrenceError = computed(() => firstError('recurrence'));

function sanitizeValue(): void {
  value.value = value.value.replace(/\D/g, '');
}

function sanitizeInterval(): void {
  intervalDays.value = intervalDays.value.replace(/\D/g, '');
}

async function submit() {
  if (submitting.value) {
    return;
  }
  errorMessage.value = '';
  fieldErrors.value = {};

  const numericValue = Number(value.value);
  const measurement =
    measurementType.value === 'duration'
      ? { duration: { value: numericValue, unit: 'minutes' as const } }
      : { quantity: { value: numericValue, unit: quantityUnit.value } };

  const recurrence =
    recurrenceType.value === 'interval'
      ? { type: 'interval' as const, intervalDays: Number(intervalDays.value) }
      : recurrenceType.value === 'weekly'
        ? { type: 'weekly' as const, weekdays: [...weekdays.value] }
        : { type: recurrenceType.value };

  const input = {
    ...(isEdit.value ? {} : { dateFor: props.dateFor }),
    category: category.value.trim(),
    description: description.value.trim(),
    ...measurement,
    recurrence,
  };

  // Same schema the server uses -> identical messages, instant feedback.
  const schema = isScheduleEdit.value
    ? scheduleUpdateSchema
    : isEdit.value
      ? needUpdateSchema
      : needSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    fieldErrors.value = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>;
    return;
  }

  submitting.value = true;
  try {
    const saved = props.schedule
      ? await $fetch<NeedSchedule>(`/api/pets/${props.petId}/schedules/${props.schedule.id}`, {
          method: 'PUT',
          body: parsed.data,
        })
      : props.need
        ? await $fetch<Need>(`/api/pets/${props.petId}/needs/${props.need.id}`, {
            method: 'PUT',
            body: parsed.data,
          })
        : await $fetch<Need>(`/api/pets/${props.petId}/needs`, {
            method: 'POST',
            body: parsed.data,
          });
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
  <form class="need-form" novalidate @submit.prevent="submit">
    <FormField v-slot="{ id, describedBy, invalid }" :label="$t('needs.careTask')" :error="firstError('category')">
      <input
        :id
        v-model="category"
        type="text"
        class="form-field-input"
        :placeholder="$t('needs.careTaskPlaceholder')"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
        required
      />
    </FormField>

    <FormField v-slot="{ id, describedBy, invalid }" :label="$t('pets.descriptionOptional')" :error="firstError('description')">
      <textarea
        :id
        v-model="description"
        class="form-field-input need-form-textarea"
        rows="2"
        :placeholder="$t('needs.detailsPlaceholder')"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
      />
    </FormField>

    <fieldset v-if="!isEdit" class="need-form-type">
      <legend class="form-label">{{ $t('needs.measuredAs') }}</legend>
      <div class="need-form-type-options">
        <label class="need-form-radio" :class="{ selected: measurementType === 'duration' }">
          <input v-model="measurementType" type="radio" value="duration" name="measurement-type" />
          {{ $t('needs.timeMinutes') }}
        </label>
        <label class="need-form-radio" :class="{ selected: measurementType === 'quantity' }">
          <input v-model="measurementType" type="radio" value="quantity" name="measurement-type" />
          {{ $t('needs.amountMlOrG') }}
        </label>
      </div>
    </fieldset>

    <div class="need-form-measurement">
      <FormField
        v-slot="{ id, describedBy, invalid }"
        :label="measurementType === 'duration' ? $t('needs.minutesPerDay') : $t('needs.amountPerDay')"
        :error="measurementError"
        class="need-form-value"
      >
        <input
          :id
          v-model="value"
          type="text"
          inputmode="numeric"
          class="form-field-input"
          :placeholder="measurementType === 'duration' ? $t('needs.minutesPlaceholder') : $t('needs.amountPlaceholder')"
          :aria-describedby="describedBy"
          :aria-invalid="invalid"
          required
          @input="sanitizeValue"
        />
      </FormField>

      <FormField v-if="measurementType === 'quantity'" v-slot="{ id }" :label="$t('needs.unit')" class="need-form-unit">
        <select :id="id" v-model="quantityUnit" class="form-field-input">
          <option value="ml">ml</option>
          <option value="g">g</option>
        </select>
      </FormField>
    </div>

    <fieldset class="need-form-type">
      <legend class="form-label">{{ $t('needs.repeats') }}</legend>
      <div class="need-form-type-options">
        <label
          v-for="option in recurrenceOptions"
          :key="option"
          class="need-form-radio"
          :class="{ selected: recurrenceType === option }"
        >
          <input v-model="recurrenceType" type="radio" :value="option" name="recurrence-type" />
          {{
            option === 'once' ? $t('needs.repeatOnce')
            : option === 'daily' ? $t('needs.repeatDaily')
            : option === 'interval' ? $t('needs.repeatInterval')
            : $t('needs.repeatWeekdays')
          }}
        </label>
      </div>
    </fieldset>

    <FormField
      v-if="recurrenceType === 'interval'"
      v-slot="{ id, describedBy, invalid }"
      :label="$t('needs.intervalDaysLabel')"
      :error="recurrenceError"
      class="need-form-interval"
    >
      <input
        :id
        v-model="intervalDays"
        type="text"
        inputmode="numeric"
        class="form-field-input"
        :placeholder="`${MIN_INTERVAL_DAYS}–${MAX_INTERVAL_DAYS}`"
        :aria-describedby="describedBy"
        :aria-invalid="invalid"
        required
        @input="sanitizeInterval"
      />
    </FormField>

    <fieldset v-if="recurrenceType === 'weekly'" class="need-form-type">
      <legend class="form-label">{{ $t('needs.weekdaysLabel') }}</legend>
      <div class="need-form-type-options">
        <label
          v-for="(key, index) in WEEKDAY_KEYS"
          :key="key"
          class="need-form-radio need-form-weekday"
          :class="{ selected: weekdays.includes(index + 1) }"
        >
          <input
            type="checkbox"
            :checked="weekdays.includes(index + 1)"
            @change="toggleWeekday(index + 1)"
          />
          {{ $t(`needs.weekdayShort.${key}`) }}
        </label>
      </div>
      <p v-if="recurrenceError" class="custom-error-message" role="alert">{{ recurrenceError }}</p>
    </fieldset>

    <p v-if="errorMessage" class="custom-error-message" role="alert">{{ errorMessage }}</p>

    <div class="need-form-actions">
      <AppButton variant="secondary" type="button" :disabled="submitting" @click="emit('cancel')">
        {{ $t('common.cancel') }}
      </AppButton>
      <AppButton variant="primary" type="submit" :disabled="submitting">
        {{ submitting ? $t('common.justAMoment') : isEdit ? $t('common.saveChanges') : $t('needs.addCareTask') }}
      </AppButton>
    </div>
  </form>
</template>

<style scoped>
.need-form {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.need-form-textarea {
  resize: vertical;
  min-height: 64px;
}

.need-form-type {
  margin: 0 0 0.35rem;
  padding: 0;
  border: none;
}

.need-form-type-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.need-form-radio {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: var(--tap-target-size);
  padding: 0.35rem 0.9rem;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-pill);
  background: var(--color-card-bg);
  font-size: 0.85rem;
  cursor: pointer;
  transition: var(--transition-interactive);
}

.need-form-radio.selected {
  border-color: var(--color-primary-foreground);
  background: var(--color-surface-control);
  color: var(--color-primary-foreground-strong);
}

.need-form-radio:has(input:focus-visible) {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

.need-form-radio input {
  accent-color: var(--color-primary-foreground);
}

.need-form-weekday {
  padding: 0.35rem 0.7rem;
}

.need-form-weekday input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.need-form-measurement {
  display: flex;
  gap: 0.75rem;
}

.need-form-value {
  flex: 1 1 auto;
}

.need-form-unit {
  flex: 0 0 90px;
}

.need-form-interval {
  max-width: 200px;
}

.need-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
</style>
