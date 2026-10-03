import Link from 'next/link';

import { listRulings } from '@/lib/repository';
import { readScopeId } from '@/lib/session';

export const metadata = { title: 'Shared rulings' };
export const dynamic = 'force-dynamic';

export default async function ShareIndexPage() {
  const rulings = (await listRulings(await readScopeId())).filter((r) => r.shareToken);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl">Shared rulings</h1>
      <p className="mt-2 text-ink-80">
        Each ruling gets a stable read-only link. Anyone with the link can read the decision and
        replay its chain without an account.
      </p>

      {rulings.length === 0 ? (
        <p className="mt-6 rounded border border-rule bg-paper-2/60 p-4 text-sm text-ink-70">
          No rulings recorded in this session yet. <Link href="/desk" className="underline">Open the desk</Link>.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {rulings.map((r) => (
            <li key={r.id}>
              <Link
                href={`/share/${r.shareToken}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-rule bg-paper px-3 py-2 hover:border-felt"
              >
                <span>
                  {r.entityLabel} · {r.propertyLabel} → {r.chosenValue}
                </span>
                <code className="text-xs text-ink-60">/share/{r.shareToken}</code>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}