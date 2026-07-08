<script setup lang="ts">
import { Eye, EyeOff, PawPrint } from '@lucide/vue';
import { FetchError } from 'ofetch';

definePageMeta({ layout: 'auth' });

const { fetch: refreshSession } = useUserSession();
const { t } = useI18n();

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
        ? t('auth.wrongPawCode')
        : t('errors.generic');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login-register-container auth-form-card">
    <div class="paw-header-container auth-card-header">
      <PawPrint aria-hidden="true" />
      <h1 class="page-title title-underline">{{ $t('auth.welcomeBack') }}</h1>
    </div>
    <p class="auth-subtitle">{{ $t('auth.loginSubtitle') }}</p>
    <form class="auth-form" novalidate @submit.prevent="submit">
      <label class="form-label" for="login-username">{{ $t('auth.username') }}</label>
      <div class="auth-field">
        <input
          id="login-username"
          v-model="userName"
          type="text"
          class="auth-field-input"
          autocomplete="username"
          :placeholder="$t('auth.usernamePlaceholder')"
          required
        />
      </div>
      <label class="form-label" for="login-password">{{ $t('auth.password') }}</label>
      <div class="auth-field">
        <input
          id="login-password"
          v-model="password"
          :type="showPassword ? 'text' : 'password'"
          class="auth-field-input"
          autocomplete="current-password"
          :placeholder="$t('auth.loginPasswordPlaceholder')"
          required
        />
        <button
          type="button"
          class="show-password-button"
          :aria-label="showPassword ? $t('auth.hidePassword') : $t('auth.showPassword')"
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
          {{ submitting ? $t('common.justAMoment') : $t('auth.logIn') }}
        </button>
      </div>
      <NuxtLink to="/forgot-password" class="auth-secondary-link">
        {{ $t('auth.forgotPawCode') }}
      </NuxtLink>
      <NuxtLink to="/register" class="auth-secondary-link">
        {{ $t('auth.loginToRegister') }}
      </NuxtLink>
      <NuxtLink to="/" class="auth-secondary-link">{{ $t('auth.backToStart') }}</NuxtLink>
    </form>
  </div>
</template>
