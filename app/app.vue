<script setup lang="ts">
const { locale } = useI18n();

// Keep <html lang> in sync with the active UI language so assistive tech and
// the browser pick the right language (flips live when the user switches).
useHead({
  htmlAttrs: { lang: locale },
});
</script>

<template>
  <div class="page-root">
    <NuxtRouteAnnouncer />
    <!-- Injects the <link rel="manifest"> for the installable PWA (@vite-pwa/nuxt). -->
    <VitePwaManifest />
    <a href="#main-content" class="skip-link">{{ $t('common.skipToContent') }}</a>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
