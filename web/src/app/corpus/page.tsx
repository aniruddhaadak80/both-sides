import Link from 'next/link';

import { loadCorpus } from '@/lib/corpus';
import { readScopeId } from '@/lib/session';

export const metadata = { title: 'Corpus' };
export const dynamic = 'force-dynamic';

export default async function CorpusPage() {
  const corpus = await loadCorpus(await readScopeId());

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl">The corpus</h1>
      <p className="mt-2 max-w-2xl text-ink-80">
        Structured entities whose properties carry more than one published claim. These are the
        documents the agent reads, and the rows the engine ranks.
      </p>

      <div className="mt-4 rounded border border-rule bg-paper-2/70 p-3 text-sm">
        <p>
          <strong>Source:</strong>{' '}
          {corpus.status === 'live' ? 'live' : 'sealed snapshot'} · origin{' '}
          <code className="text-xs">{corpus.origin}</code> · as of{' '}
          {corpus.fetchedAt.slice(0, 10)} · Sanity dataset{' '}
          <code className="text-xs">
            {corpus.projectId}/{corpus.dataset}
          </code>
        </p>
        {corpus.notice ? <p className="mt-2 text-ink-80">{corpus.notice}</p> : null}
      </div>

      <div className="mt-8 space-y-8">
        {corpus.entities.map((entity) => (
          <section key={entity.entityId}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-1">
              <h2 className="font-display text-2xl">{entity.label}</h2>
              <code className="text-xs text-ink-60">{entity.entityId}</code>
            </div>
            {entity.description ? <p className="mt-1 text-sm text-ink-70">{entity.description}</p> : null}

            <ul className="mt-3 space-y-2">
              {entity.disputes.map((dispute) => (
                <li key={dispute.propertyId}>
                  <Link
                    href={`/dispute/${entity.entityId}/${dispute.propertyId}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-rule bg-paper px-3 py-2 hover:border-felt"
                  >
                    <span className="font-medium">{dispute.propertyLabel}</span>
                    <span className="font-mono text-xs text-ink-60">
                      {dispute.claims.length} claims · {dispute.propertyId}
                    </span>
                  </Link>
                  <ul className="mt-1 space-y-0.5">
                    {dispute.claims.slice(0, 6).map((claim) => (
                      <li key={claim.claimId} className="text-xs text-ink-70">
                        {claim.value}
                        <span className="text-ink-60">
                          {' '}
                          — {claim.rank}, {claim.referenceCount} ref
                          {claim.referenceCount === 1 ? '' : 's'}
                        </span>
                      </li>
                    ))}
                    {dispute.claims.length > 6 ? (
                      <li className="text-xs text-ink-60">and {dispute.claims.length - 6} more</li>
                    ) : null}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="mt-10 border-t border-rule pt-6">
        <h2 className="font-display text-xl">Attribution</h2>
        <ul className="mt-2 text-sm text-ink-70">
          {corpus.attribution.map((a) => (
            <li key={a.name}>
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline">
                {a.name}
              </a>{' '}
              — {a.license}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}