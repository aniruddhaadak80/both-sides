import { ENGINE_VERSION, VERDICT_BANDS } from '@/lib/engine';
import { checkPersistence } from '@/lib/db';
import { fetchSanityDisputes } from '@/lib/sanity/client';
import { SANITY_DATASET, SANITY_PROJECT_ID, site } from '@/lib/site';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const persistence = await checkPersistence();
  const sanity = await fetchSanityDisputes();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl">Settings and runtime</h1>
      <p className="mt-2 text-ink-80">
        What this deployment is actually connected to. Nothing here is decorative: each row is read
        from the running service.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-xl">Runtime</h2>
        <dl className="mt-3 divide-y divide-rule rounded border border-rule bg-paper">
          {[
            ['Engine', ENGINE_VERSION],
            ['Datastore', persistence.ok ? persistence.store : `unavailable (${persistence.detail})`],
            ['Datastore reachable', persistence.ok ? 'yes, SELECT 1 succeeded' : 'no'],
            ['Sanity project', SANITY_PROJECT_ID],
            ['Sanity dataset', SANITY_DATASET],
            ['Content Lake reachable', sanity.ok ? 'yes' : `no (${sanity.detail})`],
            ['Published disputes', String(sanity.disputes.length)],
            ['Live app', site.liveUrl],
            ['Repository', site.repoUrl],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2">
              <dt className="text-sm text-ink-60">{k}</dt>
              <dd className="break-all text-sm font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl">Session ownership</h2>
        <p className="mt-2 text-sm text-ink-80">
          There are no accounts. An HTTP-only cookie holds a random scope id, and every ruling,
          import and audit query is filtered by it. Deletions are soft, so a replay still works
          after you retire a ruling.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl">Verdict bands</h2>
        <ul className="mt-2 space-y-1 text-sm text-ink-80">
          {VERDICT_BANDS.map((b) => (
            <li key={b.verdict}>
              <strong>{b.verdict}</strong> (margin ≥ {b.minMargin.toFixed(2)}): {b.action}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}