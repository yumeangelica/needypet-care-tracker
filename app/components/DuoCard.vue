<script setup lang="ts">
/**
 * The pastel "duo card": pink->lilac gradient band (title + optional actions)
 * over a cream body. The signature card primitive across the whole app.
 */
defineProps<{
  title?: string;
}>();
</script>

<template>
  <section class="card-shell">
    <div class="card-band">
      <slot name="band">
        <h2 v-if="title" class="page-title">{{ title }}</h2>
      </slot>
      <div v-if="$slots.actions" class="band-actions">
        <slot name="actions" />
      </div>
    </div>
    <div class="card-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.band-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.4rem;
}
</style>
