import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatClaimValue } from '../format.ts';

describe('claim value formatting', () => {
  it('groups a long integer', () => {
    assert.equal(formatClaimValue('138772'), '138,772');
    assert.equal(formatClaimValue('2751862'), '2,751,862');
  });

  it('leaves short numbers alone', () => {
    assert.equal(formatClaimValue('500'), '500');
  });

  it('handles a negative integer', () => {
    assert.equal(formatClaimValue('-4200'), '-4,200');
  });

  it('never touches a value that carries units or words', () => {
    for (const value of [
      'year 1889',
      '2.5 km',
      'Q34600-P1082-1',
      '1,234',
      '12 500',
      '3.14159',
      '',
      'unspecified',
    ]) {
      assert.equal(formatClaimValue(value), value, `"${value}" must be preserved`);
    }
  });
});