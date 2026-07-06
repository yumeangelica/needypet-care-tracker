<script setup lang="ts">
import { Eye, EyeOff, PawPrint } from '@lucide/vue';
import { FetchError } from 'ofetch';

definePageMeta({ layout: 'auth' });

const { fetch: refreshSession } = useUserSession();

const userName = ref('');
const password = ref('');
const showPassword = ref(false);
const errorMessage = ref('');
const submitting = ref(false);

async function submit() {
  if (submitting.value) {
    return;
  }
  errorMessage.value = '';
  submitting.value = true;
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { userName: userName.value, password: password.value },
    });
    await refreshSession();
    await navigateTo('/home');
  } catch (error) {
    errorMessage.value =
      error instanceof FetchError && error.statusCode === 401
        ? "That paw code doesn't match. Try again?"
        : 'Something went wrong. Please try again.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login-register-container auth-form-card">
    <div class="paw-header-container auth-card-header">
      <PawPrint aria-hidden="true" />
      <h1 class="page-title title-underline">Welcome Back</h1>
    </div>
    <p class="auth-subtitle">Your furry friends missed you 🐾</p>
    <form class="auth-form" novalidate @submit.prevent="submit">
      <label class="form-label" for="login-username">Username</label>
      <div class="auth-field">
        <input
          id="login-username"
          v-model="userName"
          type="text"
          class="auth-field-input"
          autocomplete="username"
          placeholder="Your username"
          required
        />
      </div>
      <label class="form-label" for="login-password">Password</label>
      <div class="auth-field">
        <input
          id="login-password"
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          class="auth-field-input"
          autocomplete="current-password"
          placeholder="Your secret paw code"
          required
        />
        <button
          type="button"
          class="show-password-button"
          :aria-label="showPassword ? 'Hide password' : 'Show password'"
          :aria-pressed="showPassword"
          @click="showPassword = !showPassword"
        >
          <EyeOff v-if="showPassword" :size="20" aria-hidden="true" />
          <Eye v-else :size="20" aria-hidden="true" />
        </button>
      </div>
      <p v-if="errorMessage" class="custom-error-message" role="alert">{{ errorMessage }}</p>
      <div class="auth-action-row">
        <button type="submit" class="action-button primary-action-button" :disabled="submitting">
          {{ submitting ? 'Just a moment...' : 'Log In' }}
        </button>
      </div>
      <NuxtLink to="/forgot-password" class="auth-secondary-link">
        Forgot your paw code?
      </NuxtLink>
      <NuxtLink to="/register" class="auth-secondary-link">
        New here? Join the Pack instead
      </NuxtLink>
      <NuxtLink to="/" class="auth-secondary-link">Back to start</NuxtLink>
    </form>
  </div>
</template>
