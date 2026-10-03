import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DbTimeoutError, DB_TIMEOUT_MS, withDbTimeout } from '../db.ts';

describe('database timeouts', () => {
  it('passes a fast query through untouched', async () => {
    assert.equal(await withDbTimeout('query', Promise.resolve(42), 50), 42);
  });

  it('rejects a hung round trip instead of hanging the request', async () => {
    const hung = new Promise<never>(() => {
      /* never settles, like a stalled socket */
    });
    await assert.rejects(() => withDbTimeout('query', hung, 50), DbTimeoutError);
  });

  it('names the operation that timed out', async () => {
    const hung = new Promise<never>(() => {});
    const err = await withDbTimeout('query', hung, 50).catch((e: unknown) => e);
    assert.ok(err instanceof DbTimeoutError);
    assert.match(err.message, /query/);
  });

  it('keeps a production-sane default budget', () => {
    assert.ok(DB_TIMEOUT_MS >= 5000 && DB_TIMEOUT_MS <= 60000);
  });
});