import { randomBytes } from 'node:crypto';

import { adjudicate } from './engine';
import { ENGINE_VERSION } from './engine';
import { chainSeal, genesisSeal } from './canonical';
import { db, type Db } from './db';
import { corroborationText } from './upstream';
import type {
  AuditEvent,
  EngineResult,
  Entity,
  ReplayReport,
  Ruling,
  RulingStatus,
} from './types';
import type { UpstreamEntity } from './upstream';

export function newId(): string {
  return `rul_${randomBytes(8).toString('hex')}`;
}

function newShareToken(): string {
  return randomBytes(6).toString('hex');
}

function toRuling(row: Db['rulings']): Ruling {
  return {
    id: row.id,
    scopeId: row.scope_id,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    propertyId: row.property_id,
    propertyLabel: row.property_label,
    chosenClaimId: row.chosen_claim_id,
    chosenValue: row.chosen_value,
    rationale: row.rationale,
    status: row.status as RulingStatus,
    supersedesId: row.supersedes_id,
    engineVersion: row.engine_version,
    score: Number(row.score),
    margin: Number(row.margin),
    verdict: row.verdict as Ruling['verdict'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    seal: row.seal,
    shareToken: row.share_token,
  };
}

export interface CreateRulingInput {
  entity: Pick<Entity, 'entityId' | 'label'>;
  propertyId: string;
  propertyLabel: string;
  disputeKey: string;
  chosenClaimId: string;
  chosenValue: string;
  rationale: string;
  engine: EngineResult;
  supersedesId?: string | null;
}

export async function createRuling(
  scopeId: string,
  input: CreateRulingInput,
  idempotencyKey?: string | null,
): Promise<{ ruling: Ruling; replayed: boolean }> {
  const sql = await db();

  if (idempotencyKey) {
    const existing = await sql.query<Db['idempotency']>(
      'select key, scope_id, ruling_id, created_at from idempotency where key = $1 and scope_id = $2',
      [idempotencyKey, scopeId],
    );
    if (existing.length === 1) {
      const prior = await getRuling(existing[0].ruling_id, scopeId);
      if (prior) return { ruling: prior, replayed: true };
    }
  }

  const id = newId();
  const now = new Date().toISOString();
  const genesis = genesisSeal(id);
  const payload = {
    action: 'create',
    rulingId: id,
    entityId: input.entity.entityId,
    propertyId: input.propertyId,
    chosenClaimId: input.chosenClaimId,
    chosenValue: input.chosenValue,
    engineVersion: input.engine.engineVersion,
    score: input.engine.score,
    margin: input.engine.margin,
    verdict: input.engine.verdict,
    at: now,
  };
  const seal = chainSeal(genesis, payload);

  await sql.execute(
    `insert into rulings (id, scope_id, entity_id, entity_label, property_id, property_label,
      chosen_claim_id, chosen_value, rationale, status, supersedes_id, engine_version, score, margin,
      verdict, created_at, updated_at, seal, share_token)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [
      id,
      scopeId,
      input.entity.entityId,
      input.entity.label,
      input.propertyId,
      input.propertyLabel,
      input.chosenClaimId,
      input.chosenValue,
      input.rationale,
      'active',
      input.supersedesId ?? null,
      ENGINE_VERSION,
      input.engine.score,
      input.engine.margin,
      input.engine.verdict,
      now,
      now,
      seal,
      newShareToken(),
    ],
  );

  await sql.execute(
    `insert into audit_events (ruling_id, seq, at, action, scope_id, payload, prev_seal, seal)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, 1, now, 'create', scopeId, JSON.stringify(payload), genesis, seal],
  );

  if (idempotencyKey) {
    await sql.execute(
      'insert into idempotency (key, scope_id, ruling_id, created_at) values ($1,$2,$3,$4)',
      [idempotencyKey, scopeId, id, now],
    );
  }

  if (input.supersedesId) {
    await sql.execute(
      `update rulings set status = 'superseded', updated_at = $1 where id = $2 and scope_id = $3`,
      [now, input.supersedesId, scopeId],
    );
  }

  const ruling = await getRuling(id, scopeId);
  if (!ruling) throw new Error('ruling vanished immediately after insert');
  return { ruling, replayed: false };
}

