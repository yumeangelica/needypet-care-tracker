<script setup lang="ts">
import { Eye, EyeOff, KeyRound, LogOut, UserPen } from '@lucide/vue';
import { FetchError } from 'ofetch';
import { z } from 'zod';
import {
  accountDeleteSchema,
  PASSWORD_RULES,
  passwordChangeSchema,
  profileUpdateSchema,
} from '#shared/schemas/user';
import type { PublicUser } from '#shared/types/domain';

definePageMeta({ middleware: 'auth' });

const { clear: clearSession, fetch: refreshSession } = useUserSession();

const { data: me, status, refresh } = await useFetch<PublicUser>('/api/me');

const loggingOut = ref(false);

async function logout() {
  if (loggingOut.value) {
    return;
  }
  loggingOut.value = true;
  try {
    await $fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    await clearSession();
    await navigateTo('/');
  }
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

// --- Email confirmation -------------------------------------------------------

const resendBusy = ref(false);
const resendMessage = ref('');
const resendError = ref('');

async function resendConfirmation(): Promise<void> {
  if (resendBusy.value) {
    return;
  }
  resendBusy.value = true;
  resendMessage.value = '';
  resendError.value = '';
  try {
    const result = await $fetch<{ message: string }>('/api/auth/resend-confirmation', {
      method: 'POST',
    });
    resendMessage.value = result.message;
  } catch (error) {
    resendError.value =
      error instanceof FetchError && error.data?.message
        ? error.data.message
        : 'Something went wrong. Please try again.';
  } finally {
    resendBusy.value = false;
  }
}

// --- Edit profile section ---------------------------------------------------

const editingProfile = ref(false);
const profileUserName = ref('');
const profileEmail = ref('');
const profileTimezone = ref('');
const profileDigestOptIn = ref(false);
const profilePassword = ref('');
const profileSaving = ref(false);
const profileError = ref('');
const profileSuccess = ref('');
const profileFieldErrors = ref<Record<string, string[]>>({});

const timezones = Intl.supportedValuesOf('timeZone');

function openProfileForm(): void {
  profileUserName.value = me.value?.userName ?? '';
  profileEmail.value = me.value?.email ?? '';
  profileTimezone.value = me.value?.timezone ?? '';
  profileDigestOptIn.value = me.value?.digestOptIn ?? false;
  profilePassword.value = '';
  profileFieldErrors.value = {};
  profileError.value = '';
  profileSuccess.value = '';
  editingProfile.value = true;
  changingPassword.value = false;
}

function profileFieldError(field: string): string | null {
  return profileFieldErrors.value[field]?.[0] ?? null;
}

async function saveProfile() {
  if (profileSaving.value) {
    return;
  }
  profileError.value = '';
  profileSuccess.value = '';
  profileFieldErrors.value = {};

  const input = {
    userName: profileUserName.value.trim(),
    email: profileEmail.value.trim(),
    timezone: profileTimezone.value,
    digestOptIn: profileDigestOptIn.value,
    currentPassword: profilePassword.value,
  };
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    profileFieldErrors.value = fieldErrorsFrom(parsed.error);
    return;
  }

  profileSaving.value = true;
  try {
    await $fetch('/api/me', { method: 'PUT', body: parsed.data });
    await Promise.all([refresh(), refreshSession()]);
    editingProfile.value = false;
    profileSuccess.value = 'Profile updated! 🐾';
  } catch (error) {
    if (error instanceof FetchError && error.statusCode === 422 && error.data?.errorDetails) {
      profileFieldErrors.value = error.data.errorDetails;
    } else if (error instanceof FetchError && error.statusCode === 401) {
      profileFieldErrors.value = { currentPassword: ['Invalid current password'] };
    } else if (error instanceof FetchError && error.data?.message) {
      profileError.value = error.data.message;
    } else {
      profileError.value = 'Something went wrong. Please try again.';
    }
  } finally {
    profileSaving.value = false;
  }
}

// --- Change password section -------------------------------------------------

const changingPassword = ref(false);
const currentPassword = ref('');
const newPassword = ref('');
const showPasswords = ref(false);
const passwordSaving = ref(false);
const passwordError = ref('');
const passwordSuccess = ref('');
const passwordFieldErrors = ref<Record<string, string[]>>({});

const passwordChecks = computed(() =>
  PASSWORD_RULES.map((rule) => ({ ...rule, valid: rule.test(newPassword.value) })),
);

function openPasswordForm(): void {
  currentPassword.value = '';
  newPassword.value = '';
  passwordFieldErrors.value = {};
  passwordError.value = '';
  passwordSuccess.value = '';
  changingPassword.value = true;
  editingProfile.value = false;
}

