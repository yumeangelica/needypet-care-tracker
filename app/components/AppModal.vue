<script setup lang="ts">
import { X } from '@lucide/vue';

/**
 * Modal built on the native <dialog> element: focus trapping, Esc-to-close
 * and inert background come for free. Controlled via the `open` prop; the
 * parent closes it by reacting to the `close` event.
 */
const props = defineProps<{
  open: boolean;
  title: string;
}>();

const emit = defineEmits<{ close: [] }>();

const dialogRef = ref<HTMLDialogElement | null>(null);
const titleId = useId();

function syncOpen(open: boolean): void {
  const dialog = dialogRef.value;
  if (!dialog) {
    return;
  }
  if (open && !dialog.open) {
    dialog.showModal();
  } else if (!open && dialog.open) {
    dialog.close();
  }
}

watch(() => props.open, syncOpen);
onMounted(() => syncOpen(props.open));

// Fired by Esc and dialog.close(); keeps the parent's state in sync.
function onNativeClose(): void {
  if (props.open) {
    emit('close');
  }
}

// A click on the backdrop targets the <dialog> element itself.
function onBackdropClick(event: MouseEvent): void {
  if (event.target === dialogRef.value) {
    emit('close');
  }
}
</script>

<template>
  <dialog
    ref="dialogRef"
    class="app-modal"
    :aria-labelledby="titleId"
    @close="onNativeClose"
    @click="onBackdropClick"
  >
    <div class="app-modal-content">
      <header class="app-modal-band">
        <h2 :id="titleId" class="app-modal-title">{{ title }}</h2>
        <button type="button" class="app-modal-close" :aria-label="$t('nav.closeDialog')" @click="emit('close')">
          <X :size="20" aria-hidden="true" />
        </button>
      </header>
      <div class="app-modal-body">
        <slot />
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.app-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  width: min(calc(100vw - 2rem), 440px);
  max-height: calc(100vh - 2rem);
  max-height: calc(100dvh - 2rem);
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-lg);
  background: var(--color-card-bg);
  box-sizing: border-box;
  box-shadow: var(--shadow-panel);
  overflow: hidden;
  transform: translate(-50%, -50%);
}

.app-modal-content {
  display: flex;
  flex-direction: column;
  max-height: inherit;
}

.app-modal::backdrop {
  background: rgba(112, 94, 118, 0.45);
  backdrop-filter: blur(2px);
}

.app-modal-band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem var(--space-card);
  background: var(--gradient-card-band);
}

.app-modal-title {
  margin: 0;
  font-size: 1.05rem;
  color: var(--color-primary-foreground-strong);
}

.app-modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-primary-foreground-strong);
  transition: var(--transition-interactive);
}

@media (hover: hover) {
  .app-modal-close:hover {
    background: var(--color-surface-control);
  }
}

.app-modal-close:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

.app-modal-body {
  min-height: 0;
  padding: var(--space-card);
  overflow-y: auto;
}
</style>
