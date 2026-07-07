import tailwindcss from '@tailwindcss/vite';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['nuxt-auth-utils', '@vite-pwa/nuxt'],
  css: ['~/assets/css/main.css'],
  // Prerender the offline page to a static HTML file so the service worker can
  // precache it and serve it as the navigation fallback when the network is down
  // (an SSR-only route has no cached document to fall back to).
  nitro: {
    prerender: {
      routes: ['/offline'],
    },
  },
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
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      htmlAttrs: { lang: 'en' },
    },
  },
  // Installable PWA: @vite-pwa/nuxt injects the web manifest link and generates a
  // Workbox service worker at build time. The SW is disabled in dev (devOptions)
  // so it never interferes with HMR — verify it against a production build.
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'NeedyPet',
      short_name: 'NeedyPet',
      description: "All your pet's needs, one place",
      lang: 'en',
      theme_color: '#eedbfa',
      background_color: '#eedbfa',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      icons: [
        { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // Precache the app shell + built assets and fall back to the offline page
      // for navigations that miss the cache. API responses are never cached —
      // care data, sessions and permissions must always be fetched fresh.
      navigateFallback: '/offline',
      navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
    },
    devOptions: {
      enabled: false,
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
    // Pet photo uploads. NUXT_UPLOADS_PROVIDER=supabase switches to Supabase
    // Storage (a public bucket); the three NUXT_UPLOADS_SUPABASE_* vars must
    // all be set or the first upload throws. Local disk otherwise (dev).
    uploads: {
      provider: 'local',
      dir: '.data/uploads',
      maxBytes: 5 * 1024 * 1024,
      supabaseUrl: '',
      supabaseServiceKey: '',
      supabaseBucket: '',
    },
    // Daily digest of unfinished care tasks. NUXT_DIGEST_SECRET guards the cron
    // endpoint (empty = disabled, always 401); NUXT_DIGEST_HOUR is the local
    // hour (0-23) each user must reach before that day's digest is sent.
    digest: {
      secret: '',
      hour: 18,
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
