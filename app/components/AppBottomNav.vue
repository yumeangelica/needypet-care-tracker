<script setup lang="ts">
import { House, UserRound } from '@lucide/vue';
</script>

<template>
  <nav class="bottom-nav" :aria-label="$t('nav.main')">
    <NuxtLink to="/home" class="nav-item" active-class="is-active">
      <House :size="24" aria-hidden="true" />
      <span>{{ $t('nav.home') }}</span>
    </NuxtLink>
    <NuxtLink to="/profile" class="nav-item" active-class="is-active">
      <UserRound :size="24" aria-hidden="true" />
      <span>{{ $t('nav.profile') }}</span>
    </NuxtLink>
  </nav>
</template>

<style scoped>
/* Thumb-friendly fixed bottom navigation (mobile only). */
.bottom-nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: var(--z-index-mobile-nav);
  display: none;
  align-items: stretch;
  justify-content: space-around;
  gap: 0.25rem;
  height: var(--mobile-nav-height);
  padding: 0 0.5rem env(safe-area-inset-bottom, 0px);
  background: var(--gradient-nav);
  box-shadow: var(--shadow-nav-up);
}

@media (max-width: 768px) {
  .bottom-nav {
    display: flex;
  }
}

.nav-item {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  max-width: 9rem;
  min-height: var(--tap-target-size);
  margin: 6px 0;
  border-radius: var(--radius-lg);
  color: var(--color-primary-foreground-strong);
  font-size: 0.68rem;
  line-height: 1.1;
  transition: var(--transition-interactive);
}

.nav-item.is-active {
  background: var(--color-pill-cream);
  box-shadow: var(--shadow-sm);
}

.nav-item:active {
  transform: scale(0.96);
}

.nav-item:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: -2px;
}
</style>
