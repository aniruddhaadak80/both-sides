import { clampString, fail, ok, readJsonBody } from '@/lib/api';
import { adjudicate, ENGINE_VERSION } from '@/lib/engine';
import { corroborationText, fetchUpstreamEntity } from '@/lib/upstream';
import { findEntity, loadCorpus } from '@/lib/corpus';
import { readScopeId } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Runs the shared precedence engine over one property's competing claims and
 * returns the sealed replay reference for the resulting ruling, if any exists.
 */
export async function POST(request: Request) {
  const scopeId = await readScopeId();
  const body = await readJsonBody(request);
  const entityId = clampString(body?.entityId, 32);
  const propertyId = clampString(body?.propertyId, 32);
  if (!entityId || !propertyId) {
    return fail('invalid_request', 'entityId and propertyId are required.', 400);
  }

  let entity = findEntity(await loadCorpus(scopeId), entityId);
  if (!entity) {
    const live = await fetchUpstreamEntity(entityId);
    if (live) {
      entity = {
        entityId: live.entityId,
        label: live.label,
        description: live.description,
        wikipedia: live.wikipedia,
        openstreetmap: live.openstreetmap,
        disputes: live.disputes,
      };
    }
  }
  if (!entity) {
    return fail('not_found', `Entity ${entityId} is not available.`, 404);
  }

  const dispute = entity.disputes.find((d) => d.propertyId === propertyId);
  if (!dispute) {
    return fail('not_found', `${entity.label} has no disputed ${propertyId}.`, 404, {
      available: entity.disputes.map((d) => d.propertyId),
    });
  }

  const result = adjudicate({
    entityId: entity.entityId,
    entityLabel: entity.label,
    dispute,
    corroboratingText: corroborationText(entity),
  });

  return ok({
    entity: { entityId: entity.entityId, label: entity.label },
    dispute,
    result,
    engineVersion: ENGINE_VERSION,
    sources: {
      wikipedia: entity.wikipedia
        ? { url: entity.wikipedia.url, retrieved: entity.wikipedia.timestamp }
        : null,
      openstreetmap: entity.openstreetmap
        ? { name: entity.openstreetmap.displayName, id: entity.openstreetmap.osmId }
        : null,
    },
    replayAvailable: true,
  });
}