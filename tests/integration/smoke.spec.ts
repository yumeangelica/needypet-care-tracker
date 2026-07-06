import { describe, expect, it } from 'vitest';
import { api } from './helpers';

/** Proves the harness wiring: server up, API reachable, auth guard active. */
describe('integration harness', () => {
  it('serves the api and rejects anonymous requests', async () => {
    const res = await api('/api/me');
    expect(res.status).toBe(401);
  });
});
