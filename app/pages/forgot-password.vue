<script setup lang="ts">
import { PawPrint } from '@lucide/vue';
import { FetchError } from 'ofetch';
import { z } from 'zod';
import { forgotPasswordSchema } from '#shared/schemas/user';

definePageMeta({ layout: 'auth' });

const email = ref('');
const submitting = ref(false);
const successMessage = ref('');
const errorMessage = ref('');
const fieldErrors = ref<Record<string, string[]>>({});

async function submit(): Promise<void> {
  if (submitting.value) {
    return;
  }
  errorMessage.value = '';
  fieldErrors.value = {};

  const parsed = forgotPasswordSchema.safeParse({ email: email.value.trim() });
  if (!parsed.success) {
    fieldErrors.value = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>;
    return;
  }

  submitting.value = true;
  try {
    const result = await $fetch<{ message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: parsed.data,
    });
    successMessage.value = result.message;
  } catch (error) {
    if (error instanceof FetchError && error.statusCode === 422 && error.data?.errorDetails) {
      fieldErrors.value = error.data.errorDetails;
    } else {
      errorMessage.value = 'Something went wrong. Please try again.';
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
      <h1 class="page-title title-underline">Forgot Your Paw Code?</h1>
    </div>
    <p class="auth-subtitle">We'll email you a link to set a new one 🐾</p>

    <p v-if="successMessage" class="custom-valid-message" role="status">{{ successMessage }}</p>

    <form v-else class="auth-form" novalidate @submit.prevent="submit">
      <label class="form-label" for="forgot-email">Email</label>
      <div class="auth-field">
        <input
          id="forgot-email"
          v-model="email"
          type="email"
          class="auth-field-input"
          autocomplete="email"
          placeholder="you@example.com"
          :aria-invalid="fieldErrors.email ? true : undefined"
          :aria-describedby="fieldErrors.email ? 'forgot-email-error' : undefined"
          required
        />
      </div>
      <p v-if="fieldErrors.email" id="forgot-email-error" class="custom-error-message" role="alert">
        {{ fieldErrors.email[0] }}
      </p>
      <p v-if="errorMessage" class="custom-error-message" role="alert">{{ errorMessage }}</p>
      <div class="auth-action-row">
        <button type="submit" class="action-button primary-action-button" :disabled="submitting">
          {{ submitting ? 'Just a moment...' : 'Send Reset Link' }}
        </button>
      </div>
    </form>

    <NuxtLink to="/login" class="auth-secondary-link">Back to sign in</NuxtLink>
  </div>
</template>
