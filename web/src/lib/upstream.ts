import type { Claim, Entity, PropertyDispute } from './types';

const UA =
  'both-sides/1.0 (https://github.com/aniruddhaadak80/both-sides; opencode build)';

const PROPERTIES: Record<string, { key: string; label: string }> = {
  P1082: { key: 'population', label: 'Population' },
  P571: { key: 'inception', label: 'Inception' },
  P2044: { key: 'elevationAboveSeaLevel', label: 'Elevation above sea level' },
  P2046: { key: 'area', label: 'Area' },
};

async function getJson<T>(url: string, timeoutMs = 12000): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`upstream responded ${res.status}`);
  return (await res.json()) as T;
}

export interface EntitySearchHit {
  entityId: string;
  label: string;
  description: string | null;
}

export async function searchUpstreamEntities(query: string): Promise<EntitySearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
    q,
  )}&language=en&limit=6&format=json`;
  const data = await getJson<{ search?: Array<{ id: string; label: string; description?: string }> }>(url);
  return (data.search ?? []).map((s) => ({
    entityId: s.id,
    label: s.label,
    description: s.description ?? null,
  }));
}

function shortUnit(u: string): string {
  const m = /\/entity\/(Q\d+)$/.exec(u);
  return m ? m[1] : u.replace(/^https?:\/\//, '').slice(0, 24);
}

function formatTime(t: string): string {
  const m = /^(-?)(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (!m) return t;
  const [, , y, mo, d] = m;
  if (y.length <= 4 && mo === '00' && d === '00') return `year ${y}`;
  return `${y}-${mo}-${d}`;
}

function normalizeClaim(claimId: string, claim: Record<string, unknown>): Claim {
  const mainsnak = claim.mainsnak as { datavalue?: { value?: unknown } } | undefined;
  const dv = mainsnak?.datavalue?.value;
  let value: string | null = null;
  let numeric: number | null = null;
  let precision: string | null = null;

  if (typeof dv === 'string') {
    value = dv;
  } else if (dv && typeof dv === 'object') {
    const o = dv as Record<string, unknown>;
    if (typeof o.amount === 'string') {
      const n = Number(o.amount.replace('+', ''));
      numeric = Number.isFinite(n) ? n : null;
      value =
        o.unit === '1'
          ? numeric === null
            ? o.amount
            : String(numeric)
          : `${numeric ?? o.amount} ${shortUnit(String(o.unit ?? ''))}`;
      precision = 'quantity';
    } else if (typeof o.time === 'string') {
      const raw = o.time;
      value = formatTime(raw.replace(/^\+/, ''));
      if (raw.startsWith('-')) value = `${value} BCE`;
      precision = `year precision ${String(o.precision)}`;
      const ym = /^(-?\d{4,})-/.exec(raw.replace(/^\+/, ''));
      if (ym) numeric = Number(ym[1]);
    } else if (typeof o.latitude === 'number') {
      value = `${o.latitude.toFixed(5)}, ${String(o.longitude).slice(0, 8)}`;
      precision = `coordinate ±${String(o.precision)}`;
      numeric = typeof o.altitude === 'number' ? o.altitude : null;
    }
  }

  const references = Array.isArray(claim.references) ? claim.references : [];
  const referenceUrls: string[] = [];
  let retrieved: string | null = null;

  for (const ref of references) {
    const snaks = (ref as { snaks?: Record<string, unknown[]> }).snaks ?? {};
    for (const [propId, arr] of Object.entries(snaks)) {
      const values = Array.isArray(arr) ? arr : [];
      if (propId === 'P854') {
        for (const s of values) {
          const v = (s as { datavalue?: { value?: unknown } })?.datavalue?.value;
          if (typeof v === 'string' && /^https?:/.test(v)) referenceUrls.push(v);
        }
      }
      if (propId === 'P813') {
        const t = (values[0] as { datavalue?: { value?: { time?: string } } })?.datavalue?.value?.time;
        if (typeof t === 'string') retrieved ??= t.replace(/^\+/, '').slice(0, 10);
      }
    }
  }

  return {
    claimId,
    value: value ?? 'unspecified',
    numeric,
    rank: (claim.rank as Claim['rank']) ?? 'normal',
    referenceCount: references.length,
    referenceUrls: [...new Set(referenceUrls)].slice(0, 4),
    retrieved,
    precision,
  };
}

interface WdEntity {
  labels?: Record<string, { value?: string }>;
  descriptions?: Record<string, { value?: string }>;
  claims?: Record<string, Array<Record<string, unknown>>>;
  sitelinks?: Record<string, { title?: string }>;
}

export interface UpstreamEntity extends Entity {
  fetchedAt: string;
  source: 'wikidata';
}

/** Live read of one entity, reduced to the properties that actually disagree. */
export async function fetchUpstreamEntity(entityId: string): Promise<UpstreamEntity | null> {
  const qid = entityId.trim().toUpperCase();
  if (!/^Q\d+$/.test(qid)) return null;

  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels|descriptions|claims|sitelinks&languages=en&format=json`;
  const data = await getJson<{ entities?: Record<string, WdEntity> }>(url);
  const e = data.entities?.[qid];
  if (!e) return null;

  const disputes: PropertyDispute[] = [];
  for (const [propId, meta] of Object.entries(PROPERTIES)) {
    const raw = e.claims?.[propId] ?? [];
    if (raw.length < 2) continue;
    const claims = raw.map((c, i) => normalizeClaim(`${qid}-${propId}-${i + 1}`, c));
    const distinct = new Set(claims.map((c) => c.value));
    if (distinct.size < 2) continue;
    disputes.push({
      propertyId: propId,
      propertyKey: meta.key,
      propertyLabel: meta.label,
      claims,
    });
  }

  let wikipedia: Entity['wikipedia'] = null;
  const slug = e.sitelinks?.enwiki?.title;
  if (slug) {
    try {
      const w = await getJson<{
        title: string;
        extract: string;
        timestamp: string;
        content_urls?: { desktop?: { page?: string } };
      }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug.replace(/ /g, '_'))}`);
      wikipedia = {
        title: w.title,
        extract: w.extract,
        timestamp: w.timestamp,
        url: w.content_urls?.desktop?.page ?? '',
      };
    } catch {
      wikipedia = null;
    }
  }

  let openstreetmap: Entity['openstreetmap'] = null;
  const label = e.labels?.en?.value;
  if (label) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
          label,
        )}&limit=1&extratags=1`,
        { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) },
      );
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      if (rows[0]) {
        openstreetmap = {
          osmType: String(rows[0].osm_type),
          osmId: Number(rows[0].osm_id),
          displayName: String(rows[0].display_name ?? ''),
          lat: String(rows[0].lat ?? ''),
          lon: String(rows[0].lon ?? ''),
          elevation: typeof rows[0].elevation === 'number' ? rows[0].elevation : null,
        };
      }
    } catch {
      openstreetmap = null;
    }
  }

  return {
    entityId: qid,
    label: label ?? qid,
    description: e.descriptions?.en?.value ?? null,
    wikipedia,
    openstreetmap,
    disputes,
    fetchedAt: new Date().toISOString(),
    source: 'wikidata',
  };
}

export function corroborationText(entity: Entity): string {
  return [entity.wikipedia?.extract ?? '', entity.openstreetmap?.displayName ?? '']
    .filter(Boolean)
    .join(' \n ');
}