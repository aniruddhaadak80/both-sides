import Link from 'next/link';

import { GitHubMark } from '@/components/GitHubMark';
import { ClaimRow, FactorBar, VerdictBadge } from '@/components/VerdictPanel';
import { loadCorpus } from '@/lib/corpus';
import { adjudicate } from '@/lib/engine';
import { readScopeId } from '@/lib/session';
import { corroborationText } from '@/lib/upstream';
import { site } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const scopeId = await readScopeId();
  const corpus = await loadCorpus(scopeId);

  const featured =
    corpus.entities
      .flatMap((e) => e.disputes.map((d) => ({ entity: e, dispute: d })))
      .sort((a, b) => b.dispute.claims.length - a.dispute.claims.length)[0] ?? null;

  const result = featured
    ? adjudicate({
        entityId: featured.entity.entityId,
        entityLabel: featured.entity.label,
        dispute: featured.dispute,
        corroboratingText: corroborationText(featured.entity),
      })
    : null;

  const totalClaims = corpus.entities.reduce(
    (sum, e) => sum + e.disputes.reduce((s, d) => s + d.claims.length, 0),
    0,
  );

  return (
    <div className="paper-grain">
      <section className="mx-auto max-w-6xl px-4 pt-12 pb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-vermilion">
          Adjudication desk for contradictory data
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl leading-[1.08] tracking-tight sm:text-5xl">
          When your sources disagree,{' '}
          <span className="text-vermilion">see both sides</span> before you pick one.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-80">
          A knowledge base quietly contradicts itself all the time. Load a real entity, put every
          competing claim side by side with its references, and rule on which one governs with an
          explainable precedence engine. The ruling is sealed into a hash chain, so anyone can
          replay it.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            href="/desk"
            className="rounded bg-ink px-5 py-2.5 font-medium text-paper hover:bg-ink-90"
          >
            Open the desk
          </Link>
          <Link
            href="/corpus"
            className="rounded border border-ink px-5 py-2.5 font-medium hover:bg-ink/5"
          >
            Browse {corpus.entities.length} entities
          </Link>
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded border border-rule px-5 py-2.5 font-medium hover:bg-felt/10"
          >
            <GitHubMark />
            Star on GitHub
          </a>
        </div>

        <dl className="mt-9 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-rule pt-6 sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-60">Corpus source</dt>
            <dd className="mt-1 font-medium">
              {corpus.status === 'live' ? 'live' : 'sealed snapshot'}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-60">Competing claims</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums">{totalClaims}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-60">Engine</dt>
            <dd className="mt-1 font-medium">precedence-engine@1.0.0</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-60">Agent tools</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums">10</dd>
          </div>
        </dl>
      </section>

      {featured && result ? (
        <section className="border-y border-rule bg-paper-2/70">
          <div className="mx-auto max-w-6xl px-4 py-12">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-2xl">
                A live contradiction: {featured.entity.label} · {featured.dispute.propertyLabel}
              </h2>
              <VerdictBadge verdict={result.verdict} />
            </div>

            <p className="mt-2 max-w-3xl text-ink-80">
              {featured.dispute.claims.length} published claims disagree about this one property.
              The engine ranked them on five weighted factors and returned this:
            </p>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-rule bg-paper p-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-60">
                  Both sides
                </h3>
                <ul className="mt-3 space-y-2">
                  {result.ranked.slice(0, 8).map((claim) => (
                    <ClaimRow
                      key={claim.claimId}
                      claim={claim}
                      leader={claim.claimId === result.leader?.claimId}
                    />
                  ))}
                </ul>
                {result.ranked.length > 8 ? (
                  <p className="mt-3 text-xs text-ink-60">
                    Showing 8 of {result.ranked.length} claims.{' '}
                    <Link href={`/dispute/${featured.entity.entityId}/${featured.dispute.propertyId}`} className="underline">
                      See all
                    </Link>
                    .
                  </p>
                ) : null}
              </div>

              <div className="rounded-lg border border-rule bg-paper p-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-60">
                  Why the leader leads
                </h3>
                <div className="mt-2">
                  {(result.leader?.factors ?? []).map((factor) => (
                    <FactorBar key={factor.key} factor={factor} />
                  ))}
                </div>
                <p className="mt-4 rounded bg-felt/10 p-3 text-sm">{result.recommendation}</p>
                <Link
                  href={`/dispute/${featured.entity.entityId}/${featured.dispute.propertyId}`}
                  className="mt-4 inline-block rounded bg-felt px-4 py-2 text-sm font-medium text-paper hover:bg-felt-80"
                >
                  Rule on this dispute
                </Link>
              </div>
            </div>

            {corpus.notice ? (
              <p className="mt-6 rounded border border-ochre/40 bg-ochre/10 p-3 text-sm text-ink-80">
                {corpus.notice}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="font-display text-2xl">What a visitor can actually do</h2>
        <ol className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              n: '01',
              t: 'Import',
              d: 'Search a real entity and read it live from the upstream API. Rows are validated one at a time.',
            },
            {
              n: '02',
              t: 'Inspect',
              d: 'Open one property and read every competing claim, its rank, its references and its retrieval date.',
            },
            {
              n: '03',
              t: 'Rule',
              d: 'Record which claim governs, with a rationale. The engine result and seal are stored with it.',
            },
            {
              n: '04',
              t: 'Export and verify',
              d: 'Download Markdown or JSON, share a stable link, and replay the chain to prove nothing was edited.',
            },
          ].map((s) => (
            <li key={s.n} className="border-t-2 border-vermilion pt-3">
              <p className="font-mono text-sm text-vermilion">{s.n}</p>
              <p className="mt-1 font-display text-lg">{s.t}</p>
              <p className="mt-1 text-sm text-ink-70">{s.d}</p>
            </li>
          ))}
        </ol>

        <p className="mt-10 rounded border border-rule bg-paper-2/70 p-4 text-sm text-ink-70">
          <strong className="text-ink">Disclaimer.</strong> Both Sides ranks competing claims and
          records a human ruling. It does not certify that the chosen value is correct, and it is
          not a substitute for consulting the primary sources. Data comes from Wikidata (CC0 1.0),
          Wikipedia (CC BY-SA 4.0) and OpenStreetMap (ODbL).
        </p>
      </section>
    </div>
  );
}