export async function listRulings(
  scopeId: string,
  opts: { limit?: number; status?: RulingStatus } = {},
): Promise<Ruling[]> {
  const sql = await db();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const params: unknown[] = [scopeId];
  let where = 'where scope_id = $1';
  if (opts.status) {
    params.push(opts.status);
    where += ` and status = $${params.length}`;
  }
  params.push(limit);
  const rows = await sql.query<Db['rulings']>(
    `select * from rulings ${where} order by created_at desc limit $${params.length}`,
    params,
  );
  return rows.map(toRuling);
}

export async function getRuling(id: string, scopeId: string): Promise<Ruling | null> {
  const sql = await db();
  const rows = await sql.query<Db['rulings']>(
    'select * from rulings where id = $1 and scope_id = $2',
    [id, scopeId],
  );
  return rows.length === 1 ? toRuling(rows[0]) : null;
}

export async function getRulingByShareToken(token: string): Promise<Ruling | null> {
  const sql = await db();
  const rows = await sql.query<Db['rulings']>(
    'select * from rulings where share_token = $1',
    [token],
  );
  return rows.length === 1 ? toRuling(rows[0]) : null;
}

export async function updateRuling(
  id: string,
  scopeId: string,
  patch: { rationale?: string; chosenClaimId?: string; chosenValue?: string; engine?: EngineResult },
): Promise<Ruling | null> {
  const sql = await db();
  const current = await getRuling(id, scopeId);
  if (!current) return null;
  if (current.status === 'retired') return null;

  const now = new Date().toISOString();
  const next = {
    rationale: patch.rationale ?? current.rationale,
    chosenClaimId: patch.chosenClaimId ?? current.chosenClaimId,
    chosenValue: patch.chosenValue ?? current.chosenValue,
    score: patch.engine?.score ?? current.score,
    margin: patch.engine?.margin ?? current.margin,
    verdict: patch.engine?.verdict ?? current.verdict,
  };

  const events = await getAudit(id);
  const prevSeal = events.length > 0 ? events[events.length - 1].seal : genesisSeal(id);
  const payload = { action: 'update', rulingId: id, ...next, at: now };
  const seal = chainSeal(prevSeal, payload);

  await sql.execute(
    `update rulings set rationale = $1, chosen_claim_id = $2, chosen_value = $3, score = $4,
      margin = $5, verdict = $6, updated_at = $7, seal = $8
     where id = $9 and scope_id = $10`,
    [
      next.rationale,
      next.chosenClaimId,
      next.chosenValue,
      next.score,
      next.margin,
      next.verdict,
      now,
      seal,
      id,
      scopeId,
    ],
  );
  await sql.execute(
    `insert into audit_events (ruling_id, seq, at, action, scope_id, payload, prev_seal, seal)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, events.length + 1, now, 'update', scopeId, JSON.stringify(payload), prevSeal, seal],
  );
  return getRuling(id, scopeId);
}

/** Soft delete: the row and its chain survive so a replay stays possible. */
export async function retireRuling(id: string, scopeId: string): Promise<Ruling | null> {
  const sql = await db();
  const current = await getRuling(id, scopeId);
  if (!current) return null;

  const now = new Date().toISOString();
  const events = await getAudit(id);
  const prevSeal = events[events.length - 1].seal;
  const payload = { action: 'retire', rulingId: id, at: now, priorStatus: current.status };
  const seal = chainSeal(prevSeal, payload);

  await sql.execute(
    `update rulings set status = 'retired', updated_at = $1, seal = $2 where id = $3 and scope_id = $4`,
    [now, seal, id, scopeId],
  );
  await sql.execute(
    `insert into audit_events (ruling_id, seq, at, action, scope_id, payload, prev_seal, seal)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, events.length + 1, now, 'retire', scopeId, JSON.stringify(payload), prevSeal, seal],
  );
  return getRuling(id, scopeId);
}

