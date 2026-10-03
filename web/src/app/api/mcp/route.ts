import { adjudicate, FACTOR_WEIGHTS, VERDICT_BANDS } from '@/lib/engine';
import { corroborationText, fetchUpstreamEntity } from '@/lib/upstream';
import {
  createRuling,
  getAudit,
  getRuling,
  listRulings,
  replay,
  retireRuling,
  updateRuling,
} from '@/lib/repository';
import { findEntity, loadCorpus } from '@/lib/corpus';
import { readScopeId } from '@/lib/session';
import type { Entity } from '@/lib/types';

const PROTOCOL_VERSION = '2025-06-18';

type ToolHandler = (scopeId: string, args: Record<string, unknown>) => Promise<unknown>;

function toolError(message: string) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function str(value: unknown, max = 400): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

async function resolveEntity(scopeId: string, entityId: string): Promise<Entity | null> {
  const found = findEntity(await loadCorpus(scopeId), entityId);
  if (found) return found;
  const live = await fetchUpstreamEntity(entityId);
  if (!live) return null;
  return {
    entityId: live.entityId,
    label: live.label,
    description: live.description,
    wikipedia: live.wikipedia,
    openstreetmap: live.openstreetmap,
    disputes: live.disputes,
  };
}

const READ_TOOLS = {
  list_disputes: {
    description:
      'List every entity in the corpus that has at least one property with contradicting claims.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async (scopeId: string) => {
      const corpus = await loadCorpus(scopeId);
      return {
        status: corpus.status,
        origin: corpus.origin,
        entityCount: corpus.entities.length,
        entities: corpus.entities.map((e) => ({
          entityId: e.entityId,
          label: e.label,
          disputedProperties: e.disputes.map((d) => ({
            propertyId: d.propertyId,
            propertyLabel: d.propertyLabel,
            claimCount: d.claims.length,
          })),
        })),
      };
    },
  },
  get_dispute: {
    description: 'Read one property dispute in full, including every claim and its references.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: 'Wikidata QID, for example Q35765.' },
        propertyId: { type: 'string', description: 'Property id, for example P1082.' },
      },
      required: ['entityId', 'propertyId'],
      additionalProperties: false,
    },
    handler: async (scopeId: string, args: Record<string, unknown>) => {
      const entityId = str(args.entityId, 32);
      const propertyId = str(args.propertyId, 32);
      if (!entityId || !propertyId) throw new Error('entityId and propertyId are required.');
      const entity = await resolveEntity(scopeId, entityId);
      if (!entity) throw new Error(`Entity ${entityId} is not available.`);
      const dispute = entity.disputes.find((d) => d.propertyId === propertyId);
      if (!dispute) throw new Error(`${entity.label} has no disputed ${propertyId}.`);
      return { entity: { entityId: entity.entityId, label: entity.label }, dispute };
    },
  },
  list_rulings: {
    description: 'List the rulings recorded in the calling session, newest first.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } },
      additionalProperties: false,
    },
    handler: async (scopeId: string, args: Record<string, unknown>) => {
      const limit = typeof args.limit === 'number' ? Math.min(Math.max(args.limit, 1), 100) : 25;
      const rulings = await listRulings(scopeId, { limit });
      return { count: rulings.length, rulings };
    },
  },
} as const;

