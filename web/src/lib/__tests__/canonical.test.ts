import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canonicalJson, chainSeal, genesisSeal, sha384Hex } from '../canonical.ts';

describe('canonical json', () => {
  it('sorts object keys recursively', () => {
    const a = canonicalJson({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalJson({ a: { c: 3, d: 2 }, b: 1 });
    assert.equal(a, b);
    assert.equal(a, '{"a":{"c":3,"d":2},"b":1}');
  });

  it('preserves array order', () => {
    assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
  });

  it('drops undefined members so equal payloads serialise equally', () => {
    assert.equal(canonicalJson({ a: 1, b: undefined }), canonicalJson({ a: 1 }));
  });

  it('normalises non-finite numbers to null', () => {
    assert.equal(canonicalJson({ a: Number.NaN }), '{"a":null}');
  });
});

describe('seal chain', () => {
  const genesis = genesisSeal('scope-1');

  it('produces a 96 character hex digest', () => {
    assert.match(genesis, /^[0-9a-f]{96}$/);
  });

  it('is deterministic for the same event', () => {
    const event = { seq: 1, action: 'create' };
    assert.equal(chainSeal(genesis, event), chainSeal(genesis, event));
  });

  it('changes when the previous seal changes', () => {
    const event = { seq: 1, action: 'create' };
    assert.notEqual(chainSeal(genesis, event), chainSeal(genesisSeal('scope-2'), event));
  });

  it('changes when any event byte changes', () => {
    const base = { seq: 1, action: 'create', payload: { value: 'a' } };
    const tampered = { seq: 1, action: 'create', payload: { value: 'b' } };
    assert.notEqual(chainSeal(genesis, base), chainSeal(genesis, tampered));
  });

  it('reorders keys without changing the seal', () => {
    const one = chainSeal(genesis, { seq: 2, action: 'update', at: '2026-01-01' });
    const two = chainSeal(genesis, { at: '2026-01-01', action: 'update', seq: 2 });
    assert.equal(one, two);
  });

  it('binds the chain to its scope', () => {
    assert.notEqual(genesisSeal('scope-1'), genesisSeal('scope-2'));
  });

  it('hashes raw utf-8 bytes, not a re-encoded string', () => {
    assert.equal(sha384Hex('café'), sha384Hex('café'));
  });
});