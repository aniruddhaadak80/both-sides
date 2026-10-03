import { ENGINE_VERSION } from '@/lib/engine';
import { checkPersistence } from '@/lib/db';
import { fail, ok } from '@/lib/api';
import { fetchSanityDisputes } from '@/lib/sanity/client';
import { SANITY_DATASET, SANITY_PROJECT_ID } from '@/lib/site';

export const dynamic = 'force-dynamic';

export async function GET() {
  const persistence = await checkPersistence();
  if (!persistence.ok) {
    return fail('persistence_unavailable', 'The production datastore did not answer.', 503, {
      store: persistence.store,
    });
  }

  const sanity = await fetchSanityDisputes(5000);

  return ok({
    status: 'ok',
    engineVersion: ENGINE_VERSION,
    persistence: { store: persistence.store, reachable: true },
    sanity: {
      projectId: SANITY_PROJECT_ID,
      dataset: SANITY_DATASET,
      reachable: sanity.ok,
      publishedDisputes: sanity.disputes.length,
      detail: sanity.detail,
    },
    checkedAt: new Date().toISOString(),
  });
}