const MUTATION_TOOLS = {
  adjudicate: {
    description:
      'Run the deterministic precedence engine over one dispute. Returns every factor, its weight and its contribution, plus the verdict and recommendation.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        propertyId: { type: 'string' },
      },
      required: ['entityId', 'propertyId'],
      additionalProperties: false,
    },
    handler: async (scopeId: string, args: Record<string, unknown>) => {
      const entityId = str(args.entityId, 32);
      const propertyId = str(args.propertyId, 32);
      if (!entityId || !propertyId) throw new Error('entityId and propertyId are required.');
      const entity = await resolveEntity(scopeId, entityId);
      if (!entity) throw new Error(`Entity ${entityId} is not available.`);
      const dispute = entity.disputes.find((d) => d.propertyId === propertyId);
      if (!dispute) throw new Error(`${entity.label} has no disputed ${propertyId}.`);
      return {
        result: adjudicate({
          entityId: entity.entityId,
          entityLabel: entity.label,
          dispute,
          corroboratingText: corroborationText(entity),
        }),
      };
    },
  },
  record_ruling: {
    description:
      'Persist a ruling that chooses one claim over its rivals. Writes through the same service layer as the UI and is idempotent on idempotencyKey.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        propertyId: { type: 'string' },
        chosenClaimId: { type: 'string' },
        rationale: { type: 'string', maxLength: 600 },
        idempotencyKey: { type: 'string', maxLength: 120 },
        supersedesId: { type: 'string' },
      },
      required: ['entityId', 'propertyId', 'chosenClaimId', 'rationale'],
      additionalProperties: false,
    },
    handler: async (scopeId: string, args: Record<string, unknown>) => {
      const entityId = str(args.entityId, 32);
      const propertyId = str(args.propertyId, 32);
      const chosenClaimId = str(args.chosenClaimId, 96);
      const rationale = str(args.rationale, 600);
      const idempotencyKey = str(args.idempotencyKey, 120);
      const supersedesId = str(args.supersedesId, 64);
      if (!entityId || !propertyId || !chosenClaimId || !rationale) {
        throw new Error('entityId, propertyId, chosenClaimId and rationale are required.');
      }
      const entity = await resolveEntity(scopeId, entityId);
      if (!entity) throw new Error(`Entity ${entityId} is not available.`);
      const dispute = entity.disputes.find((d) => d.propertyId === propertyId);
      if (!dispute) throw new Error(`${entity.label} has no disputed ${propertyId}.`);
      const chosen = dispute.claims.find((c) => c.claimId === chosenClaimId);
      if (!chosen) throw new Error(`${chosenClaimId} is not one of this dispute's claims.`);

      const result = adjudicate({
        entityId: entity.entityId,
        entityLabel: entity.label,
        dispute,
        corroboratingText: corroborationText(entity),
      });
      const { ruling, replayed } = await createRuling(
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
      return { ruling, integrity: await replay(ruling.id), idempotentReplay: replayed };
    },
  },
  revise_ruling: {
    description: 'Amend the rationale on an existing ruling, appending a new sealed audit event.',
    inputSchema: {
      type: 'object',
      properties: { rulingId: { type: 'string' }, rationale: { type: 'string', maxLength: 600 } },
      required: ['rulingId', 'rationale'],
      additionalProperties: false,
    },
    handler: async (scopeId: string, args: Record<string, unknown>) => {
      const rulingId = str(args.rulingId, 64);
      const rationale = str(args.rationale, 600);
      if (!rulingId || !rationale) throw new Error('rulingId and rationale are required.');
      const updated = await updateRuling(rulingId, scopeId, { rationale });
      if (!updated) throw new Error(`Ruling ${rulingId} is missing or already retired.`);
      return { ruling: updated, integrity: await replay(rulingId) };
    },
  },
  retire_ruling: {
    description: 'Soft-delete a ruling. The row and its audit chain are retained so replay still succeeds.',
    inputSchema: {
      type: 'object',
      properties: { rulingId: { type: 'string' } },
      required: ['rulingId'],
      additionalProperties: false,
    },
    handler: async (scopeId: string, args: Record<string, unknown>) => {
      const rulingId = str(args.rulingId, 64);
      if (!rulingId) throw new Error('rulingId is required.');
      const retired = await retireRuling(rulingId, scopeId);
      if (!retired) throw new Error(`Ruling ${rulingId} is missing.`);
      return { ruling: retired, integrity: await replay(rulingId), tombstone: true };
    },
  },
  get_audit_trail: {
    description: 'Return the append-only, hash-chained audit events for one ruling.',
    inputSchema: {
      type: 'object',
      properties: { rulingId: { type: 'string' } },
      required: ['rulingId'],
      additionalProperties: false,
    },
    handler: async (scopeId: string, args: Record<string, unknown>) => {
      const rulingId = str(args.rulingId, 64);
      if (!rulingId) throw new Error('rulingId is required.');
      const ruling = await getRuling(rulingId, scopeId);
      if (!ruling) throw new Error(`Ruling ${rulingId} is missing.`);
      return { events: await getAudit(rulingId), integrity: await replay(rulingId) };
    },
  },
  engine_reference: {
    description: 'Return the published factor weights, verdict bands and engine version.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => ({
      engineVersion: 'precedence-engine@1.0.0',
      weights: FACTOR_WEIGHTS,
      verdictBands: VERDICT_BANDS,
    }),
  },
} as const;

