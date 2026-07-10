<script setup lang="ts">
import { Eye, EyeOff, PawPrint } from '@lucide/vue';
import { FetchError } from 'ofetch';
import { z } from 'zod';
import { PASSWORD_RULES, registerSchema } from '#shared/schemas/user';
import { Temporal } from '#shared/utils/temporal';

definePageMeta({ layout: 'auth' });

const { fetch: refreshSession } = useUserSession();
const { t } = useI18n();

const userName = ref('');
const email = ref('');
const newPassword = ref('');
const showPassword = ref(false);
const submitting = ref(false);
const errorMessage = ref('');
const fieldErrors = ref<Record<string, string[]>>({});

// Best default: the browser's own IANA timezone; editable later in profile.
const timezone = Temporal.Now.timeZoneId();

const passwordChecks = computed(() =>
  PASSWORD_RULES.map((rule) => ({ ...rule, valid: rule.test(newPassword.value) })),
);

function firstError(field: string): string | null {
  // Zod messages are i18n keys (shared/schemas/*) — translate for display.
  const key = fieldErrors.value[field]?.[0];
  return key ? t(key) : null;
}

async function submit() {
  if (submitting.value) {
    return;
  }
  errorMessage.value = '';
  fieldErrors.value = {};

  const input = {
    userName: userName.value.trim(),
    email: email.value.trim(),
    newPassword: newPassword.value,
    timezone,
  };
  // Same schema the server uses -> identical messages, instant feedback.
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    fieldErrors.value = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>;
    return;
  }

  submitting.value = true;
  try {
    await $fetch('/api/auth/register', { method: 'POST', body: parsed.data });
    await refreshSession();
    await navigateTo('/home');
  } catch (error) {
    if (error instanceof FetchError && error.statusCode === 422 && error.data?.errorDetails) {
      fieldErrors.value = error.data.errorDetails;
    } else {
      errorMessage.value = resolveFetchError(error, t);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login-register-container auth-form-card">
    <div class="paw-header-container auth-card-header">
      <PawPrint aria-hidden="true" />
      <h1 class="page-title title-underline">{{ $t('auth.joinThePack') }}</h1>
    </div>
    <p class="auth-subtitle">{{ $t('auth.registerSubtitle') }}</p>
    <form class="auth-form auth-register-form" novalidate @submit.prevent="submit">
      <label class="form-label" for="register-username">{{ $t('auth.username') }}</label>
      <div class="auth-field">
        <input
          id="register-username"
          v-model="userName"
          type="text"
          class="auth-field-input"
          autocomplete="username"
          :placeholder="$t('auth.registerUsernamePlaceholder')"
          :aria-invalid="firstError('userName') ? true : undefined"
          :aria-describedby="firstError('userName') ? 'register-username-error' : undefined"
          required
        />
      </div>
      <p v-if="firstError('userName')" id="register-username-error" class="custom-error-message" role="alert">
        {{ firstError('userName') }}
      </p>

      <label class="form-label" for="register-email">{{ $t('auth.email') }}</label>
      <div class="auth-field">
        <input
          id="register-email"
          v-model="email"
          type="email"
          class="auth-field-input"
          autocomplete="email"
          :placeholder="$t('auth.emailPlaceholder')"
          :aria-invalid="firstError('email') ? true : undefined"
          :aria-describedby="firstError('email') ? 'register-email-error' : undefined"
          required
        />
      </div>
      <p v-if="firstError('email')" id="register-email-error" class="custom-error-message" role="alert">
        {{ firstError('email') }}
      </p>

      <label class="form-label" for="register-password">{{ $t('auth.password') }}</label>
      <div class="auth-field">
        <input
          id="register-password"
          v-model="newPassword"
          :type="showPassword ? 'text' : 'password'"
          class="auth-field-input"
          autocomplete="new-password"
          :placeholder="$t('auth.registerPasswordPlaceholder')"
          :aria-invalid="firstError('newPassword') ? true : undefined"
          aria-describedby="register-password-rules"
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
      <div id="register-password-rules" class="strong-password-note">
        <p class="rules-title">{{ $t('auth.strongPawCodeHas') }}</p>
        <ul>
          <li v-for="check in passwordChecks" :key="check.id" :class="{ valid: check.valid }">
            {{ $t(check.label) }}
          </li>
        </ul>
      </div>
      <p v-if="firstError('newPassword')" class="custom-error-message" role="alert">
        {{ firstError('newPassword') }}
      </p>

      <span class="form-label">{{ $t('auth.timezone') }}</span>
      <div class="auth-field">
        <span class="auth-field-input auth-field-value">{{ timezone }}</span>
      </div>
      <p class="auth-field-hint">{{ $t('auth.timezoneHint') }}</p>

      <p v-if="errorMessage" class="custom-error-message" role="alert">{{ errorMessage }}</p>
      <div class="auth-action-row">
        <button
          type="submit"
          class="action-button primary-action-button auth-action-button"
          :disabled="submitting"
        >
          {{ submitting ? $t('common.justAMoment') : $t('auth.joinThePack') }}
        </button>
      </div>
      <NuxtLink to="/login" class="auth-secondary-link">
        {{ $t('auth.registerToLogin') }}
      </NuxtLink>
    </form>
  </div>
</template>

<style scoped>
.rules-title {
  margin: 0 0 0.25rem;
  font-size: 0.72rem;
  color: var(--color-foreground);
}
</style>
