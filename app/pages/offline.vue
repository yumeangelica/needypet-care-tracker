<script setup lang="ts">
// Offline fallback served by the service worker when a navigation misses the
// cache with no network. It must not touch the API or session (there is no
// connection), so it stays a static, self-contained page.
definePageMeta({ layout: 'auth' });

useHead({ title: 'Offline · NeedyPet' });

function retry() {
  // A hard reload lets the service worker re-attempt the real page once the
  // connection is back.
  if (import.meta.client) {
    window.location.reload();
  }
}
</script>

<template>
  <div class="login-register-container landing-card offline-card">
    <p class="offline-emoji" aria-hidden="true">🐾</p>
    <h1 class="page-title-lg title-underline">You're offline</h1>
    <p class="landing-intro">
      Your furry friends are waiting — their care moments will be right here as
      soon as you're back online.
    </p>
    <div class="landing-actions">
      <AppButton variant="primary" @click="retry">Try again</AppButton>
    </div>
  </div>
</template>

<style scoped>
.offline-card {
  text-align: center;
}

.offline-emoji {
  font-size: 3rem;
  line-height: 1;
  margin: 0;
}
</style>
