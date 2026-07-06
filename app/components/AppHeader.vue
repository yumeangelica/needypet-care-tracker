<script setup lang="ts">
import { PawPrint } from '@lucide/vue';
</script>

<template>
  <header class="app-header">
    <NuxtLink to="/home" class="brand paw-header-container">
      <PawPrint :size="26" aria-hidden="true" />
      <span class="brand-name">NeedyPet</span>
    </NuxtLink>
    <nav class="header-nav" aria-label="Main">
      <NuxtLink to="/home" class="header-link" active-class="is-active">Home</NuxtLink>
      <NuxtLink to="/profile" class="header-link" active-class="is-active">Profile</NuxtLink>
    </nav>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: var(--z-index-header);
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding: 0 var(--space-page);
  background: var(--gradient-nav);
  box-shadow: var(--shadow-nav);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: auto;
  margin: 0;
}

.brand-name {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-primary-foreground-strong);
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.header-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap-target-size);
  padding: 0.4rem 0.9rem;
  border-radius: var(--radius-pill);
  color: var(--color-primary-foreground-strong);
  font-size: 0.85rem;
  transition: var(--transition-interactive);
}

@media (hover: hover) {
  .header-link:hover {
    background: var(--color-pill-cream-soft);
  }
}

.header-link.is-active {
  background: var(--color-pill-cream);
  box-shadow: var(--shadow-sm);
}

.header-link:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

/* Mobile uses the bottom nav instead */
@media (max-width: 768px) {
  .app-header {
    display: none;
  }
}
</style>
