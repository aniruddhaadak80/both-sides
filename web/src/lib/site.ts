export const SANITY_PROJECT_ID =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? '4npxmu4m';

export const SANITY_DATASET = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';

export const SANITY_API_VERSION = '2026-02-19';

export const site = {
  name: 'Both Sides',
  tagline: 'An adjudication desk for data that disagrees with itself.',
  description:
    'Both Sides loads a real entity, puts its conflicting structured claims side by side with their sources, and rules on which one governs with an explainable precedence engine. Every ruling is hash-chained and exportable.',
  liveUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://both-sides-eta.vercel.app',
  repoUrl: 'https://github.com/aniruddhaadak80/both-sides',
  repoSlug: 'aniruddhaadak80/both-sides',
  issuesUrl: 'https://github.com/aniruddhaadak80/both-sides/issues',
  license: 'MIT',
  nav: [
    { href: '/desk', label: 'Desk' },
    { href: '/corpus', label: 'Corpus' },
    { href: '/agent', label: 'Agent' },
    { href: '/export', label: 'Export' },
    { href: '/method', label: 'Method' },
    { href: '/verify', label: 'Verify' },
  ],
} as const;

export const engineVersion = 'precedence-engine@1.0.0';

export const SOURCE_ATTRIBUTION = [
  { name: 'Wikidata', url: 'https://www.wikidata.org', license: 'CC0 1.0' },
  { name: 'Wikipedia', url: 'https://en.wikipedia.org', license: 'CC BY-SA 4.0' },
  { name: 'OpenStreetMap Nominatim', url: 'https://nominatim.openstreetmap.org', license: 'ODbL' },
] as const;