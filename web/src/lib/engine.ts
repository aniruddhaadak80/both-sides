import type {
  Claim,
  EngineResult,
  Factor,
  PropertyDispute,
  RankedClaim,
  Verdict,
} from './types';

export const ENGINE_VERSION = 'precedence-engine@1.0.0';

export const FACTOR_WEIGHTS = {
  editorialRank: 0.28,
  evidenceDepth: 0.22,
  corroboration: 0.2,
  recency: 0.16,
  specificity: 0.14,
} as const;

export const VERDICT_BANDS: ReadonlyArray<{
  verdict: Verdict;
  minMargin: number;
  meaning: string;
  action: string;
}> = [
  {
    verdict: 'settled',
    minMargin: 18,
    meaning: 'One claim leads by a decisive margin.',
    action: 'Safe to rely on the leading claim and cite its references.',
  },
  {
    verdict: 'contested',
    minMargin: 8,
    meaning: 'A claim leads, but a rival is close enough to matter.',
    action: 'Record a ruling with a rationale, and note the losing claim.',
  },
  {
    verdict: 'unresolved',
    minMargin: 0,
    meaning: 'No claim separates from the others.',
    action: 'Do not rely on any single value. Report both and escalate.',
  },
];

const RANK_VALUE: Record<Claim['rank'], number> = {
  preferred: 1,
  normal: 0.55,
  deprecated: 0.1,
};

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const MS_PER_YEAR = YEAR_MS;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function factor(
  key: keyof typeof FACTOR_WEIGHTS,
  label: string,
  value: number,
  evidence: string,
): Factor {
  const bounded = clamp(value, 0, 1);
  const weight = FACTOR_WEIGHTS[key];
  return {
    key,
    label,
    weight,
    value: round2(bounded),
    contribution: round2(bounded * weight * 100),
    evidence,
  };
}

function scoreEditorialRank(claim: Claim): Factor {
  const value = RANK_VALUE[claim.rank] ?? RANK_VALUE.normal;
  const evidence =
    claim.rank === 'preferred'
      ? 'Marked preferred by the upstream editor.'
      : claim.rank === 'deprecated'
        ? 'Marked deprecated upstream; retained only to show the dispute.'
        : 'Ordinary rank: no upstream preference signal.';
  return factor('editorialRank', 'Editorial rank', value, evidence);
}

function scoreEvidenceDepth(claim: Claim): Factor {
  const n = Math.max(0, claim.referenceCount);
  const value = n === 0 ? 0.15 : Math.min(1, n / 3);
  const evidence =
    n === 0
      ? 'No upstream reference is attached to this claim.'
      : `${n} independent reference${n === 1 ? '' : 's'} attached.`;
  return factor('evidenceDepth', 'Evidence depth', value, evidence);
}

function scoreRecency(claim: Claim, now: number): Factor {
  if (!claim.retrieved) {
    return factor('recency', 'Recency', 0.4, 'No retrieval date on the reference.');
  }
  const then = Date.parse(claim.retrieved);
  if (!Number.isFinite(then)) {
    return factor('recency', 'Recency', 0.4, 'Retrieval date could not be parsed.');
  }
  const ageYears = Math.max(0, (now - then) / MS_PER_YEAR);
  const value = clamp(1 - ageYears / 12, 0.05, 1);
  return factor(
    'recency',
    'Recency',
    value,
    `Reference retrieved ${claim.retrieved} (${ageYears < 1 ? 'under a year' : `${ageYears.toFixed(1)} years`} old).`,
  );
}

function scoreSpecificity(claim: Claim): Factor {
  const p = claim.precision;
  if (!p) return factor('specificity', 'Specificity', 0.5, 'No precision recorded.');
  if (p === 'quantity') {
    return factor('specificity', 'Specificity', 1, 'Exact measured quantity.');
  }
  if (p.startsWith('coordinate')) {
    return factor('specificity', 'Specificity', 1, 'Precise coordinate, not a bounding box.');
  }
  const m = /year precision (\d+)/.exec(p);
  if (m) {
    const precision = Number(m[1]);
    const table: Record<number, number> = { 11: 1, 10: 0.9, 9: 0.75, 8: 0.6, 7: 0.35, 6: 0.15 };
    const value = table[precision] ?? 0.5;
    return factor(
      'specificity',
      'Specificity',
      value,
      `Dated only to ${precision >= 11 ? 'the day' : precision >= 10 ? 'the month' : precision >= 9 ? 'the decade' : precision >= 8 ? 'the year' : precision >= 7 ? 'the decade band' : 'the century'}.`,
    );
  }
  return factor('specificity', 'Specificity', 0.5, 'Precision not recognised; scored neutral.');
}

function numericTokens(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d[\d\s, .]{0,20}\d|\d/g)) {
    const cleaned = m[0].replace(/[\s, ]/g, '');
    const n = Number(cleaned);
    if (Number.isFinite(n) && Math.abs(n) >= 1) out.push(n);
  }
  return out;
}

