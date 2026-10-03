/**
 * Capture a sealed, dated fallback corpus of genuinely conflicting structured claims.
 * Sources (all keyless): Wikidata wbgetentities + wbsearchentities, Wikipedia REST, OSM Nominatim.
 * Output: web/src/lib/corpus/fallback-corpus.json
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const UA = 'both-sides/1.0 (https://github.com/aniruddhaadak80/both-sides; opencode build)';
const OUT = resolve(
  'C:/Users/ANIRUDDHA/Desktop/Projects/both-sides/web/src/lib/corpus/fallback-corpus.json',
);

// Wikidata properties we arbitrate, with human labels and the unit each value carries.
const PROPERTIES = {
  P1082: { key: 'population', label: 'Population' },
  P571: { key: 'inception', label: 'Inception' },
  P2044: { key: 'elevationAboveSeaLevel', label: 'Elevation above sea level' },
  P2046: { key: 'area', label: 'Area' },
  P1083: { key: 'sourceCount', label: 'Source count' },
  P17: { key: 'country', label: 'Country' },
};

const TARGETS = [
  'Osaka',
  'Kyoto',
  'Nairobi',
  'Lisbon',
  'Reykjavik',
  'Montevideo',
  'Kathmandu',
  'Wellington',
];

async function json(url, ms = 20000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function resolveQid(name) {
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
    name,
  )}&language=en&limit=1&format=json`;
  const d = await json(url);
  const hit = d.search?.[0];
  return hit ? { qid: hit.id, label: hit.label, description: hit.description ?? null } : null;
}

/** Reduce one Wikidata claim into a normalized, citable assertion. */
function normalizeClaim(qid, propId, claim) {
  const dv = claim.mainsnak?.datavalue?.value;
  let display = null;
  let numeric = null;
  let precision = null;

  if (typeof dv === 'string') {
    display = dv;
  } else if (dv && typeof dv === 'object') {
    if (typeof dv.amount === 'string') {
      // quantity: {"amount":"+2751862","unit":"1"}
      const n = Number(dv.amount.replace('+', ''));
      numeric = Number.isFinite(n) ? n : null;
      display = dv.unit === '1' ? String(numeric) : `${numeric ?? dv.amount} ${shortUnit(dv.unit)}`;
      precision = 'quantity';
    } else if (typeof dv.time === 'string') {
      const t = dv.time.replace(/^\+/, '');
      const neg = dv.time.startsWith('-');
      display = formatTime(t);
      precision = `year precision ${dv.precision}`;
      if (neg) display = `${display} BCE`;
      const yearMatch = /^(-?\d{4,})-/.exec(t);
      if (yearMatch) numeric = Number(yearMatch[1]);
    } else if (typeof dv.latitude === 'number') {
      display = `${dv.latitude.toFixed(5)}, ${dv.longitude.toFixed(5)}`;
      precision = `coordinate ±${dv.precision}`;
      numeric = dv.altitude ?? null;
    }
  }

  const refs = claim.references ?? [];
  const referenceUrls = [];
  let retrieved = null;
  for (const ref of refs) {
    // `references[].snaks` is a map of property id -> array of snaks, not an array.
    const snaks = ref.snaks ?? {};
    for (const [propId, arr] of Object.entries(snaks)) {
      const values = Array.isArray(arr) ? arr : [];
      if (propId === 'P854') {
        for (const s of values) {
          const v = s?.datavalue?.value;
          if (typeof v === 'string' && /^https?:/.test(v)) referenceUrls.push(v);
        }
      }
      if (propId === 'P813') {
        const t = values[0]?.datavalue?.value?.time;
        if (typeof t === 'string') retrieved = retrieved ?? t.replace(/^\+/, '').slice(0, 10);
      }
    }
  }

  return {
    value: display,
    numeric,
    rank: claim.rank ?? 'normal',
    referenceCount: refs.length,
    referenceUrls: [...new Set(referenceUrls)].slice(0, 4),
    retrieved,
    precision,
  };
}

