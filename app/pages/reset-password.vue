<script setup lang="ts">
import { Eye, EyeOff, PawPrint } from '@lucide/vue';
import { FetchError } from 'ofetch';
import { z } from 'zod';
import { PASSWORD_RULES, resetPasswordSchema } from '#shared/schemas/user';

definePageMeta({ layout: 'auth' });

const route = useRoute();
const { t } = useI18n();
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''));

const newPassword = ref('');
const showPassword = ref(false);
const submitting = ref(false);
const successMessage = ref('');
const errorMessage = ref('');
const fieldErrors = ref<Record<string, string[]>>({});

const passwordChecks = computed(() =>
  PASSWORD_RULES.map((rule) => ({ ...rule, valid: rule.test(newPassword.value) })),
);

async function submit(): Promise<void> {
  if (submitting.value) {
    return;
  }
  errorMessage.value = '';
  fieldErrors.value = {};

  const parsed = resetPasswordSchema.safeParse({
    token: token.value,
    newPassword: newPassword.value,
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>;
    if (flat.token) {
      errorMessage.value = t('errors.resetTokenMissing');
    }
    fieldErrors.value = flat;
    return;
  }

  submitting.value = true;
  try {
    const result = await $fetch<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: parsed.data,
    });
    successMessage.value = result.message;
  } catch (error) {
    if (error instanceof FetchError && error.statusCode === 422 && error.data?.errorDetails) {
      fieldErrors.value = error.data.errorDetails;
    } else if (error instanceof FetchError && error.data?.message) {
      errorMessage.value = error.data.message;
    } else {
      errorMessage.value = t('errors.generic');
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
      <h1 class="page-title title-underline">{{ $t('auth.resetTitle') }}</h1>
    </div>

    <template v-if="successMessage">
      <p class="custom-valid-message" role="status">{{ successMessage }}</p>
      <div class="auth-action-row">
        <NuxtLink to="/login" class="action-button primary-action-button">{{ $t('auth.signIn') }}</NuxtLink>
      </div>
    </template>

    <form v-else class="auth-form" novalidate @submit.prevent="submit">
      <label class="form-label" for="reset-password">{{ $t('auth.newPassword') }}</label>
      <div class="auth-field">
        <input
          id="reset-password"
          v-model="newPassword"
          :type="showPassword ? 'text' : 'password'"
          class="auth-field-input"
          autocomplete="new-password"
          :placeholder="$t('auth.newPasswordPlaceholder')"
          :aria-invalid="fieldErrors.newPassword ? true : undefined"
          :aria-describedby="fieldErrors.newPassword ? 'reset-password-error' : undefined"
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
      <p
        v-if="fieldErrors.newPassword"
        id="reset-password-error"
        class="custom-error-message"
        role="alert"
      >
        {{ fieldErrors.newPassword[0] }}
      </p>

      <div class="strong-password-note">
        <p class="rules-title">{{ $t('auth.strongPawCodeHas') }}</p>
        <ul>
          <li v-for="checkItem in passwordChecks" :key="checkItem.id" :class="{ valid: checkItem.valid }">
            {{ checkItem.label }}
          </li>
        </ul>
      </div>

      <p v-if="errorMessage" class="custom-error-message" role="alert">{{ errorMessage }}</p>

      <div class="auth-action-row">
        <button type="submit" class="action-button primary-action-button" :disabled="submitting">
          {{ submitting ? $t('common.justAMoment') : $t('auth.updatePawCode') }}
        </button>
      </div>
    </form>

    <NuxtLink to="/login" class="auth-secondary-link">{{ $t('auth.backToSignIn') }}</NuxtLink>
  </div>
</template>

<style scoped>
.rules-title {
  margin: 0 0 0.25rem;
  font-size: 0.72rem;
  color: var(--color-foreground);
}
</style>
