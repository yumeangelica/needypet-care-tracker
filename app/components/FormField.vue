<script setup lang="ts">
import { computed, useId } from 'vue';

/**
 * Labelled form field shell (.form-field visual recipe) with an accessible
 * error message. The control itself comes in through the default slot and
 * should bind the provided ids:
 *
 *   <FormField label="Name" :error="errors.name" v-slot="{ id, describedBy, invalid }">
 *     <input :id class="form-field-input" :aria-describedby="describedBy" :aria-invalid="invalid" />
 *   </FormField>
 */
const props = defineProps<{
  label: string;
  error?: string | null;
  hint?: string | null;
}>();

const id = useId();
const errorId = `${id}-error`;
const hintId = `${id}-hint`;

const describedBy = computed(
  () =>
    [props.error ? errorId : null, props.hint ? hintId : null].filter(Boolean).join(' ') ||
    undefined,
);
</script>

<template>
  <div class="field-group">
    <label :for="id" class="form-label">{{ label }}</label>
    <div class="form-field">
      <slot :id="id" :described-by="describedBy" :invalid="error ? true : undefined" />
    </div>
    <p v-if="hint" :id="hintId" class="auth-field-hint">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="field-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.field-group {
  width: 100%;
}

.field-error {
  margin: -0.35rem 0 0.6rem;
  padding-left: 4px;
  color: var(--color-destructive);
  font-size: 0.75rem;
  line-height: 1.35;
}
</style>
