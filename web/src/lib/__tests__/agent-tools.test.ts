import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AGENT_TOOLS, AGENT_TOOL_COUNT, AGENT_TOOL_NAMES, MUTATING_TOOL_NAMES } from '../agent-tools.ts';
import { adjudicate } from '../engine.ts';
import type { Claim, PropertyDispute } from '../types.ts';

const NOW = '2026-10-03T00:00:00.000Z';

describe('agent tool manifest', () => {
  it('has no duplicate names', () => {
    assert.equal(new Set(AGENT_TOOL_NAMES).size, AGENT_TOOL_NAMES.length);
  });

  it('counts what it lists', () => {
    assert.equal(AGENT_TOOL_COUNT, AGENT_TOOLS.length);
    assert.equal(AGENT_TOOL_COUNT, 9);
  });

  it('exposes at least one read, one analysis and one write tool', () => {
    assert.ok(AGENT_TOOLS.some((t) => t.kind === 'read'));
    assert.ok(AGENT_TOOLS.some((t) => t.kind === 'analysis'));
    assert.ok(AGENT_TOOLS.some((t) => t.kind === 'write'));
  });

  it('describes every tool so an agent can choose between them', () => {
    for (const tool of AGENT_TOOLS) {
      assert.ok(tool.description.length > 20, `${tool.name} needs a real description`);
      assert.match(tool.name, /^[a-z][a-z0-9_]*$/);
    }
  });

  it('lists the mutating tools the interface advertises', () => {
    assert.deepEqual([...MUTATING_TOOL_NAMES].sort(), [
      'record_ruling',
      'retire_ruling',
      'revise_ruling',
    ]);
  });
});

describe('corroboration only compares figures of a comparable size', () => {
  function claim(over: Partial<Claim> & { claimId: string }): Claim {
    return {
      value: '1',
      numeric: 1,
      rank: 'normal',
      referenceCount: 1,
      referenceUrls: [],
      retrieved: '2026-01-01',
      precision: 'quantity',
      ...over,
    };
  }
  const dispute = (claims: Claim[]): PropertyDispute => ({
    propertyId: 'P1082',
    propertyKey: 'population',
    propertyLabel: 'Population',
    claims,
  });

  const factorFor = (text: string, numeric: number) => {
    const result = adjudicate({
      entityId: 'Q1',
      entityLabel: 'Testville',
      dispute: dispute([claim({ claimId: 'a', numeric, rank: 'preferred' })]),
      corroboratingText: text,
      now: NOW,
    });
    return result.leader?.factors.find((f) => f.key === 'corroboration');
  };

  it('matches a figure of the same magnitude', () => {
    assert.equal(factorFor('The city has 138772 residents.', 138772)?.value, 1);
  });

  it('tolerates ordinary rounding but not a different figure', () => {
    // 138,772 rounded to the nearest hundred is within the 0.5% tolerance.
    assert.equal(factorFor('The city has 138,800 residents.', 138772)?.value, 1);
    // 140,000 is 0.88% away: a different figure, not a rounding of this one.
    assert.equal(factorFor('The city has 140,000 residents.', 138772)?.value, 0);
  });

  it('ignores stray small numbers instead of scoring them as competitors', () => {
    // "64" and "8" are not rival population figures for 138,772.
    const factor = factorFor('Area 64 km2, founded 8 AD, population 140,000.', 138772);
    assert.equal(factor?.value, 0);
    assert.match(factor?.evidence ?? '', /140,000/);
    assert.doesNotMatch(factor?.evidence ?? '', /\b64\b/);
  });

  it('stays neutral when the source quotes nothing comparable', () => {
    assert.equal(factorFor('The city was founded in 1189.', 138772)?.value, 0.5);
  });

  it('still corroborates small values such as years', () => {
    assert.equal(factorFor('Founded in 1889 by decree.', 1889)?.value, 1);
  });
});