function scoreCorroboration(claim: Claim, corroboratingText: string): Factor {
  const text = corroboratingText.trim();
  const claimed = claim.numeric;
  if (!text) {
    return factor('corroboration', 'Corroboration', 0.5, 'No second source available to check.');
  }
  if (claimed === null) {
    return factor(
      'corroboration',
      'Corroboration',
      0.5,
      'Claim carries no number, so it cannot be matched against the second source.',
    );
  }
  const tokens = numericTokens(text);
  if (tokens.length === 0) {
    return factor(
      'corroboration',
      'Corroboration',
      0.5,
      'Second source quotes no figure for this property.',
    );
  }
  const tolerance = Math.max(1, Math.abs(claimed) * 0.005);
  const hit = tokens.find((t) => Math.abs(t - claimed) <= tolerance);
  if (hit !== undefined) {
    return factor(
      'corroboration',
      'Corroboration',
      1,
      `Second source states ${hit.toLocaleString('en-US')}, matching this claim.`,
    );
  }
  return factor(
    'corroboration',
    'Corroboration',
    0,
    `Second source quotes ${tokens
      .slice(0, 3)
      .map((t) => t.toLocaleString('en-US'))
      .join(', ')}, none matching this claim.`,
  );
}

function corroboratingText(dispute: PropertyDispute, context?: string): string {
  return [context ?? '', dispute.propertyLabel].join(' ');
}

export interface AdjudicateInput {
  entityId: string;
  entityLabel: string;
  dispute: PropertyDispute;
  corroboratingText?: string;
  now?: string;
}

/**
 * Ranks every competing claim for one property and explains the ranking.
 * The same function backs the UI, the REST endpoint and the agent tool.
 */
export function adjudicate(input: AdjudicateInput): EngineResult {
  const { entityId, entityLabel, dispute, now = new Date().toISOString() } = input;
  const nowMs = Date.parse(now);
  const disputeKey = `${entityId}:${dispute.propertyId}`;

  if (!Array.isArray(dispute.claims) || dispute.claims.length === 0) {
    return {
      engineVersion: ENGINE_VERSION,
      disputeKey,
      status: 'empty',
      ranked: [],
      leader: null,
      runnerUp: null,
      score: 0,
      margin: 0,
      verdict: 'unresolved',
      recommendation: `No claims exist for ${dispute.propertyLabel} on ${entityLabel}. There is nothing to adjudicate.`,
      generatedAt: now,
    };
  }

  const text = corroboratingText(dispute, input.corroboratingText);
  const hasActiveClaim = dispute.claims.some((c) => c.rank !== 'deprecated');

  const ranked: RankedClaim[] = dispute.claims
    .map((claim) => {
      const factors: Factor[] = [
        scoreEditorialRank(claim),
        scoreEvidenceDepth(claim),
        scoreCorroboration(claim, text),
        scoreRecency(claim, nowMs),
        scoreSpecificity(claim),
      ];
      const score = round2(factors.reduce((sum, f) => sum + f.contribution, 0));
      const deprecated = claim.rank === 'deprecated';
      const eligible = !deprecated || !hasActiveClaim;
      return {
        claimId: claim.claimId,
        value: claim.value,
        score,
        rank: claim.rank,
        referenceCount: claim.referenceCount,
        eligible,
        ineligibleReason: eligible
          ? null
          : 'upstream editors marked this claim deprecated, so it cannot govern while an active claim exists',
        factors,
      };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return (
        b.score - a.score ||
        b.referenceCount - a.referenceCount ||
        a.claimId.localeCompare(b.claimId)
      );
    });

  const leader = ranked[0];
  const runnerUp = ranked[1] ?? null;
  const margin = round2(leader.score - (runnerUp ? runnerUp.score : 0));
  const verdict: Verdict =
    ranked.length === 1 ? 'settled' : margin >= 18 ? 'settled' : margin >= 8 ? 'contested' : 'unresolved';
  const band = VERDICT_BANDS.find((b) => b.verdict === verdict)!;

  const recommendation =
    ranked.length === 1
      ? `${entityLabel} has only one ${dispute.propertyLabel} claim upstream (${leader.value}), so there is no rival to weigh.`
      : `${band.action} ${entityLabel} ${dispute.propertyLabel}: ${leader.value} leads ${runnerUp!.value} by ${margin.toFixed(2)} points (${band.meaning})`;

  const excludedLeader = ranked.find((r) => !r.eligible && r.score > leader.score);
  const fullRecommendation = excludedLeader
    ? `${recommendation} The higher-scoring ${excludedLeader.value} is barred from governing: ${excludedLeader.ineligibleReason}.`
    : recommendation;

  return {
    engineVersion: ENGINE_VERSION,
    disputeKey,
    status: ranked.length === 1 ? 'degenerate' : 'ok',
    ranked,
    leader,
    runnerUp,
    score: leader.score,
    margin,
    verdict,
    recommendation: fullRecommendation,
    generatedAt: now,
  };
}

export function factorWeightTotal(): number {
  return round2(Object.values(FACTOR_WEIGHTS).reduce((a, b) => a + b, 0));
}