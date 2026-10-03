import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { adjudicate, ENGINE_VERSION, factorWeightTotal, VERDICT_BANDS } from '../engine.ts';
import type { Claim, PropertyDispute } from '../types.ts';

const NOW = '2026-10-03T00:00:00.000Z';

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

function dispute(claims: Claim[]): PropertyDispute {
  return {
    propertyId: 'P1082',
    propertyKey: 'population',
    propertyLabel: 'Population',
    claims,
  };
}

const BASE = { entityId: 'Q1', entityLabel: 'Testville', now: NOW };

describe('precedence engine', () => {
  it('publishes weights that sum to one', () => {
    assert.equal(factorWeightTotal(), 1);
  });

  it('is versioned', () => {
    const result = adjudicate({ ...BASE, dispute: dispute([claim({ claimId: 'a' })]) });
    assert.equal(result.engineVersion, ENGINE_VERSION);
  });

  it('returns an empty result rather than throwing on no claims', () => {
    const result = adjudicate({ ...BASE, dispute: dispute([]) });
    assert.equal(result.status, 'empty');
    assert.equal(result.leader, null);
    assert.equal(result.verdict, 'unresolved');
    assert.match(result.recommendation, /nothing to adjudicate/i);
  });

  it('marks a single claim degenerate instead of inventing a rival', () => {
    const result = adjudicate({ ...BASE, dispute: dispute([claim({ claimId: 'a' })]) });
    assert.equal(result.status, 'degenerate');
    assert.equal(result.runnerUp, null);
    assert.equal(result.verdict, 'settled');
  });

  it('prefers a referenced preferred claim over an unreferenced normal claim', () => {
    const result = adjudicate({
      ...BASE,
      dispute: dispute([
        claim({ claimId: 'weak', rank: 'normal', referenceCount: 0, numeric: 100 }),
        claim({ claimId: 'strong', rank: 'preferred', referenceCount: 4, numeric: 999 }),
      ]),
    });
    assert.equal(result.leader?.claimId, 'strong');
    assert.equal(result.runnerUp?.claimId, 'weak');
  });

  it('demotes a deprecated claim below every normal claim', () => {
    const result = adjudicate({
      ...BASE,
      dispute: dispute([
        claim({ claimId: 'old', rank: 'deprecated', referenceCount: 9 }),
        claim({ claimId: 'current', rank: 'normal', referenceCount: 0 }),
      ]),
    });
    assert.equal(result.leader?.claimId, 'current');
  });

  it('bars a deprecated claim from governing even when it scores highest', () => {
    const result = adjudicate({
      ...BASE,
      dispute: dispute([
        claim({ claimId: 'old', rank: 'deprecated', referenceCount: 9 }),
        claim({ claimId: 'current', rank: 'normal', referenceCount: 0 }),
      ]),
    });
    const excluded = result.ranked.find((r) => r.claimId === 'old');
    assert.equal(excluded?.eligible, false);
    assert.match(excluded?.ineligibleReason ?? '', /deprecated/i);
    assert.match(result.recommendation, /barred from governing/i);
    assert.ok(result.ranked.indexOf(result.leader!) < result.ranked.indexOf(excluded!));
  });

  it('still lets a deprecated claim lead when nothing else exists', () => {
    const result = adjudicate({
      ...BASE,
      dispute: dispute([claim({ claimId: 'only', rank: 'deprecated', referenceCount: 0 })]),
    });
    assert.equal(result.leader?.claimId, 'only');
    assert.equal(result.leader?.eligible, true);
  });

  it('rewards corroboration from the second source', () => {
    const text = 'The city had a population of 2,751,862 in 2020.';
    const withHit = adjudicate({
      ...BASE,
      corroboratingText: text,
      dispute: dispute([claim({ claimId: 'hit', numeric: 2751862, rank: 'normal' })]),
    });
    const factor = withHit.leader?.factors.find((f) => f.key === 'corroboration');
    assert.equal(factor?.value, 1);

    const withMiss = adjudicate({
      ...BASE,
      corroboratingText: text,
      dispute: dispute([claim({ claimId: 'miss', numeric: 123456, rank: 'normal' })]),
    });
    const missFactor = withMiss.leader?.factors.find((f) => f.key === 'corroboration');
    assert.equal(missFactor?.value, 0);
  });

  it('scores a claim with no number as neutral on corroboration', () => {
    const result = adjudicate({
      ...BASE,
      corroboratingText: 'population 2,751,862',
      dispute: dispute([claim({ claimId: 'n', numeric: null, rank: 'normal' })]),
    });
    const factor = result.leader?.factors.find((f) => f.key === 'corroboration');
    assert.equal(factor?.value, 0.5);
  });

  it('treats an absent retrieval date as a recency floor, not a zero', () => {
    const result = adjudicate({
      ...BASE,
      dispute: dispute([claim({ claimId: 'x', rank: 'normal', retrieved: null })]),
    });
    const factor = result.leader?.factors.find((f) => f.key === 'recency');
    assert.equal(factor?.value, 0.4);
  });

  it('breaks exact ties on claimId so runs are reproducible', () => {
    const result = adjudicate({
      ...BASE,
      dispute: dispute([
        claim({ claimId: 'zzz', rank: 'normal', referenceCount: 1, numeric: 10 }),
        claim({ claimId: 'aaa', rank: 'normal', referenceCount: 1, numeric: 10 }),
      ]),
    });
    assert.equal(result.leader?.claimId, 'aaa');
    assert.equal(result.margin, 0);
    assert.equal(result.verdict, 'unresolved');
  });

  it('is byte-for-byte deterministic across runs', () => {
    const d = dispute([
      claim({ claimId: 'b', numeric: 10, rank: 'preferred', referenceCount: 3 }),
      claim({ claimId: 'a', numeric: 20, rank: 'normal', referenceCount: 1 }),
    ]);
    const first = JSON.stringify(adjudicate({ ...BASE, dispute: d }));
    const second = JSON.stringify(adjudicate({ ...BASE, dispute: d }));
    assert.equal(first, second);
  });

  it('maps margin onto the published verdict bands', () => {
    const bandFor = (margin: number) =>
      VERDICT_BANDS.find((b) => margin >= b.minMargin)!.verdict;
    assert.equal(bandFor(18), 'settled');
    assert.equal(bandFor(17.99), 'contested');
    assert.equal(bandFor(8), 'contested');
    assert.equal(bandFor(7.99), 'unresolved');
    assert.equal(bandFor(0), 'unresolved');
  });

  it('returns itemised factors whose contributions reconstruct the score', () => {
    const result = adjudicate({
      ...BASE,
      dispute: dispute([
        claim({ claimId: 'a', numeric: 5, rank: 'preferred', referenceCount: 2 }),
        claim({ claimId: 'b', numeric: 6, rank: 'normal', referenceCount: 1 }),
      ]),
    });
    const total = result.leader!.factors.reduce((s, f) => s + f.contribution, 0);
    assert.ok(Math.abs(total - result.leader!.score) < 0.05, `${total} vs ${result.leader!.score}`);
    assert.equal(result.leader!.factors.length, 5);
  });

  it('handles a malformed precision string without crashing', () => {
    const result = adjudicate({
      ...BASE,
      dispute: dispute([claim({ claimId: 'a', rank: 'normal', precision: 'nonsense' })]),
    });
    const factor = result.leader?.factors.find((f) => f.key === 'specificity');
    assert.equal(factor?.value, 0.5);
  });

  it('handles an unparseable retrieval date as the recency floor', () => {
    const result = adjudicate({
      ...BASE,
      dispute: dispute([claim({ claimId: 'a', rank: 'normal', retrieved: 'not-a-date' })]),
    });
    const factor = result.leader?.factors.find((f) => f.key === 'recency');
    assert.equal(factor?.value, 0.4);
  });
});