import Link from 'next/link';

import { getRulingByShareToken, replay } from '@/lib/repository';
import { VerdictBadge } from '@/components/VerdictPanel';
import { formatClaimValue } from '@/lib/format';
import { site } from '@/lib/site';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return { title: `Shared ruling ${token}`, robots: { index: false, follow: false } };
}

export default async function SharedRulingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ruling = await getRulingByShareToken(token);
  const report = ruling ? await replay(ruling.id) : null;

  if (!ruling) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-display text-3xl">No such shared ruling</h1>
        <p className="mt-2 text-ink-70">
          This link may have been mistyped, or the ruling belongs to another session.
        </p>
        <Link href="/" className="mt-6 inline-block rounded bg-ink px-4 py-2 text-paper">
          Back to Both Sides
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-xs uppercase tracking-[0.18em] text-vermilion">Shared ruling</p>
      <h1 className="mt-2 font-display text-3xl">
        {ruling.entityLabel} · {ruling.propertyLabel}
      </h1>
      <div className="mt-2 flex items-center gap-3">
        <VerdictBadge verdict={ruling.verdict} />
        <span className="text-sm text-ink-70">
          score {ruling.score.toFixed(2)} · margin {ruling.margin.toFixed(2)}
        </span>
      </div>

      <dl className="mt-6 divide-y divide-rule rounded border border-rule bg-paper">
        <div className="px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-ink-60">Ruled value</dt>
          <dd className="mt-1 font-display text-2xl">{formatClaimValue(ruling.chosenValue)}</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-ink-60">Rationale</dt>
          <dd className="mt-1">{ruling.rationale}</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-ink-60">Status and engine</dt>
          <dd className="mt-1 text-sm">
            {ruling.status} · {ruling.engineVersion} · recorded {ruling.createdAt.slice(0, 10)}
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-ink-60">Chain</dt>
          <dd className="mt-1 text-sm">
            {report?.ok ? 'verified' : 'broken'} across {report?.events ?? 0} event(s)
            <span className="mt-1 block break-all font-mono text-xs">{report?.headSeal}</span>
          </dd>
        </div>
      </dl>

      <p className="mt-6 text-sm text-ink-70">
        This ruling was recorded in an anonymous session and shared as a read-only link. It is a
        human decision about competing claims, not a verification that the value is correct.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <a
          href={`/api/export?id=${ruling.id}&format=markdown`}
          className="rounded border border-rule px-3 py-1.5 text-sm"
        >
          Download Markdown
        </a>
        <a
          href={site.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded bg-ink px-3 py-1.5 text-sm text-paper"
        >
          View source on GitHub
        </a>
      </div>
    </div>
  );
}