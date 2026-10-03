import { clampString, fail, ok, readJsonBody, withScope } from '@/lib/api';
import { adjudicate } from '@/lib/engine';
import { corroborationText, fetchUpstreamEntity } from '@/lib/upstream';
import { findEntity, loadCorpus } from '@/lib/corpus';
import { createRuling, listRulings, replay } from '@/lib/repository';
import { readScopeId } from '@/lib/session';
import type { Entity, RulingStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const scopeId = await readScopeId();
  const url = new URL(request.url);
  const limitRaw = url.searchParams.get('limit');
  const statusRaw = url.searchParams.get('status');
  const status = ['active', 'superseded', 'retired'].includes(statusRaw ?? '')
    ? (statusRaw as RulingStatus)
    : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const rulings = await listRulings(scopeId, {
    ...(Number.isFinite(limit) ? { limit: Number(limit) } : {}),
    ...(status ? { status } : {}),
  });

  const withReplay = await Promise.all(
    rulings.map(async (ruling) => ({
      ruling,
      integrity: await replay(ruling.id),
    })),
  );

  return ok({ rulings: withReplay, count: withReplay.length });
}

export async function POST(request: Request) {
  const scopeId = await readScopeId();
  const body = await readJsonBody(request);
  if (!body) return fail('invalid_json', 'Request body must be a JSON object.', 400);

  const entityId = clampString(body.entityId, 32);
  const propertyId = clampString(body.propertyId, 32);
  const chosenClaimId = clampString(body.chosenClaimId, 96);
  const rationale = clampString(body.rationale, 600);
  const idempotencyKey = clampString(body.idempotencyKey, 120);
  const supersedesId = clampString(body.supersedesId, 64);

  if (!entityId || !propertyId || !chosenClaimId) {
    return fail('invalid_request', 'entityId, propertyId and chosenClaimId are required.', 400);
  }
  if (!rationale) {
    return fail('invalid_request', 'A rationale is required so the ruling can be reviewed later.', 400);
  }

  let entity: Entity | undefined = findEntity(await loadCorpus(scopeId), entityId);
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
  if (!entity) return fail('not_found', `Entity ${entityId} is not available.`, 404);

  const dispute = entity.disputes.find((d) => d.propertyId === propertyId);
  if (!dispute) return fail('not_found', `${entity.label} has no disputed ${propertyId}.`, 404);

  const chosen = dispute.claims.find((c) => c.claimId === chosenClaimId);
  if (!chosen) {
    return fail('invalid_claim', `${chosenClaimId} is not one of this dispute's claims.`, 400, {
      available: dispute.claims.map((c) => c.claimId),
    });
  }

  const result = adjudicate({
    entityId: entity.entityId,
    entityLabel: entity.label,
    dispute,
    corroboratingText: corroborationText(entity),
  });

  let ruling;
  let replayed = false;
  try {
    const stored = await createRuling(
      scopeId,
      {
        entity: { entityId: entity.entityId, label: entity.label },
        propertyId,
        propertyLabel: dispute.propertyLabel,
        disputeKey: `${entity.entityId}:${propertyId}`,
        chosenClaimId,
        chosenValue: chosen.value,
        rationale,
        engine: result,
        supersedesId: supersedesId ?? null,
      },
      idempotencyKey ?? null,
    );
    ruling = stored.ruling;
    replayed = stored.replayed;
  } catch (err) {
    console.error('ruling create failed', {
      scopeId,
      entityId,
      propertyId,
      err: String(err).slice(0, 300),
    });
    return fail(
      'write_failed',
      'The ruling could not be stored because the datastore rejected the write.',
      503,
    );
  }

  const integrity = await replay(ruling.id);
  return withScope({ ruling, engine: result, integrity, idempotentReplay: replayed }, scopeId);
}