import Link from 'next/link';

import { ImportPanel } from '@/components/ImportPanel';
import { VerdictBadge } from '@/components/VerdictPanel';
import { loadCorpus } from '@/lib/corpus';
import { listRulings, replay } from '@/lib/repository';
import { readScopeId } from '@/lib/session';

export const metadata = { title: 'Desk' };
export const dynamic = 'force-dynamic';

export default async function DeskPage() {
  const scopeId = await readScopeId();
  const corpus = await loadCorpus(scopeId);
  const rulings = await listRulings(scopeId, { limit: 20 });

  // Replaying every chain on each render is a query per ruling, so only the most
  // recent few are verified here; /verify replays any ruling on demand.
  const withIntegrity = await Promise.all(
    rulings.slice(0, 8).map(async (ruling) => ({ ruling, integrity: await replay(ruling.id) })),
  );

  const disputes = corpus.entities.flatMap((e) =>
    e.disputes.map((d) => ({ entity: e, dispute: d })),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl">The desk</h1>
      <p className="mt-2 max-w-2xl text-ink-80">
        Import a real entity, rule on a contradiction, and keep every ruling in a chain you can
        replay. Records belong to this anonymous session.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-8">
          <ImportPanel />

          <section>
            <h2 className="font-display text-xl">Disputes available now</h2>
            {disputes.length === 0 ? (
              <p className="mt-3 rounded border border-rule bg-paper-2/60 p-4 text-sm text-ink-70">
                No disputes are published yet. Import an entity to read one live.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {disputes.map(({ entity, dispute }) => (
                  <li key={`${entity.entityId}-${dispute.propertyId}`}>
                    <Link
                      href={`/dispute/${entity.entityId}/${dispute.propertyId}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-rule bg-paper px-3 py-2 hover:border-felt"
                    >
                      <span>
                        <span className="font-medium">{entity.label}</span>{' '}
                        <span className="text-ink-70">· {dispute.propertyLabel}</span>
                      </span>
                      <span className="font-mono text-xs text-ink-60">
                        {dispute.claims.length} claims
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section>
          <h2 className="font-display text-xl">Rulings in this session</h2>
          {withIntegrity.length === 0 ? (
            <p className="mt-3 rounded border border-rule bg-paper-2/60 p-4 text-sm text-ink-70">
              Nothing recorded yet. Open a dispute and rule on it.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {withIntegrity.map(({ ruling, integrity }) => (
                <li key={ruling.id} className="rounded border border-rule bg-paper px-3 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/dispute/${ruling.entityId}/${ruling.propertyId}`}
                      className="font-medium hover:underline"
                    >
                      {ruling.entityLabel} · {ruling.propertyLabel}
                    </Link>
                    <VerdictBadge verdict={ruling.verdict} />
                  </div>
                  <p className="mt-1 text-sm text-ink-80">Ruled: {ruling.chosenValue}</p>
                  <p className="mt-0.5 text-xs text-ink-60">
                    {ruling.status} · {integrity.ok ? 'chain verified' : 'CHAIN BROKEN'} ·{' '}
                    <Link href={`/verify?ruling=${ruling.id}`} className="underline">
                      replay
                    </Link>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}