function shortUnit(u) {
  const m = /\/entity\/(Q\d+)$/.exec(u);
  return m ? m[1] : u.replace(/^https?:\/\//, '').slice(0, 24);
}

function formatTime(t) {
  const m = /^(-?)(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (!m) return t;
  const [, , y, mo, d] = m;
  if (y.length <= 4 && mo === '00' && d === '00') return `year ${y}`;
  return `${y}-${mo}-${d}`;
}

async function captureEntity(name) {
  const found = await resolveQid(name);
  if (!found) return null;

  const d = await json(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${found.qid}&props=labels|descriptions|claims|sitelinks&languages=en&format=json`,
  );
  const e = d.entities?.[found.qid];
  if (!e) return null;

  const disputes = [];
  for (const [propId, meta] of Object.entries(PROPERTIES)) {
    const claims = e.claims?.[propId] ?? [];
    if (claims.length < 2) continue; // a dispute needs at least two competing claims
    const normalized = claims.map((c, i) => ({
      claimId: `${found.qid}-${propId}-${i + 1}`,
      ...normalizeClaim(found.qid, propId, c),
    }));
    const distinct = new Set(normalized.map((c) => c.value));
    if (distinct.size < 2) continue; // identical values are not a contradiction
    disputes.push({
      propertyId: propId,
      propertyKey: meta.key,
      propertyLabel: meta.label,
      claims: normalized,
    });
  }

  let wiki = null;
  try {
    const slug = e.sitelinks?.enwiki?.title;
    if (slug) {
      const w = await json(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug.replace(/ /g, '_'))}`,
      );
      wiki = { title: w.title, extract: w.extract, timestamp: w.timestamp, url: w.content_urls?.desktop?.page };
    }
  } catch {
    wiki = null;
  }

  let osm = null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        name,
      )}&limit=1&extratags=1`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) },
    );
    const rows = await res.json();
    if (rows?.[0]) {
      osm = {
        osmType: rows[0].osm_type,
        osmId: rows[0].osm_id,
        displayName: rows[0].display_name,
        lat: rows[0].lat,
        lon: rows[0].lon,
        elevation: rows[0].elevation ?? null,
      };
    }
  } catch {
    osm = null;
  }

  return {
    entityId: found.qid,
    label: e.labels?.en?.value ?? found.label,
    description: e.descriptions?.en?.value ?? found.description,
    wikipedia: wiki,
    openstreetmap: osm,
    disputes,
  };
}

const entities = [];
for (const t of TARGETS) {
  try {
    const e = await captureEntity(t);
    if (e && e.disputes.length > 0) {
      entities.push(e);
      console.log(
        `${e.entityId} ${e.label}: ${e.disputes.length} disputed propert${
          e.disputes.length === 1 ? 'y' : 'ies'
        } (${e.disputes.map((d) => `${d.propertyKey}:${d.claims.length}`).join(', ')})`,
      );
    } else {
      console.log(`${t}: no contradicting claims found, skipped`);
    }
  } catch (err) {
    console.log(`${t}: FAILED ${String(err).slice(0, 120)}`);
    if (process.env.DEBUG_STACK) console.log(err.stack);
  }
}

const payload = {
  schema: 'both-sides/fallback-corpus@1',
  capturedAt: new Date().toISOString(),
  generator: 'scripts/capture-corpus.mjs',
  attribution: [
    { name: 'Wikidata', url: 'https://www.wikidata.org', license: 'CC0 1.0' },
    { name: 'Wikipedia REST API', url: 'https://en.wikipedia.org', license: 'CC BY-SA 4.0' },
    { name: 'OpenStreetMap Nominatim', url: 'https://nominatim.openstreetmap.org', license: 'ODbL' },
  ],
  note: 'Sealed snapshot used only when the Sanity Content Lake has no published dispute documents. Every claim retains its upstream rank and reference URLs.',
  entities,
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`\nwrote ${entities.length} entities -> ${OUT}`);