function toolList() {
  const describe = (name: string, def: { description: string; inputSchema: unknown }) => ({
    name,
    description: def.description,
    inputSchema: def.inputSchema,
  });
  return [
    ...Object.entries(READ_TOOLS).map(([n, d]) => ({ ...describe(n, d), annotations: { readOnly: true } })),
    ...Object.entries(MUTATION_TOOLS).map(([n, d]) => ({
      ...describe(n, d),
      annotations: { readOnly: !['record_ruling', 'revise_ruling', 'retire_ruling'].includes(n) },
    })),
  ];
}

export const dynamic = 'force-dynamic';

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0' as const, id: id ?? null, result };
}

function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return { jsonrpc: '2.0' as const, id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

export async function POST(request: Request) {
  const scopeId = await readScopeId();
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 });
  }

  const single = Array.isArray(payload) ? null : payload;
  const batch = Array.isArray(payload) ? payload : null;
  if (!single && !batch) {
    return Response.json(rpcError(null, -32600, 'Invalid Request'), { status: 400 });
  }

  const handle = async (msg: Record<string, unknown>) => {
    const { id, method, params } = msg;
    const args = (params ?? {}) as Record<string, unknown>;

    if (method === 'initialize') {
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'both-sides', version: '1.0.0' },
        instructions:
          'Both Sides adjudicates claims that contradict each other. Call list_disputes, then get_dispute, then adjudicate before record_ruling.',
      });
    }
    if (method === 'notifications/initialized') return null;
    if (method === 'ping') return rpcResult(id, {});

    if (method === 'tools/list') {
      return rpcResult(id, { tools: toolList() });
    }

    if (method === 'tools/call') {
      const name = str(args.name, 64);
      if (!name) return rpcError(id, -32602, 'Invalid params: tool name is required.');
      const callArgs = (args.arguments ?? {}) as Record<string, unknown>;

      const readEntry = Object.entries(READ_TOOLS).find(([n]) => n === name);
      if (readEntry) {
        const handler = readEntry[1].handler as unknown as (
          s: string,
          a: Record<string, unknown>,
        ) => Promise<unknown>;
        try {
          const out = await handler(scopeId, callArgs);
          return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
        } catch (err) {
          return rpcResult(id, toolError(String(err instanceof Error ? err.message : err)));
        }
      }

      const mutEntry = Object.entries(MUTATION_TOOLS).find(([n]) => n === name);
      if (mutEntry) {
        const handler = mutEntry[1].handler as unknown as ToolHandler;
        try {
          const out = await handler(scopeId, callArgs);
          return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
        } catch (err) {
          return rpcResult(id, toolError(String(err instanceof Error ? err.message : err)));
        }
      }
      return rpcError(id, -32601, `Unknown tool: ${name}`);
    }

    return rpcError(id, -32601, `Method not found: ${String(method)}`);
  };

  if (batch) {
    const responses = (await Promise.all(batch.map((m) => handle(m as Record<string, unknown>)))).filter(
      Boolean,
    );
    return Response.json(responses, { status: 200 });
  }

  const response = await handle(single as Record<string, unknown>);
  return Response.json(response, { status: 200 });
}