import tailwindcss from '@tailwindcss/vite';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  app: {
    head: {
      title: 'NeedyPet',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: "All your pet's needs, one place" },
        { name: 'theme-color', content: '#eedbfa' },
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'apple-touch-icon', href: '/needypet-paw-favicon.png' },
      ],
      htmlAttrs: { lang: 'en' },
    },
  },
  runtimeConfig: {
    dbFile: '.data/needypet.sqlite',
    // Overridden via NUXT_MAILER_PROVIDER / NUXT_MAILER_API_KEY / NUXT_MAILER_FROM.
    // With provider unset (dev default) mail is printed to the server console.
    mailer: {
      provider: '',
      apiKey: '',
      from: '',
      apiUrl: 'https://api.resend.com/emails',
    },
    // Pet photo uploads; local disk in dev, a cloud provider adapter later.
    uploads: {
      provider: 'local',
      dir: '.data/uploads',
      maxBytes: 5 * 1024 * 1024,
    },
    session: {
      maxAge: 60 * 60 * 10, // 10h, matches the old JWT lifetime
      cookie: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      },
    },
  },
});
