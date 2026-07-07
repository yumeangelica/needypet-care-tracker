<template>
  <div class="page-root">
    <NuxtRouteAnnouncer />
    <!-- Injects the <link rel="manifest"> for the installable PWA (@vite-pwa/nuxt). -->
    <VitePwaManifest />
    <a href="#main-content" class="skip-link">Skip to content</a>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
