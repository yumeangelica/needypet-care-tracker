<script setup lang="ts">
import logoUrl from '~/assets/images/needypet_logo_mobile_512.webp';

definePageMeta({ layout: 'auth' });

const { loggedIn } = useUserSession();

// Signed-in visitors go straight to their pets.
watchEffect(() => {
  if (loggedIn.value) {
    navigateTo('/home', { replace: true });
  }
});
</script>

<template>
  <div class="login-register-container landing-card">
    <img :src="logoUrl" alt="NeedyPet" class="logo" width="190" height="190" />
    <h1 class="page-title-lg title-underline">{{ $t('auth.tagline') }}</h1>
    <p class="landing-intro">{{ $t('auth.landingIntro') }}</p>
    <div class="landing-actions">
      <NuxtLink to="/login" class="action-button primary-action-button landing-action-button">
        <span>{{ $t('auth.welcomeBack') }}</span>
        <span class="landing-action-hint">{{ $t('auth.haveAccount') }}</span>
      </NuxtLink>
      <NuxtLink to="/register" class="action-button secondary-action-button landing-action-button">
        <span>{{ $t('auth.joinThePack') }}</span>
        <span class="landing-action-hint">{{ $t('auth.newHere') }}</span>
      </NuxtLink>
    </div>
  </div>
</template>
