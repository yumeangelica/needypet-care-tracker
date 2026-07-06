<script setup lang="ts">
import { MailCheck, PawPrint } from '@lucide/vue';
import { FetchError } from 'ofetch';

// Public: the link may be opened logged out or on another device.
definePageMeta({ layout: 'auth' });

const route = useRoute();
const state = ref<'pending' | 'success' | 'error'>('pending');
const message = ref('');

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : '';
  if (!token) {
    state.value = 'error';
    message.value = 'This confirmation link is missing its token.';
    return;
  }
  try {
    const result = await $fetch<{ message: string }>('/api/auth/confirm-email', {
      method: 'POST',
      body: { token },
    });
    state.value = 'success';
    message.value = result.message;
  } catch (error) {
    state.value = 'error';
    message.value =
      error instanceof FetchError && error.data?.message
        ? error.data.message
        : 'Something went wrong. Please try again.';
  }
});
</script>

<template>
  <div class="login-register-container auth-form-card">
    <div class="paw-header-container auth-card-header">
      <MailCheck v-if="state === 'success'" aria-hidden="true" />
      <PawPrint v-else aria-hidden="true" />
      <h1 class="page-title title-underline">Email Confirmation</h1>
    </div>

    <p v-if="state === 'pending'" class="auth-subtitle" aria-live="polite">Just a moment...</p>

    <template v-else-if="state === 'success'">
      <p class="custom-valid-message" role="status">{{ message }}</p>
      <div class="auth-action-row">
        <NuxtLink to="/home" class="action-button primary-action-button">To My Pets</NuxtLink>
      </div>
    </template>

    <template v-else>
      <p class="custom-error-message" role="alert">{{ message }}</p>
      <p class="auth-subtitle">
        You can request a fresh link from your profile page after signing in.
      </p>
      <NuxtLink to="/login" class="auth-secondary-link">Go to sign in</NuxtLink>
    </template>
  </div>
</template>
