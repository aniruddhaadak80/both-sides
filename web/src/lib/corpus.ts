import fallback from './corpus/fallback-corpus.json';
import { fetchSanityDisputes } from './sanity/client';
import { listImportedEntities } from './repository';
import { SANITY_DATASET, SANITY_PROJECT_ID, SOURCE_ATTRIBUTION } from './site';
import type { Attribution, CorpusEnvelope, Entity, PropertyDispute } from './types';

interface SealedCorpus {
  capturedAt: string;
  attribution: Attribution[];
  note: string;
  entities: Entity[];
}

const SEALED = fallback as unknown as SealedCorpus;

const DATASET_URL = `https://${SANITY_PROJECT_ID}.api.sanity.io/v2026-02-19/data/query/${SANITY_DATASET}`;

/**
 * Resolution order: curated disputes published in the Sanity Content Lake, then
 * entities this session imported live from upstream, then the sealed snapshot.
 * The envelope always states which one answered so fallback is never shown as live.
 */
export async function loadCorpus(scopeId: string): Promise<CorpusEnvelope> {
  const sanity = await fetchSanityDisputes();
  const attribution: Attribution[] = [...SOURCE_ATTRIBUTION];

  if (sanity.ok && sanity.disputes.length > 0) {
    const byEntity = new Map<string, Entity>();
    for (const d of sanity.disputes) {
      const existing = byEntity.get(d.entityId);
      const dispute: PropertyDispute = {
        propertyId: d.propertyId,
        propertyKey: d.propertyKey ?? d.propertyId,
        propertyLabel: d.propertyLabel,
        claims: d.claims ?? [],
      };
      if (existing) {
        existing.disputes.push(dispute);
      } else {
        byEntity.set(d.entityId, {
          entityId: d.entityId,
          label: d.entityLabel,
          description: d.entity?.description ?? null,
          wikipedia: d.wikipedia ?? null,
          openstreetmap: d.openstreetmap ?? null,
          disputes: [dispute],
        });
      }
    }
    return {
      status: 'live',
      fetchedAt: new Date().toISOString(),
      origin: 'sanity-content-lake',
      dataset: SANITY_DATASET,
      datasetUrl: DATASET_URL,
      projectId: SANITY_PROJECT_ID,
      attribution,
      entities: [...byEntity.values()],
      notice: null,
    };
  }

  let imported: Entity[] = [];
  try {
    const rows = await listImportedEntities(scopeId);
    imported = rows.map((r) => ({
      entityId: r.entityId,
      label: r.label,
      description: r.description,
      wikipedia: r.wikipedia,
      openstreetmap: r.openstreetmap,
      disputes: r.disputes,
    }));
  } catch {
    imported = [];
  }

  if (imported.length > 0) {
    return {
      status: 'live',
      fetchedAt: new Date().toISOString(),
      origin: 'wikidata-import',
      dataset: SANITY_DATASET,
      datasetUrl: DATASET_URL,
      projectId: SANITY_PROJECT_ID,
      attribution,
      entities: imported,
      notice: sanity.ok
        ? null
        : `The Content Lake read failed (${sanity.detail ?? 'unknown error'}), so this session's live imports are shown.`,
    };
  }

  return {
    status: 'fallback',
    fetchedAt: SEALED.capturedAt,
    origin: 'sealed-corpus',
    dataset: SANITY_DATASET,
    datasetUrl: DATASET_URL,
    projectId: SANITY_PROJECT_ID,
    attribution,
    entities: SEALED.entities,
    notice: `No published disputes are available yet, so this is a sealed snapshot captured ${SEALED.capturedAt.slice(0, 10)} from ${SEALED.attribution.map((a) => a.name).join(', ')}. Import an entity to read it live.`,
  };
}

export function findEntity(corpus: CorpusEnvelope, entityId: string): Entity | undefined {
  return corpus.entities.find((e) => e.entityId === entityId);
}