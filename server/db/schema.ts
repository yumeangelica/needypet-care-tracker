/**
 * Single SQLite schema. Dev runs on bun:sqlite; production runs on libSQL/Turso —
 * the same SQLite dialect, so one set of table definitions and one migration set
 * apply everywhere (no dialect drift). All application code imports tables from
 * './schema'.
 */
export { users, rateLimits, pets, petCaretakers, needs, careRecords } from './schema.sqlite';
