import * as pg from './schema.pg';
import * as sqlite from './schema.sqlite';

/**
 * Runtime dialect switch. All application code keeps importing tables from
 * './schema'; which physical table objects it gets depends on NUXT_DB_URL
 * (set -> Postgres, unset -> local SQLite).
 *
 * The `as typeof sqlite.*` casts are deliberate, confined unsoundness: the
 * sqlite table types remain the canonical typing everywhere (see Db in
 * ./index.ts), while at runtime each branch always pairs its own schema with
 * its own driver, so the generated SQL is correct on both dialects. Keep
 * schema.sqlite.ts and schema.pg.ts in lockstep.
 */

const active = process.env.NUXT_DB_URL ? pg : sqlite;

export const users = active.users as unknown as typeof sqlite.users;
export const pets = active.pets as unknown as typeof sqlite.pets;
export const petCaretakers = active.petCaretakers as unknown as typeof sqlite.petCaretakers;
export const needs = active.needs as unknown as typeof sqlite.needs;
export const careRecords = active.careRecords as unknown as typeof sqlite.careRecords;
