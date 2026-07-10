<script setup lang="ts">
/**
 * Dashboard care-task progress for one pet's local "today": a soft pill showing
 * "done / total" (or an all-done message) with a kawaii fill bar underneath.
 * Reserves a fixed height so pet cards stay the same size whether or not the
 * badge is visible.
 */
const props = defineProps<{ done: number; total: number }>();

const allDone = computed(() => props.total > 0 && props.done >= props.total);
const fillPercent = computed(() =>
  props.total > 0 ? Math.round((props.done / props.total) * 100) : 0,
);
</script>

<template>
  <span class="task-progress" :class="{ 'is-complete': allDone }">
    <span class="task-progress-label">
      {{ allDone ? $t('needs.allDone') : `${done}/${total}` }}
    </span>
    <span
      class="task-progress-track"
      role="progressbar"
      :aria-label="$t('needs.todayProgress')"
      :aria-valuenow="done"
      :aria-valuemin="0"
      :aria-valuemax="total"
    >
      <span class="task-progress-fill" :style="{ width: `${fillPercent}%` }" />
    </span>
  </span>
</template>

<style scoped>
/* Matches the reserved footprint of the old .task-pill so card heights stay
   even whether the badge is shown or hidden. */
.task-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: calc(2 * 1.4em + 6px);
  width: 100%;
  max-width: 100%;
  margin-top: auto;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-control);
  color: var(--color-primary-foreground-strong);
  font-size: 0.7rem;
  line-height: 1.4;
  text-align: center;
}

.task-progress-label {
  font-weight: 650;
  overflow-wrap: anywhere;
}

.task-progress-track {
  width: 100%;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-app);
  box-shadow: var(--shadow-inset-surface);
  overflow: hidden;
}

.task-progress-fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--gradient-card-band);
  transition: width 0.35s ease;
}

/* When everything's done, the bar goes fully pink to celebrate. */
.task-progress.is-complete .task-progress-fill {
  background: var(--color-primary);
}
</style>
