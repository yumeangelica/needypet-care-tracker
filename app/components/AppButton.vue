<script setup lang="ts">
/**
 * Shared button on the old app's .form-button recipe (gradient primary,
 * soft pink secondary, outlined danger), always >= 44px tall.
 */
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'danger';
    type?: 'button' | 'submit';
    disabled?: boolean;
  }>(),
  { variant: 'primary', type: 'button', disabled: false },
);
</script>

<template>
  <button :type="type" :disabled="disabled" class="form-button" :class="variant">
    <slot />
  </button>
</template>
