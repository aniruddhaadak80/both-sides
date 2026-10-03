import { fail, ok } from '@/lib/api';
import { getAudit, getRuling, replay } from '@/lib/repository';
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
  const [report, events] = await Promise.all([replay(id), getAudit(id)]);
  return ok({ replay: report, events });
}