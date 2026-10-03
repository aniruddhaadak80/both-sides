import type { EngineResult, Factor } from '@/lib/types';
import { formatClaimValue } from '@/lib/format';

const VERDICT_STYLE: Record<string, { label: string; className: string }> = {
  settled: { label: 'Settled', className: 'bg-felt text-paper' },
  contested: { label: 'Contested', className: 'bg-ochre text-paper' },
  unresolved: { label: 'Unresolved', className: 'bg-vermilion text-paper' },
};

export function VerdictBadge({ verdict }: { verdict: EngineResult['verdict'] }) {
  const style = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.unresolved;
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${style.className}`}>
      {style.label}
    </span>
  );
}

export function FactorBar({ factor }: { factor: Factor }) {
  const pct = Math.max(0, Math.min(100, factor.value * 100));
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{factor.label}</span>
        <span className="text-ink-60">
          ×{factor.weight.toFixed(2)} → {factor.contribution.toFixed(2)}
        </span>
      </div>
      <div
        className="mt-1 h-2 w-full overflow-hidden rounded bg-felt/15"
        role="img"
        aria-label={`${factor.label} scored ${pct.toFixed(0)} out of 100, contributing ${factor.contribution.toFixed(2)} points`}
      >
        <div className="h-full rounded bg-felt" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-70">{factor.evidence}</p>
    </div>
  );
}

export function ClaimRow({
  claim,
  leader,
}: {
  claim: EngineResult['ranked'][number];
  leader: boolean;
}) {
  return (
    <li
      className={`rounded border px-3 py-2 ${
        leader ? 'border-felt bg-felt/8' : 'border-rule bg-paper-2/60'
      } ${claim.eligible ? '' : 'opacity-70'}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {formatClaimValue(claim.value)}
          {leader ? (
            <span className="ml-2 rounded bg-felt px-1.5 py-0.5 text-[10px] font-semibold text-paper">
              LEADS
            </span>
          ) : null}
        </span>
        <span className="font-mono text-sm tabular-nums">{claim.score.toFixed(2)}</span>
      </div>
      <p className="mt-0.5 text-xs text-ink-70">
        rank {claim.rank} · {claim.referenceCount} reference{claim.referenceCount === 1 ? '' : 's'}
      </p>
      {claim.ineligibleReason ? (
        <p className="mt-1 text-xs font-medium text-vermilion">{claim.ineligibleReason}</p>
      ) : null}
    </li>
  );
}