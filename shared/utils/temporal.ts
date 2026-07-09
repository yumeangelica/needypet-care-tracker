/**
 * Single source of the TC39 Temporal API for the whole app.
 *
 * Bun 1.3 has no native `Temporal` yet, so date/time computation runs on the
 * `temporal-polyfill` bridge. Every consumer imports `Temporal` from here (never
 * from `temporal-polyfill` directly), so when Bun and the browser floor ship
 * native Temporal, dropping the polyfill is a one-line change: delete the import
 * below and `export const Temporal = globalThis.Temporal;` instead.
 */
export { Temporal } from 'temporal-polyfill';
