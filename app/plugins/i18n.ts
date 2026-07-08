import type { Locale } from '#shared/types/domain';
import { createAppI18n } from '~/i18n';

/**
 * Installs vue-i18n with the signed-in user's UI language. The locale is read
 * straight from the session (cached on the payload by the auth endpoints), so
 * the server and the client resolve the SAME locale on first render — no DB
 * round-trip and no hydration-time flash of the wrong language. Signed-out
 * visitors (landing / login / register) always get English.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const { user } = useUserSession();
  const locale: Locale = user.value?.locale === 'fi' ? 'fi' : 'en';

  const i18n = createAppI18n(locale);
  nuxtApp.vueApp.use(i18n);

  return {
    provide: {
      // Expose the i18n instance so non-setup code (e.g. app.vue head, the
      // profile save flow) can flip the active locale imperatively.
      i18n: i18n.global,
    },
  };
});
