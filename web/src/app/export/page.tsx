import Link from 'next/link';

import { listRulings } from '@/lib/repository';
import { readScopeId } from '@/lib/session';
import { site } from '@/lib/site';

export const metadata = { title: 'Export' };
export const dynamic = 'force-dynamic';

export default async function ExportPage() {
  const rulings = await listRulings(await readScopeId());

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl">Export</h1>
      <p className="mt-2 text-ink-80">
        Every export carries the competing claims, the engine version, the provenance and the full
        hash chain, so a reader can verify it without this app.
      </p>

      {rulings.length === 0 ? (
        <p className="mt-6 rounded border border-rule bg-paper-2/60 p-4 text-sm text-ink-70">
          Nothing recorded yet. <Link href="/desk" className="underline">Open the desk</Link> to rule
          on a dispute.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rulings.map((r) => (
            <li key={r.id} className="rounded border border-rule bg-paper p-4">
              <p className="font-medium">
                {r.entityLabel} · {r.propertyLabel} → {r.chosenValue}
              </p>
              <p className="mt-0.5 text-xs text-ink-60">
                {r.id} · {r.status} · {r.createdAt.slice(0, 10)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`/api/export?id=${r.id}&format=markdown`}
                  className="rounded bg-ink px-3 py-1.5 text-sm font-medium text-paper"
                >
                  Markdown
                </a>
                <a
                  href={`/api/export?id=${r.id}&format=json`}
                  className="rounded border border-rule px-3 py-1.5 text-sm font-medium"
                >
                  JSON
                </a>
                {r.shareToken ? (
                  <Link
                    href={`/share/${r.shareToken}`}
                    className="rounded border border-rule px-3 py-1.5 text-sm font-medium"
                  >
                    Public link
                  </Link>
                ) : null}
                <Link
                  href={`/verify?ruling=${r.id}`}
                  className="rounded border border-rule px-3 py-1.5 text-sm font-medium"
                >
                  Replay
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 rounded border border-rule bg-paper-2/70 p-4 text-sm text-ink-70">
        Exports are generated server-side and downloaded directly. Nothing in them is a claim that
        the underlying fact is correct — see the <Link href="/method" className="underline">method</Link>{' '}
        page. Repository:{' '}
        <a href={site.repoUrl} target="_blank" rel="noopener noreferrer" className="underline">
          {site.repoSlug}
        </a>
        .
      </p>
    </div>
  );
}