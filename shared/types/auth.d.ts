declare module '#auth-utils' {
  interface User {
    id: string;
    userName: string;
    // Cached on the session so the SSR i18n plugin can pick the UI language
    // without a per-request DB read (avoids a hydration-time locale flip).
    locale: 'en' | 'fi';
  }
}

export {};
