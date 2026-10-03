import Link from 'next/link';

import { GitHubMark } from '@/components/GitHubMark';
import { SANITY_DATASET, SANITY_PROJECT_ID, site } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-rule bg-felt/20">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display text-lg">Both Sides</p>
            <p className="mt-2 max-w-xs text-sm text-ink-70">{site.description}</p>
          </div>

          <nav aria-label="Footer">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-60">Product</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {site.nav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-ink-80 hover:text-ink">
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/share" className="text-ink-80 hover:text-ink">
                  Shared rulings
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Source">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-60">Source</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              <li>
                <a
                  href={site.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-ink-80 hover:text-ink"
                >
                  <GitHubMark className="h-3.5 w-3.5" />
                  View source on GitHub
                </a>
              </li>
              <li>
                <a
                  href={site.issuesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-80 hover:text-ink"
                >
                  Issues and contributions
                </a>
              </li>
              <li>
                <Link href="/api/health" className="text-ink-80 hover:text-ink">
                  Health check
                </Link>
              </li>
              <li>
                <a href="/mcp.json" className="text-ink-80 hover:text-ink">
                  mcp.json
                </a>
              </li>
            </ul>
          </nav>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-60">Content</p>
            <p className="mt-2 text-sm text-ink-70">
              Structured claims from Wikidata (CC0), Wikipedia (CC BY-SA 4.0) and OpenStreetMap
              (ODbL). Published disputes live in Sanity dataset{' '}
              <code className="rounded bg-felt/20 px-1 py-0.5 text-xs">{SANITY_PROJECT_ID}</code>
              /<code className="rounded bg-felt/20 px-1 py-0.5 text-xs">{SANITY_DATASET}</code>.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-rule pt-6 text-sm text-ink-70 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {site.name} is MIT licensed. Built by Aniruddha Adak.
          </p>
          <p>Data is not a correctness guarantee. Consult the primary sources.</p>
        </div>
      </div>
    </footer>
  );
}