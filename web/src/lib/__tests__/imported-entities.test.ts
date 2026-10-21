import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { listImportedEntities, saveImportedEntity } from '../repository.ts';
import type { UpstreamEntity } from '../upstream.ts';

const SCOPE_A = 'a'.repeat(32);
const SCOPE_B = 'b'.repeat(32);

function entity(entityId: string, label: string): UpstreamEntity {
  return {
    entityId,
    label,
    description: null,
    wikipedia: null,
    openstreetmap: null,
    disputes: [],
    fetchedAt: '2026-01-01T00:00:00.000Z',
    source: 'wikidata',
  };
}

describe('imported entities', () => {
  it('keeps two sessions\' imports of the same entity separate', async () => {
    await saveImportedEntity(SCOPE_A, entity('Q42', 'First'));
    await saveImportedEntity(SCOPE_B, entity('Q42', 'Second'));

    const forA = await listImportedEntities(SCOPE_A);
    const forB = await listImportedEntities(SCOPE_B);

    assert.equal(forA.length, 1, 'session A should still see its own import');
    assert.equal(forB.length, 1, 'session B should see its own import');
    assert.equal(forA[0]?.label, 'First');
    assert.equal(forB[0]?.label, 'Second');
  });

  it('re-importing the same entity in one session refreshes it in place', async () => {
    await saveImportedEntity(SCOPE_A, entity('Q99', 'Before'));
    await saveImportedEntity(SCOPE_A, entity('Q99', 'After'));

    const rows = await listImportedEntities(SCOPE_A);
    const forQ99 = rows.filter((r) => r.entityId === 'Q99');

    assert.equal(forQ99.length, 1, 'a re-import must not create a second row');
    assert.equal(forQ99[0]?.label, 'After');
  });

  it('does not leak one session\'s import into another', async () => {
    await saveImportedEntity(SCOPE_A, entity('Q7', 'Private'));
    const forB = await listImportedEntities(SCOPE_B);
    assert.equal(forB.filter((r) => r.entityId === 'Q7').length, 0);
  });
});
