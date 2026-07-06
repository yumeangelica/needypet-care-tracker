<template>
  <main id="main-content" role="main" tabindex="-1" class="auth-frame">
    <slot />
  </main>
</template>

<style scoped>
/* Auth pages have no nav chrome; content centers in the lilac page. */
.auth-frame {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100svh;
  padding: 0 var(--space-page) var(--space-page);
  box-sizing: border-box;
}
</style>
