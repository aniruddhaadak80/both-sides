import { clampString, fail, ok, readJsonBody } from '@/lib/api';
import { fetchUpstreamEntity } from '@/lib/upstream';
import { saveImportedEntity } from '@/lib/repository';
import { readScopeId } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q');
  if (!q || q.trim().length < 2) {
    return fail('invalid_query', 'Provide at least two characters to search.', 400);
  }
  const { searchUpstreamEntities } = await import('@/lib/upstream');
  try {
    const hits = await searchUpstreamEntities(q.slice(0, 80));
    return ok({ hits });
  } catch (err) {
    return fail('upstream_unavailable', 'The upstream search could not be reached.', 502, {
      detail: String(err).slice(0, 160),
    });
  }
}

export async function POST(request: Request) {
  const scopeId = await readScopeId();
  const body = await readJsonBody(request);
  const entityId = clampString(body?.entityId, 32);
  if (!entityId || !/^Q\d+$/i.test(entityId)) {
    return fail('invalid_entity', 'entityId must look like Q35765.', 400);
  }

  let entity;
  try {
    entity = await fetchUpstreamEntity(entityId);
  } catch (err) {
    return fail('upstream_unavailable', 'The upstream entity read failed.', 502, {
      detail: String(err).slice(0, 160),
    });
  }
  if (!entity) {
    return fail('not_found', `No upstream entity matched ${entityId}.`, 404);
  }
  if (entity.disputes.length === 0) {
    return fail('no_dispute', `${entity.label} has no property with contradicting claims.`, 422, {
      entityId: entity.entityId,
      label: entity.label,
    });
  }

  await saveImportedEntity(scopeId, entity);
  return ok({ entity }, { status: 201 });
}