export interface SqlAdapter {
  kind: 'neon-postgres' | 'postgres-tcp' | 'pglite-embedded';
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
}

interface Schema {
  rulings: {
    id: string;
    scope_id: string;
    entity_id: string;
    entity_label: string;
    property_id: string;
    property_label: string;
    chosen_claim_id: string;
    chosen_value: string;
    rationale: string;
    status: string;
    supersedes_id: string | null;
    engine_version: string;
    score: number;
    margin: number;
    verdict: string;
    created_at: string;
    updated_at: string;
    seal: string;
    share_token: string | null;
  };
  audit_events: {
    ruling_id: string;
    seq: number;
    at: string;
    action: string;
    scope_id: string;
    payload: string;
    prev_seal: string;
    seal: string;
  };
  idempotency: { key: string; scope_id: string; ruling_id: string; created_at: string };
  imported_entities: {
    entity_id: string;
    scope_id: string;
    label: string;
    description: string | null;
    payload: string;
    fetched_at: string;
    source: string;
    created_at: string;
  };
}

const SCHEMA_SQL = `
create table if not exists rulings (
  id text primary key,
  scope_id text not null,
  entity_id text not null,
  entity_label text not null,
  property_id text not null,
  property_label text not null,
  chosen_claim_id text not null,
  chosen_value text not null,
  rationale text not null,
  status text not null,
  supersedes_id text,
  engine_version text not null,
  score double precision not null,
  margin double precision not null,
  verdict text not null,
  created_at text not null,
  updated_at text not null,
  seal text not null,
  share_token text
);
create index if not exists rulings_scope_idx on rulings (scope_id, created_at desc);
create index if not exists rulings_dispute_idx on rulings (entity_id, property_id);
create unique index if not exists rulings_share_idx on rulings (share_token) where share_token is not null;

create table if not exists audit_events (
  ruling_id text not null,
  seq integer not null,
  at text not null,
  action text not null,
  scope_id text not null,
  payload text not null,
  prev_seal text not null,
  seal text not null,
  primary key (ruling_id, seq)
);

create table if not exists idempotency (
  key text primary key,
  scope_id text not null,
  ruling_id text not null,
  created_at text not null
);

create table if not exists imported_entities (
  entity_id text primary key,
  scope_id text not null,
  label text not null,
  description text,
  payload text not null,
  fetched_at text not null,
  source text not null,
  created_at text not null
);
create index if not exists imported_scope_idx on imported_entities (scope_id, created_at desc);
`;

// Route bundles get separate module registries, so the adapter and the schema
// promise are pinned to the process. Without this each route would open its own
// connection and its own empty database.
type AdapterCache = {
  adapterPromise: Promise<SqlAdapter> | null;
  schemaReady: Promise<void> | null;
};
const cache: AdapterCache = ((globalThis as Record<string, unknown>).__bothSidesDb ??= {
  adapterPromise: null,
  schemaReady: null,
}) as AdapterCache;

async function neonAdapter(url: string): Promise<SqlAdapter> {
  // Loaded lazily so the embedded engine never enters a production bundle.
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  return {
    kind: 'neon-postgres',
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await sql.query(text, params as never[]);
      return rows as T[];
    },
    async execute(text: string, params: unknown[] = []) {
      await sql.query(text, params as never[]);
    },
  };
}

async function tcpAdapter(url: string): Promise<SqlAdapter> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 15000 });
  return {
    kind: 'postgres-tcp',
    async query<T>(text: string, params: unknown[] = []) {
      const res = await pool.query(text, params as never[]);
      return res.rows as T[];
    },
    async execute(text: string, params: unknown[] = []) {
      await pool.query(text, params as never[]);
    },
  };
}

async function pgliteAdapter(): Promise<SqlAdapter> {
  const { PGlite } = await import('@electric-sql/pglite');
  // In-memory by default. A file-backed database is opt-in via PGLITE_DIR,
  // because concurrent PGlite instances contend on the directory lock and a
  // second instance would otherwise end up on a different, empty database.
  const dir = process.env.PGLITE_DIR?.trim();
  const db = dir ? await PGlite.create(`file://${dir}`) : await PGlite.create();
  const run = async <T>(text: string, params: unknown[]): Promise<T[]> => {
    const res = await db.query<T>(text, params as unknown[]);
    return res.rows as T[];
  };
  return {
    kind: 'pglite-embedded',
    query: run,
    async execute(text: string, params: unknown[] = []) {
      // exec() cannot bind parameters, so anything parameterised must go
      // through query(). exec() stays for parameterless DDL.
      if (params.length > 0) {
        await db.query(text, params as unknown[]);
        return;
      }
      await db.exec(text);
    },
  };
}

/**
 * Production must never silently fall back to an embedded database: a serverless
 * filesystem is not durable, so a missing DATABASE_URL is a hard failure there.
 */
export function resolveAdapter(): Promise<SqlAdapter> {
  if (!cache.adapterPromise) {
    cache.adapterPromise = (async () => {
      const url = process.env.DATABASE_URL?.trim();
      const isPostgres = !!url && /^postgres(ql)?:\/\//.test(url);

      if (isPostgres) {
        // Neon's serverless driver speaks the HTTP API and cannot reach a plain
        // Postgres server, so the transport is chosen explicitly rather than
        // inferred from the scheme alone.
        const driver = process.env.DATABASE_DRIVER?.trim().toLowerCase();
        const host = /@([^/:]+)/.exec(url)?.[1] ?? '';
        const useHttp =
          driver === 'http' || (driver !== 'tcp' && (host.endsWith('.neon.tech') || driver === 'neon'));
        return useHttp ? await neonAdapter(url!) : await tcpAdapter(url!);
      }

      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_EMBEDDED_DB !== '1') {
        throw new Error(
          'DATABASE_URL is required in production; the embedded adapter is development-only.',
        );
      }
      return pgliteAdapter();
    })();
  }
  return cache.adapterPromise;
}

export async function db(): Promise<SqlAdapter> {
  const a = await resolveAdapter();
  if (!cache.schemaReady) {
    cache.schemaReady = (async () => {
      // Neon's extended protocol rejects multi-statement strings, so DDL is applied
      // one statement at a time. Every statement is idempotent. A cold start can
      // race another invocation on the same statements, so one retry is allowed.
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          for (const raw of SCHEMA_SQL.split(';')) {
            const stmt = raw.trim();
            if (stmt) await a.execute(stmt);
          }
          return;
        } catch (err) {
          if (attempt === 2) throw err;
        }
      }
    })().catch((err) => {
      cache.schemaReady = null;
      throw err;
    });
  }
  await cache.schemaReady;
  return a;
}

export type Db = Schema;

export async function checkPersistence(): Promise<{
  store: string;
  ok: boolean;
  detail: string | null;
}> {
  try {
    const a = await db();
    const rows = await a.query<{ ok: number }>('select 1 as ok');
    return { store: a.kind, ok: rows.length === 1 && rows[0].ok === 1, detail: null };
  } catch (err) {
    return { store: 'unavailable', ok: false, detail: String(err).slice(0, 200) };
  }
}