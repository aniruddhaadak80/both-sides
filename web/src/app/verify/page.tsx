import Link from 'next/link';

import { listRulings, replay } from '@/lib/repository';
import { readScopeId } from '@/lib/session';

export const metadata = { title: 'Verify' };
export const dynamic = 'force-dynamic';

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ ruling?: string | string[] }>;
}) {
  const params = await searchParams;
  const selected = typeof params?.ruling === 'string' ? params.ruling : null;
  const scopeId = await readScopeId();
  const rulings = await listRulings(scopeId);

  const report = selected ? await replay(selected) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl">Integrity replay</h1>
      <p className="mt-2 text-ink-80">
        Each ruling owns a SHA-384 chain. Replay recomputes every seal from the genesis value and
        names the first link that fails.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-xl">Rulings in this session</h2>
        {rulings.length === 0 ? (
          <p className="mt-2 rounded border border-rule bg-paper-2/60 p-4 text-sm text-ink-70">
            Nothing recorded yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rulings.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/verify?ruling=${r.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-rule bg-paper px-3 py-2 hover:border-felt"
                >
                  <span>
                    {r.entityLabel} · {r.propertyLabel} → {r.chosenValue}
                  </span>
                  <span className="font-mono text-xs text-ink-60">{r.id}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {report ? (
        <section className="mt-8 rounded-lg border border-rule bg-paper p-5">
          <h2 className="font-display text-xl">Replay result</h2>
          <p className="mt-2">
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                report.ok ? 'bg-felt text-paper' : 'bg-vermilion text-paper'
              }`}
            >
              {report.ok ? 'CHAIN VERIFIED' : 'CHAIN BROKEN'}
            </span>
          </p>
          <dl className="mt-3 space-y-1 text-sm">
            <div>
              <dt className="inline text-ink-60">Events: </dt>
              <dd className="inline">{report.events}</dd>
            </div>
            <div>
              <dt className="inline text-ink-60">Head seal: </dt>
              <dd className="inline break-all font-mono text-xs">{report.headSeal}</dd>
            </div>
            {report.firstBrokenSeq !== null ? (
              <div>
                <dt className="inline text-ink-60">First broken link: </dt>
                <dd className="inline">seq {report.firstBrokenSeq}</dd>
              </div>
            ) : null}
          </dl>
          {report.detail ? <p className="mt-2 text-sm text-vermilion">{report.detail}</p> : null}
        </section>
      ) : null}
    </div>
  );
}