function passwordFieldError(field: string): string | null {
  return passwordFieldErrors.value[field]?.[0] ?? null;
}

async function savePassword() {
  if (passwordSaving.value) {
    return;
  }
  passwordError.value = '';
  passwordSuccess.value = '';
  passwordFieldErrors.value = {};

  const parsed = passwordChangeSchema.safeParse({
    currentPassword: currentPassword.value,
    newPassword: newPassword.value,
  });
  if (!parsed.success) {
    passwordFieldErrors.value = fieldErrorsFrom(parsed.error);
    return;
  }

  passwordSaving.value = true;
  try {
    await $fetch('/api/me/password', { method: 'PUT', body: parsed.data });
    changingPassword.value = false;
    currentPassword.value = '';
    newPassword.value = '';
    passwordSuccess.value = 'Paw code updated! 🐾';
  } catch (error) {
    if (error instanceof FetchError && error.statusCode === 422 && error.data?.errorDetails) {
      passwordFieldErrors.value = error.data.errorDetails;
    } else if (error instanceof FetchError && error.statusCode === 401) {
      passwordFieldErrors.value = { currentPassword: ['Invalid current password'] };
    } else if (error instanceof FetchError && error.data?.message) {
      passwordError.value = error.data.message;
    } else {
      passwordError.value = 'Something went wrong. Please try again.';
    }
  } finally {
    passwordSaving.value = false;
  }
}

// --- Account deletion ---------------------------------------------------------

const deleting = ref(false);
const deletePassword = ref('');
const deleteBusy = ref(false);
const deleteError = ref('');

function openDeleteModal(): void {
  deletePassword.value = '';
  deleteError.value = '';
  deleting.value = true;
}

async function confirmDelete(): Promise<void> {
  if (deleteBusy.value) {
    return;
  }
  deleteError.value = '';

  const parsed = accountDeleteSchema.safeParse({ currentPassword: deletePassword.value });
  if (!parsed.success) {
    deleteError.value = z.flattenError(parsed.error).fieldErrors.currentPassword?.[0]
      ?? 'Current password is required';
    return;
  }

  deleteBusy.value = true;
  try {
    await $fetch('/api/me', { method: 'DELETE', body: parsed.data });
    await clearSession();
    await navigateTo('/');
  } catch (error) {
    if (error instanceof FetchError && error.statusCode === 401) {
      deleteError.value = 'Invalid current password';
    } else if (error instanceof FetchError && error.data?.message) {
      deleteError.value = error.data.message;
    } else {
      deleteError.value = 'Something went wrong. Please try again.';
    }
  } finally {
    deleteBusy.value = false;
  }
}
</script>