export async function getAudit(rulingId: string): Promise<AuditEvent[]> {
  const sql = await db();
  const rows = await sql.query<Db['audit_events']>(
    'select * from audit_events where ruling_id = $1 order by seq asc',
    [rulingId],
  );
  return rows.map((r) => ({
    seq: Number(r.seq),
    at: r.at,
    action: r.action as AuditEvent['action'],
    scopeId: r.scope_id,
    rulingId: r.ruling_id,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
    prevSeal: r.prev_seal,
    seal: r.seal,
  }));
}

/** Recomputes every seal and names the first broken link. */
export async function replay(rulingId: string): Promise<ReplayReport> {
  const events = await getAudit(rulingId);
  if (events.length === 0) {
    return {
      rulingId,
      ok: false,
      events: 0,
      headSeal: '',
      firstBrokenSeq: null,
      detail: 'No audit events exist for this ruling.',
    };
  }
  let prev = genesisSeal(rulingId);
  for (const ev of events) {
    const expected = chainSeal(prev, ev.payload);
    if (expected !== ev.seal) {
      return {
        rulingId,
        ok: false,
        events: events.length,
        headSeal: ev.seal,
        firstBrokenSeq: ev.seq,
        detail: `Seal mismatch at seq ${ev.seq}: recomputed ${expected.slice(0, 16)}… but stored ${ev.seal.slice(0, 16)}…`,
      };
    }
    if (ev.prevSeal !== prev) {
      return {
        rulingId,
        ok: false,
        events: events.length,
        headSeal: ev.seal,
        firstBrokenSeq: ev.seq,
        detail: `Broken link at seq ${ev.seq}: prevSeal ${ev.prevSeal.slice(0, 16)}… does not match the previous seal ${prev.slice(0, 16)}…`,
      };
    }
    prev = ev.seal;
  }
  return {
    rulingId,
    ok: true,
    events: events.length,
    headSeal: prev,
    firstBrokenSeq: null,
    detail: null,
  };
}

export async function saveImportedEntity(scopeId: string, entity: UpstreamEntity): Promise<void> {
  const sql = await db();
  const now = new Date().toISOString();
  await sql.execute(
    `insert into imported_entities (entity_id, scope_id, label, description, payload, fetched_at, source, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (entity_id) do update set payload = excluded.payload, fetched_at = excluded.fetched_at`,
    [
      entity.entityId,
      scopeId,
      entity.label,
      entity.description,
      JSON.stringify(entity),
      entity.fetchedAt,
      entity.source,
      now,
    ],
  );
}

export async function listImportedEntities(scopeId: string): Promise<UpstreamEntity[]> {
  const sql = await db();
  const rows = await sql.query<Db['imported_entities']>(
    'select * from imported_entities where scope_id = $1 order by created_at desc',
    [scopeId],
  );
  return rows.map((r) => JSON.parse(r.payload) as UpstreamEntity);
}

export async function deleteImportedEntity(entityId: string, scopeId: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql.query<Db['imported_entities']>(
    'delete from imported_entities where entity_id = $1 and scope_id = $2 returning entity_id',
    [entityId, scopeId],
  );
  return rows.length === 1;
}

export function runEngine(entity: Entity, propertyId: string): EngineResult | null {
  const dispute = entity.disputes.find((d) => d.propertyId === propertyId);
  if (!dispute) return null;
  return adjudicate({
    entityId: entity.entityId,
    entityLabel: entity.label,
    dispute,
    corroboratingText: corroborationText(entity),
  });
}