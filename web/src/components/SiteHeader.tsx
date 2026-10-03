'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { GitHubMark } from '@/components/GitHubMark';
import { site } from '@/lib/site';

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-xl tracking-tight">Both Sides</span>
          <span className="hidden text-xs text-ink-60 sm:inline">adjudication desk</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {site.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? 'page' : undefined}
              className="rounded px-2.5 py-1.5 text-sm text-ink-80 hover:bg-felt/10 hover:text-ink aria-[current=page]:bg-felt/15 aria-[current=page]:text-ink"
            >
              {item.label}
            </Link>
          ))}
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Star ${site.name} on GitHub`}
            className="ml-2 inline-flex items-center gap-1.5 rounded border border-rule bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-ink-90"
          >
            <GitHubMark />
            <span className="hidden sm:inline">Star on GitHub</span>
            <span className="sm:hidden">GitHub</span>
          </a>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="rounded border border-rule px-3 py-1.5 text-sm md:hidden"
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>

      {open ? (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-rule bg-paper md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col px-4 py-2">
            {site.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                aria-current={pathname === item.href ? 'page' : undefined}
                className="border-b border-rule/60 py-2.5 text-sm text-ink-80 last:border-b-0"
              >
                {item.label}
              </Link>
            ))}
            <a
              href={site.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              aria-label={`View the ${site.name} source on GitHub`}
              className="mt-2 mb-1 inline-flex items-center gap-2 rounded bg-ink px-3 py-2 text-sm font-medium text-paper"
            >
              <GitHubMark />
              View source on GitHub
            </a>
          </div>
        </nav>
      ) : null}
    </header>
  );
}