<template>
  <div class="content-wrapper">
    <DuoCard class="account-panel" title="My Profile">
      <div v-if="status === 'pending'" class="state-note" aria-live="polite">
        <p>Just a moment...</p>
      </div>

      <template v-else-if="me">
        <dl class="profile-facts">
          <dt>Username</dt>
          <dd>{{ me.userName }}</dd>
          <dt>Email</dt>
          <dd class="email-fact">
            <span>{{ me.email }}</span>
            <span v-if="me.emailConfirmed" class="email-badge email-badge-confirmed">Confirmed</span>
            <span v-else class="email-badge email-badge-pending">Waiting for confirmation</span>
          </dd>
          <dt>Timezone</dt>
          <dd>{{ me.timezone }}</dd>
          <dt>Daily reminders</dt>
          <dd>{{ me.digestOptIn ? 'On 🐾' : 'Off' }}</dd>
        </dl>

        <div v-if="!me.emailConfirmed" class="resend-row">
          <AppButton variant="secondary" :disabled="resendBusy" @click="resendConfirmation">
            {{ resendBusy ? 'Just a moment...' : 'Resend Confirmation Email' }}
          </AppButton>
        </div>
        <p v-if="resendMessage" class="custom-valid-message" role="status" aria-live="polite">
          {{ resendMessage }}
        </p>
        <p v-if="resendError" class="custom-error-message" role="alert">{{ resendError }}</p>

        <p v-if="profileSuccess" class="custom-valid-message" role="status">{{ profileSuccess }}</p>
        <p v-if="passwordSuccess" class="custom-valid-message" role="status">{{ passwordSuccess }}</p>

        <div class="form-button-group profile-actions">
          <AppButton v-if="!editingProfile" variant="primary" @click="openProfileForm">
            <UserPen :size="18" aria-hidden="true" />
            Edit Profile
          </AppButton>
          <AppButton v-if="!changingPassword" variant="primary" @click="openPasswordForm">
            <KeyRound :size="18" aria-hidden="true" />
            Change Paw Code
          </AppButton>
          <AppButton variant="secondary" :disabled="loggingOut" @click="logout">
            <LogOut :size="18" aria-hidden="true" />
            {{ loggingOut ? 'Just a moment...' : 'Log Out' }}
          </AppButton>
        </div>

        <section v-if="editingProfile" class="profile-section" aria-labelledby="edit-profile-title">
          <h3 id="edit-profile-title" class="page-title-sm title-underline">Edit Profile</h3>
          <form class="profile-form" novalidate @submit.prevent="saveProfile">
            <FormField v-slot="{ id, describedBy, invalid }" label="Username" :error="profileFieldError('userName')">
              <input
                :id
                v-model="profileUserName"
                type="text"
                class="form-field-input"
                autocomplete="username"
                :aria-describedby="describedBy"
                :aria-invalid="invalid"
                required
              />
            </FormField>

            <FormField v-slot="{ id, describedBy, invalid }" label="Email" :error="profileFieldError('email')">
              <input
                :id
                v-model="profileEmail"
                type="email"
                class="form-field-input"
                autocomplete="email"
                :aria-describedby="describedBy"
                :aria-invalid="invalid"
                required
              />
            </FormField>

            <FormField
              v-slot="{ id, describedBy, invalid }"
              label="Timezone"
              :error="profileFieldError('timezone')"
              hint="Changing your timezone moves your pets' care day — tasks roll over on your new local midnight."
            >
              <select
                :id
                v-model="profileTimezone"
                class="form-field-input"
                :aria-describedby="describedBy"
                :aria-invalid="invalid"
              >
                <option v-for="tz in timezones" :key="tz" :value="tz">{{ tz }}</option>
              </select>
            </FormField>

            <div class="reminder-toggle">
              <input
                id="digest-opt-in"
                v-model="profileDigestOptIn"
                type="checkbox"
                class="reminder-checkbox"
              />
              <label for="digest-opt-in" class="reminder-label">
                Email me a daily nudge about unfinished care moments 🐾
              </label>
            </div>

            <FormField
              v-slot="{ id, describedBy, invalid }"
              label="Current password"
              :error="profileFieldError('currentPassword')"
            >
              <input
                :id
                v-model="profilePassword"
                type="password"
                class="form-field-input"
                autocomplete="current-password"
                placeholder="Confirm it's you"
                :aria-describedby="describedBy"
                :aria-invalid="invalid"
                required
              />
            </FormField>

            <p v-if="profileError" class="custom-error-message" role="alert">{{ profileError }}</p>

            <div class="profile-form-actions">
              <AppButton variant="secondary" type="button" :disabled="profileSaving" @click="editingProfile = false">
                Cancel
              </AppButton>
              <AppButton variant="primary" type="submit" :disabled="profileSaving">
                {{ profileSaving ? 'Just a moment...' : 'Save Changes' }}
              </AppButton>
            </div>
          </form>
        </section>

        <section v-if="changingPassword" class="profile-section" aria-labelledby="change-password-title">
          <h3 id="change-password-title" class="page-title-sm title-underline">Change Paw Code</h3>
          <form class="profile-form" novalidate @submit.prevent="savePassword">
            <FormField
              v-slot="{ id, describedBy, invalid }"
              label="Current password"
              :error="passwordFieldError('currentPassword')"
            >
              <input
                :id
                v-model="currentPassword"
                :type="showPasswords ? 'text' : 'password'"
                class="form-field-input"
                autocomplete="current-password"
                :aria-describedby="describedBy"
                :aria-invalid="invalid"
                required
              />
            </FormField>

            <FormField
              v-slot="{ id, describedBy, invalid }"
              label="New password"
              :error="passwordFieldError('newPassword')"
            >
              <input
                :id
                v-model="newPassword"
                :type="showPasswords ? 'text' : 'password'"
                class="form-field-input"
                autocomplete="new-password"
                placeholder="Create a new secret paw code"
                :aria-describedby="describedBy"
                :aria-invalid="invalid"
                required
              />
            </FormField>

            <button
              type="button"
              class="password-visibility-toggle"
              :aria-pressed="showPasswords"
              @click="showPasswords = !showPasswords"
            >
              <EyeOff v-if="showPasswords" :size="18" aria-hidden="true" />
              <Eye v-else :size="18" aria-hidden="true" />
              {{ showPasswords ? 'Hide passwords' : 'Show passwords' }}
            </button>

            <div class="strong-password-note">
              <p class="rules-title">A strong paw code has:</p>
              <ul>
                <li v-for="checkItem in passwordChecks" :key="checkItem.id" :class="{ valid: checkItem.valid }">
                  {{ checkItem.label }}
                </li>
              </ul>
            </div>

            <p v-if="passwordError" class="custom-error-message" role="alert">{{ passwordError }}</p>

            <div class="profile-form-actions">
              <AppButton variant="secondary" type="button" :disabled="passwordSaving" @click="changingPassword = false">
                Cancel
              </AppButton>
              <AppButton variant="primary" type="submit" :disabled="passwordSaving">
                {{ passwordSaving ? 'Just a moment...' : 'Update Paw Code' }}
              </AppButton>
            </div>
          </form>
        </section>

        <section class="danger-zone" aria-labelledby="delete-account-title">
          <h3 id="delete-account-title" class="danger-zone-title">Leaving the pack?</h3>
          <p class="danger-zone-note">
            Deleting your account also removes your pets, their care tasks and their history.
            Care you logged for other people's pets stays in their diaries without your name.
          </p>
          <AppButton variant="danger" @click="openDeleteModal">Delete My Account</AppButton>
        </section>

        <AppModal :open="deleting" title="Delete your account?" @close="deleting = false">
          <p class="remove-note">
            This removes your account, your pets and their whole care history. There is no undo.
            Confirm with your current password.
          </p>
          <form novalidate @submit.prevent="confirmDelete">
            <FormField v-slot="{ id, describedBy, invalid }" label="Current password" :error="deleteError || null">
              <input
                :id
                v-model="deletePassword"
                type="password"
                class="form-field-input"
                autocomplete="current-password"
                placeholder="Confirm it's you"
                :aria-describedby="describedBy"
                :aria-invalid="invalid"
                required
              />
            </FormField>
            <div class="remove-actions">
              <AppButton variant="secondary" type="button" :disabled="deleteBusy" @click="deleting = false">
                Stay in the pack
              </AppButton>
              <AppButton variant="danger" type="submit" :disabled="deleteBusy">
                {{ deleteBusy ? 'Just a moment...' : 'Delete for good' }}
              </AppButton>
            </div>
          </form>
        </AppModal>
      </template>
    </DuoCard>
  </div>
