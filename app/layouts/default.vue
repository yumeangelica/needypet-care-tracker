<template>
  <div class="app-frame">
    <AppHeader />
    <main id="main-content" role="main" tabindex="-1" class="app-page-root">
      <slot />
    </main>
    <AppBottomNav />
  </div>
</template>

<style scoped>
.app-frame {
  display: flex;
  flex-direction: column;
  min-height: 100svh;
}

main {
  flex: 1 0 auto;
}

@media (max-width: 768px) {
  /* Keep scrollable content clear of the fixed bottom nav */
  main {
    padding-bottom: var(--mobile-nav-reserve);
  }
}
</style>
