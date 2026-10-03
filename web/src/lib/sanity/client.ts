import { createClient } from 'next-sanity';

import { SANITY_API_VERSION, SANITY_DATASET, SANITY_PROJECT_ID } from '../site';
import type { Entity, PropertyDispute } from '../types';

const readToken = process.env.SANITY_API_READ_TOKEN;

export const sanityReadClient = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  apiVersion: SANITY_API_VERSION,
  useCdn: true,
  perspective: 'published',
  ...(readToken ? { token: readToken } : {}),
});

const DISPUTES_QUERY = `*[_type == "dispute" && defined(entityId) && defined(propertyId)] | order(entityLabel asc) {
  "entityId": entityId,
  "entityLabel": entityLabel,
  "propertyId": propertyId,
  "propertyKey": propertyKey,
  "propertyLabel": propertyLabel,
  "claims": claims[] {
    "claimId": claimId,
    "value": value,
    "numeric": numeric,
    "rank": rank,
    "referenceCount": referenceCount,
    "referenceUrls": referenceUrls,
    "retrieved": retrieved,
    "precision": precision
  },
  "entity": entity->{ "entityId": entityId, "label": label, "description": description },
  "wikipedia": entity->wikipedia,
  "openstreetmap": entity->openstreetmap
}`;

interface RawDispute {
  entityId: string;
  entityLabel: string;
  propertyId: string;
  propertyKey?: string;
  propertyLabel: string;
  claims: PropertyDispute['claims'];
  entity?: { entityId?: string; label?: string; description?: string } | null;
  wikipedia?: Entity['wikipedia'];
  openstreetmap?: Entity['openstreetmap'];
}

export async function fetchSanityDisputes(
  timeoutMs = 8000,
): Promise<{ disputes: RawDispute[]; ok: boolean; detail: string | null }> {
  try {
    const disputes = await Promise.race([
      sanityReadClient.fetch<RawDispute[]>(DISPUTES_QUERY),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('sanity read timed out')), timeoutMs),
      ),
    ]);
    return { disputes: disputes ?? [], ok: true, detail: null };
  } catch (err) {
    return { disputes: [], ok: false, detail: String(err).slice(0, 200) };
  }
}