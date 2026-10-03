import { clampString, fail, ok, readJsonBody } from '@/lib/api';
import { getAudit, getRuling, retireRuling, replay, updateRuling } from '@/lib/repository';
import { readScopeId } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scopeId = await readScopeId();
  const { id } = await params;
  const ruling = await getRuling(id, scopeId);
  if (!ruling) {
    return fail('not_found', `No ruling ${id} belongs to this session.`, 404);
  }
  const [integrity, events] = await Promise.all([replay(id), getAudit(id)]);
  return ok({ ruling, integrity, events });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scopeId = await readScopeId();
  const { id } = await params;
  const body = await readJsonBody(request);
  if (!body) return fail('invalid_json', 'Request body must be a JSON object.', 400);

  const rationale = clampString(body.rationale, 600);
  if (!rationale) return fail('invalid_request', 'rationale is required.', 400);

  const updated = await updateRuling(id, scopeId, { rationale });
  if (!updated) {
    const existing = await getRuling(id, scopeId);
    if (!existing) return fail('not_found', `No ruling ${id} belongs to this session.`, 404);
    return fail('conflict', 'A retired ruling cannot be amended.', 409, { status: existing.status });
  }

  const integrity = await replay(id);
  return ok({ ruling: updated, integrity });
}

/** Soft delete: the row and its audit chain are retained so replay still works. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const scopeId = await readScopeId();
  const { id } = await params;
  const retired = await retireRuling(id, scopeId);
  if (!retired) return fail('not_found', `No ruling ${id} belongs to this session.`, 404);
  const integrity = await replay(id);
  return ok({ ruling: retired, integrity, tombstone: true });
}