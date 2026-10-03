/**
 * Seeds the Sanity Content Lake with the curated entities and disputes, so
 * /api/corpus serves `live` instead of the sealed snapshot.
 *
 *   SANITY_API_WRITE_TOKEN=<editor token> node scripts/seed.mjs
 *
 * Documents use deterministic ids and createOrReplace, so running it twice is a
 * no-op rather than a duplicate. Nothing here is required for the app to run.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const corpusPath = resolve(here, '../src/lib/corpus/fallback-corpus.json');

const PROJECT_ID = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? '4npxmu4m';
const DATASET = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production';
const API_VERSION = process.env.SANITY_API_VERSION ?? '2026-02-19';
const token = process.env.SANITY_API_WRITE_TOKEN;

if (!token) {
  console.error('SANITY_API_WRITE_TOKEN is required (Editor permission).');
  process.exit(2);
}

const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Claims are capped so a single 35-claim property cannot dominate the dataset. */
const MAX_CLAIMS_PER_DISPUTE = 12;

const mutations = [];

for (const entity of corpus.entities) {
  mutations.push({
    createOrReplace: {
      _id: `entity.${entity.entityId}`,
      _type: 'entity',
      entityId: entity.entityId,
      label: entity.label,
      description: entity.description ?? undefined,
      wikipedia: entity.wikipedia ?? undefined,
      openstreetmap: entity.openstreetmap ?? undefined,
    },
  });

  for (const dispute of entity.disputes) {
    mutations.push({
      createOrReplace: {
        _id: `dispute.${entity.entityId}-${dispute.propertyId}`,
        _type: 'dispute',
        entity: { _type: 'reference', _ref: `entity.${entity.entityId}` },
        entityId: entity.entityId,
        entityLabel: entity.label,
        propertyId: dispute.propertyId,
        propertyKey: dispute.propertyKey,
        propertyLabel: dispute.propertyLabel,
        claims: dispute.claims.slice(0, MAX_CLAIMS_PER_DISPUTE).map((c) => ({
          _type: 'claim',
          _key: slugify(c.claimId),
          claimId: c.claimId,
          value: String(c.value).slice(0, 200),
          numeric: typeof c.numeric === 'number' ? c.numeric : null,
          rank: c.rank,
          referenceCount: c.referenceCount ?? 0,
          referenceUrls: (c.referenceUrls ?? []).slice(0, 4),
          retrieved: c.retrieved ?? undefined,
          precision: c.precision ?? undefined,
        })),
      },
    });
  }
}

// A Context document so Sanity can expose a scoped MCP endpoint for this dataset.
mutations.push({
  createOrReplace: {
    _id: 'agentContext.both-sides',
    _type: 'sanity.agentContext',
    name: 'Both Sides adjudication desk',
    slug: { _type: 'slug', current: 'adjudication-desk' },
    groqFilter: '_type in ["dispute", "entity"]',
    instructions: [
      'Rules',
      '- Only answer from the provided content. If the content does not settle a question, say so.',
      '- Always surface every competing claim for a property together with its rank and reference URLs.',
      '- Never pick a winner silently. Report the claims, then state which one governs and why.',
      '',
      'Schema notes',
      '- dispute.claims[] holds the competing claims. A dispute exists only because they disagree.',
      '- claim.rank is preferred, normal or deprecated. A deprecated claim must never govern while an active claim exists.',
      '- claim.numeric is the parsed figure used for comparison; it can be null.',
      '- claim.referenceUrls[] links to the upstream references. Cite them.',
      '- entity->wikipedia.extract is the second source used to corroborate a claim.',
    ].join('\n'),
  },
});

const url = `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/mutate/${DATASET}`;

for (let i = 0; i < mutations.length; i += 100) {
  const batch = mutations.slice(i, i + 100);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ mutations: batch }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error(`batch failed (${res.status}): ${JSON.stringify(body).slice(0, 400)}`);
    process.exit(1);
  }
  console.log(`committed ${batch.length} document(s)`);
}

console.log(`\nseeded ${corpus.entities.length} entities into ${PROJECT_ID}/${DATASET}`);
console.log('next: cd ../studio && npx sanity schemas deploy');