import Link from 'next/link';
import { notFound } from 'next/navigation';

import { RulingForm } from '@/components/RulingForm';
import { ClaimRow, FactorBar, VerdictBadge } from '@/components/VerdictPanel';
import { findEntity, loadCorpus } from '@/lib/corpus';
import { adjudicate } from '@/lib/engine';
import { listRulings } from '@/lib/repository';
import { readScopeId } from '@/lib/session';
import { corroborationText, fetchUpstreamEntity } from '@/lib/upstream';
import type { Entity } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ entityId: string; propertyId: string }>;
}) {
  const { entityId, propertyId } = await params;
  return {
    title: `Dispute ${entityId} ${propertyId}`,
    description: `Every published claim for ${propertyId} on ${entityId}, ranked by the precedence engine.`,
  };
}

export default async function DisputePage({
  params,
}: {
  params: Promise<{ entityId: string; propertyId: string }>;
}) {
  const { entityId, propertyId } = await params;
  const scopeId = await readScopeId();

  let entity: Entity | undefined = findEntity(await loadCorpus(scopeId), entityId);
  if (!entity) {
    const live = await fetchUpstreamEntity(entityId);
    if (live) {
      entity = {
        entityId: live.entityId,
        label: live.label,
        description: live.description,
        wikipedia: live.wikipedia,
        openstreetmap: live.openstreetmap,
        disputes: live.disputes,
      };
    }
  }
  if (!entity) notFound();

  const dispute = entity.disputes.find((d) => d.propertyId === propertyId);
  if (!dispute) notFound();

  const result = adjudicate({
    entityId: entity.entityId,
    entityLabel: entity.label,
    dispute,
    corroboratingText: corroborationText(entity),
  });

  const mine = (await listRulings(scopeId)).filter(
    (r) => r.entityId === entity.entityId && r.propertyId === propertyId,
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-60">
        <Link href="/desk" className="hover:underline">
          Desk
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{entity.label}</span>
      </nav>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl">
          {entity.label} · {dispute.propertyLabel}
        </h1>
        <VerdictBadge verdict={result.verdict} />
      </div>
      <p className="mt-1 text-sm text-ink-70">
        <code>{entity.entityId}</code> · property <code>{dispute.propertyId}</code> ·{' '}
        {dispute.claims.length} competing claims
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="podium-a rounded-lg border border-rule bg-paper p-5">
          <h2 className="font-display text-xl">Both sides</h2>
          <ul className="mt-3 space-y-2">
            {result.ranked.map((claim) => (
              <ClaimRow
                key={claim.claimId}
                claim={claim}
                leader={claim.claimId === result.leader?.claimId}
              />
            ))}
          </ul>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">
              References behind each claim
            </summary>
            <ul className="mt-2 space-y-2 text-sm">
              {dispute.claims.map((c) => (
                <li key={c.claimId}>
                  <span className="font-mono text-xs">{c.claimId}</span> →{' '}
                  {c.referenceUrls.length === 0 ? (
                    <span className="text-ink-70">no reference URL</span>
                  ) : (
                    c.referenceUrls.map((u) => (
                      <a
                        key={u}
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mr-2 break-all underline"
                      >
                        {u}
                      </a>
                    ))
                  )}
                </li>
              ))}
            </ul>
          </details>
        </section>

        <section className="podium-b rounded-lg border border-rule bg-paper p-5">
          <h2 className="font-display text-xl">The ruling the engine reaches</h2>
          <p className="mt-1 text-sm text-ink-70">{result.engineVersion}</p>
          <div className="mt-3">
            {(result.leader?.factors ?? []).map((factor) => (
              <FactorBar key={factor.key} factor={factor} />
            ))}
          </div>
          <p className="mt-4 rounded bg-lapis/10 p-3 text-sm">{result.recommendation}</p>
          <p className="mt-3 text-xs text-ink-60">
            Score {result.score.toFixed(2)} · margin {result.margin.toFixed(2)} · verdict{' '}
            {result.verdict}
          </p>
        </section>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <RulingForm
          entityId={entity.entityId}
          propertyId={dispute.propertyId}
          claims={result.ranked}
          leaderId={result.leader?.claimId}
        />

        <section className="rounded-lg border border-rule bg-paper p-5">
          <h2 className="font-display text-xl">Provenance</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-60">Wikidata</dt>
              <dd className="mt-0.5">
                {entity.entityId} — structured claims with rank and reference URLs.
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-60">Wikipedia</dt>
              <dd className="mt-0.5">
                {entity.wikipedia ? (
                  <>
                    <a
                      href={entity.wikipedia.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {entity.wikipedia.title}
                    </a>{' '}
                    (retrieved {entity.wikipedia.timestamp.slice(0, 10)})
                    <span className="mt-1 block text-ink-70">{entity.wikipedia.extract}</span>
                  </>
                ) : (
                  'not available'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-60">OpenStreetMap</dt>
              <dd className="mt-0.5">
                {entity.openstreetmap
                  ? `${entity.openstreetmap.displayName} (${entity.openstreetmap.osmType}/${entity.openstreetmap.osmId})`
                  : 'not available'}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {mine.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-xl">Rulings recorded here</h2>
          <ul className="mt-3 space-y-2">
            {mine.map((ruling) => (
              <li key={ruling.id} className="rounded border border-rule bg-paper px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{ruling.chosenValue}</span>
                  <span className="text-xs text-ink-60">
                    {ruling.status} · {ruling.createdAt.slice(0, 10)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-80">{ruling.rationale}</p>
                <p className="mt-1 text-xs text-ink-60">
                  seal <span className="font-mono">{ruling.seal.slice(0, 24)}…</span> ·{' '}
                  <a href={`/api/export?id=${ruling.id}&format=markdown`} className="underline">
                    download Markdown
                  </a>{' '}
                  ·{' '}
                  <a href={`/api/export?id=${ruling.id}&format=json`} className="underline">
                    JSON
                  </a>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}