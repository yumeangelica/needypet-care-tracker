<script setup lang="ts">
import type { NuxtError } from '#app';

/**
 * Branded, localized error page (replaces Nuxt's default). The i18n plugin
 * still runs here, so copy follows the signed-in user's language; 404 gets
 * its own friendlier message, everything else shares the generic one.
 */
const props = defineProps<{ error: NuxtError }>();

const { t } = useI18n();

const isNotFound = computed(() => props.error.statusCode === 404);
const title = computed(() => t(isNotFound.value ? 'errors.pageNotFoundTitle' : 'errors.errorPageTitle'));

useHead({ title: computed(() => `${title.value} · NeedyPet`) });

function goHome(): void {
  // clearError resets the error state before navigating, so the app renders
  // normally again instead of re-showing this page.
  clearError({ redirect: '/home' });
}
</script>

<template>
  <main id="main-content" role="main" tabindex="-1" class="error-frame">
    <div class="login-register-container landing-card error-card">
      <p class="error-emoji" aria-hidden="true">🐾</p>
      <h1 class="page-title-lg title-underline">{{ title }}</h1>
      <p class="landing-intro">
        {{ isNotFound ? $t('errors.pageNotFoundNote') : $t('errors.errorPageNote') }}
      </p>
      <div class="landing-actions">
        <AppButton variant="primary" @click="goHome">{{ $t('common.backToMyPets') }}</AppButton>
      </div>
    </div>
  </main>
</template>

<style scoped>
/* Mirrors layouts/auth.vue's frame: no nav chrome, card centered on the page. */
.error-frame {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100svh;
  padding: 0 var(--space-page) var(--space-page);
  box-sizing: border-box;
}

.error-card {
  text-align: center;
}

.error-emoji {
  font-size: 3rem;
  line-height: 1;
  margin: 0;
}
</style>