</template>

<style scoped>
.profile-facts {
  margin: 0 0 var(--space-stack);
}

.profile-facts dt {
  color: var(--color-primary-foreground);
  font-size: 0.8rem;
  font-weight: 650;
}

.profile-facts dd {
  margin: 0 0 0.6rem;
  overflow-wrap: anywhere;
  font-size: 0.9rem;
}

.email-fact {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 0.5rem;
}

.email-badge {
  padding: 1px 10px;
  border-radius: var(--radius-pill);
  font-size: 0.7rem;
  font-weight: 650;
  white-space: nowrap;
}

.email-badge-confirmed {
  background: var(--color-well);
  color: var(--color-success);
}

.email-badge-pending {
  background: var(--color-surface-control);
  color: var(--color-primary-foreground-strong);
}

.resend-row {
  margin-bottom: 0.5rem;
}

.profile-actions {
  flex-wrap: wrap;
}

.profile-section {
  margin-top: var(--space-card);
  padding-top: var(--space-stack);
  border-top: 1px solid var(--color-border-divider);
}

.profile-form {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.profile-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.password-visibility-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  align-self: flex-start;
  min-height: 36px;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--color-card-edge);
  border-radius: var(--radius-pill);
  background: var(--color-card-bg);
  color: var(--color-primary-foreground-strong);
  font-family: var(--font-sans);
  font-size: 0.78rem;
  transition: var(--transition-interactive);
}

.password-visibility-toggle:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

.rules-title {
  margin: 0 0 0.25rem;
  font-size: 0.72rem;
  color: var(--color-foreground);
}

.reminder-toggle {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: var(--tap-target-size);
  padding: 0.35rem 0;
}

.reminder-checkbox {
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  accent-color: var(--color-primary-foreground);
  cursor: pointer;
}

.reminder-checkbox:focus-visible {
  outline: 2px solid var(--color-primary-foreground);
  outline-offset: 2px;
}

.reminder-label {
  font-size: 0.85rem;
  line-height: 1.35;
  cursor: pointer;
}

.state-note {
  padding: var(--space-card);
  text-align: center;
}

.danger-zone {
  margin-top: var(--space-card);
  padding: var(--space-stack);
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
}

.danger-zone-title {
  margin: 0 0 0.3rem;
  font-size: 0.95rem;
  color: var(--color-destructive);
}

.danger-zone-note {
  margin: 0 0 0.6rem;
  font-size: 0.85rem;
}

.remove-note {
  margin: 0 0 var(--space-stack);
  overflow-wrap: anywhere;
  font-size: 0.9rem;
}

.remove-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
</style>
