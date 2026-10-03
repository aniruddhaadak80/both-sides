import { loadCorpus } from '@/lib/corpus';
import { ok } from '@/lib/api';
import { readScopeId } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const scopeId = await readScopeId();
  const corpus = await loadCorpus(scopeId);
  return ok(corpus, {
    headers: { 'cache-control': 's-maxage=120, stale-while-revalidate=600' },
  });
}