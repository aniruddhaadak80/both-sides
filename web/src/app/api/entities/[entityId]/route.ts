import { fail, ok } from '@/lib/api';
import { deleteImportedEntity } from '@/lib/repository';
import { readScopeId } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ entityId: string }> },
) {
  const scopeId = await readScopeId();
  const { entityId } = await params;
  const removed = await deleteImportedEntity(entityId, scopeId);
  if (!removed) {
    return fail('not_found', `No imported entity ${entityId} belongs to this session.`, 404);
  }
  return ok({ deleted: entityId });
}