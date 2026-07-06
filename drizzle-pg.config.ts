import { defineConfig } from 'drizzle-kit';

/**
 * Postgres migration config (production/Supabase). Generate with
 * `bun run db:generate:pg`; apply at deploy time with
 * `NUXT_DB_URL=... bun run db:migrate:pg` — never at server runtime.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.pg.ts',
  out: './server/db/migrations/pg',
  dbCredentials: {
    url: process.env.NUXT_DB_URL ?? '',
  },
});
