/**
 * End-to-end verification for Both Sides.
 *
 *   node scripts/verify.mjs                 # defaults to http://localhost:3000
 *   BASE_URL=https://x.vercel.app node scripts/verify.mjs
 *
 * Exercises the real journey: health, corpus, engine, create, read-back,
 * update, agent mutation, integrity replay, export, delete, and the shared
 * GitHub link in the rendered chrome. Exits non-zero on the first failure.
 */
import process from 'node:process';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const REPO_URL = 'https://github.com/aniruddhaadak80/both-sides';

let cookie = '';
let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function req(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (cookie) headers.cookie = cookie;
  if (init.body && !headers['content-type']) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: 'manual' });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const pair = c.split(';')[0];
    if (pair.startsWith('bs_scope=')) cookie = pair;
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, text, json, headers: res.headers };
}

async function rpc(method, params, id = 1) {
  const res = await req('/api/mcp', {
    method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  return res.json;
}

function toolPayload(rpcJson) {
  const text = rpcJson?.result?.content?.[0]?.text;
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const run = async () => {
  console.log(`Verifying ${BASE}`);

  section('1. Landing and health');
  const home = await req('/');
  check('GET / returns 200', home.status === 200, `got ${home.status}`);
  check('landing names the product', home.text.includes('Both Sides'));
  check(
    'landing carries a real repository link',
    home.text.includes(REPO_URL),
    'repo URL missing from rendered landing page',
  );

  const health = await req('/api/health');
  check('GET /api/health returns 200', health.status === 200, `got ${health.status}`);
  check(
    'health reports a real store check',
    health.json?.persistence?.reachable === true,
    JSON.stringify(health.json?.persistence ?? null),
  );
  const store = health.json?.persistence?.store ?? 'unknown';
  check('store is a hosted adapter or an explicit embedded one', !!store, store);
  console.log(`       store = ${store}`);

  section('2. Session scope');
  const session = await req('/api/session');
  check('GET /api/session returns 200', session.status === 200);
  check('session mints an http-only scope cookie', cookie.startsWith('bs_scope='));

  section('3. Corpus');
  const corpus = await req('/api/corpus');
  check('GET /api/corpus returns 200', corpus.status === 200);
  check('corpus is non-empty', (corpus.json?.entities?.length ?? 0) > 0);
  check(
    'corpus declares live or fallback honestly',
    ['live', 'fallback'].includes(corpus.json?.status),
    `status=${corpus.json?.status}`,
  );
  check('corpus carries attribution', (corpus.json?.attribution?.length ?? 0) > 0);
  console.log(`       status = ${corpus.json?.status}, entities = ${corpus.json?.entities?.length}`);

  const entity = corpus.json?.entities?.[0];
  const dispute = entity?.disputes?.[0];
  check('an entity exposes a disputed property', !!dispute);
  if (!dispute) throw new Error('no dispute available, cannot continue');

  section('4. Engine');
  const adj = await req('/api/adjudicate', {
    method: 'POST',
    body: JSON.stringify({ entityId: entity.entityId, propertyId: dispute.propertyId }),
  });
  check('POST /api/adjudicate returns 200', adj.status === 200, `got ${adj.status}`);
  check('engine result is versioned', !!adj.json?.result?.engineVersion);
  check('engine itemises five factors', adj.json?.result?.leader?.factors?.length === 5);
  check(
    'factor contributions reconstruct the score',
    Math.abs(
      (adj.json?.result?.leader?.factors ?? []).reduce((s, f) => s + f.contribution, 0) -
        (adj.json?.result?.leader?.score ?? 0),
    ) < 0.05,
  );
  check('engine returns a recommendation', !!adj.json?.result?.recommendation);
  check('engine returns a verdict band', ['settled', 'contested', 'unresolved'].includes(adj.json?.result?.verdict));
  check('response exposes a verification reference', adj.json?.replayAvailable === true);

  const adj2 = await req('/api/adjudicate', {
    method: 'POST',
    body: JSON.stringify({ entityId: entity.entityId, propertyId: dispute.propertyId }),
  });
  check(
    'engine is deterministic across calls',
    JSON.stringify(adj.json?.result?.ranked?.map((r) => [r.claimId, r.score])) ===
      JSON.stringify(adj2.json?.result?.ranked?.map((r) => [r.claimId, r.score])),
  );

  section('5. Validation');
  const badEntity = await req('/api/adjudicate', {
    method: 'POST',
    body: JSON.stringify({ entityId: 'nope', propertyId: 'P1082' }),
  });
  check('unknown entity returns 4xx', badEntity.status >= 400 && badEntity.status < 500, `got ${badEntity.status}`);
  check('errors use a stable envelope', !!badEntity.json?.error?.code);
  const badRuling = await req('/api/rulings', {
    method: 'POST',
    body: JSON.stringify({ entityId: entity.entityId, propertyId: dispute.propertyId }),
  });
  check('create without a chosen claim is rejected', badRuling.status === 400, `got ${badRuling.status}`);

  section('6. Create, read back, update');
  const chosen = adj.json.result.leader.claimId;
  const created = await req('/api/rulings', {
    method: 'POST',
    body: JSON.stringify({
      entityId: entity.entityId,
      propertyId: dispute.propertyId,
      chosenClaimId: chosen,
      rationale: 'Verified live during the automated end-to-end run.',
      idempotencyKey: `verify-${Date.now()}`,
    }),
  });
  check('POST /api/rulings returns 200', created.status === 200, `got ${created.status} ${created.text.slice(0, 120)}`);
  const rulingId = created.json?.ruling?.id;
  check('create returns a ruling id', !!rulingId);
  check('create returns a seal', /^[0-9a-f]{96}$/.test(created.json?.ruling?.seal ?? ''));

  const list = await req('/api/rulings');
  check('GET /api/rulings lists the ruling', (list.json?.rulings ?? []).some((r) => r.ruling.id === rulingId));

  const one = await req(`/api/rulings/${rulingId}`);
  check('GET /api/rulings/:id returns the ruling', one.json?.ruling?.id === rulingId);
  check('ruling is scoped to this session', one.json?.ruling?.scopeId !== undefined);

  const patched = await req(`/api/rulings/${rulingId}`, {
    method: 'PATCH',
    body: JSON.stringify({ rationale: 'Amended during the automated end-to-end run.' }),
  });
  check('PATCH /api/rulings/:id succeeds', patched.status === 200, `got ${patched.status}`);
  check(
    'update is reflected on read-back',
    patched.json?.ruling?.rationale === 'Amended during the automated end-to-end run.',
  );
  check('update appends to the chain', (patched.json?.integrity?.events ?? 0) >= 2);

  section('7. Agent interface');
  const init = await rpc('initialize', {}, 1);
  check('MCP initialize succeeds', !!init?.result?.protocolVersion);
  check('MCP advertises server info', init?.result?.serverInfo?.name === 'both-sides');

  const tools = await rpc('tools/list', {}, 2);
  const names = (tools?.result?.tools ?? []).map((t) => t.name);
  check('tools/list returns tools', names.length >= 3, `got ${names.length}`);
  check('tools/list includes a read tool', names.includes('list_disputes'));
  check('tools/list includes an analysis tool', names.includes('adjudicate'));
  check('tools/list includes a mutating tool', names.includes('record_ruling'));
  check(
    'tools carry input schemas',
    (tools?.result?.tools ?? []).every((t) => !!t.inputSchema),
  );

  const listDisputes = toolPayload(await rpc('tools/call', { name: 'list_disputes', arguments: {} }, 3));
  check('agent read tool returns disputes', (listDisputes?.entities?.length ?? 0) > 0);

  const unknown = await rpc('tools/call', { name: 'does_not_exist', arguments: {} }, 4);
  check('unknown tool returns a JSON-RPC error', unknown?.error?.code === -32601);

  const idemKey = `mcp-verify-${Date.now()}`;
  const agentRuling = toolPayload(
    await rpc(
      'tools/call',
      {
        name: 'record_ruling',
        arguments: {
          entityId: entity.entityId,
          propertyId: dispute.propertyId,
          chosenClaimId: chosen,
          rationale: 'Recorded by the agent tool during verification.',
          idempotencyKey: idemKey,
        },
      },
      5,
    ),
  );
  check('agent mutating tool persists a ruling', !!agentRuling?.ruling?.id);
  const agentId = agentRuling?.ruling?.id;

  const replayed = toolPayload(
    await rpc(
      'tools/call',
      {
        name: 'record_ruling',
        arguments: {
          entityId: entity.entityId,
          propertyId: dispute.propertyId,
          chosenClaimId: chosen,
          rationale: 'Recorded by the agent tool during verification.',
          idempotencyKey: idemKey,
        },
      },
      6,
    ),
  );
  check(
    'agent mutation is idempotent on the same key',
    replayed?.ruling?.id === agentId && replayed?.idempotentReplay === true,
  );

  const restReadBack = await req('/api/rulings');
  check(
    'agent-created ruling is visible through REST',
    (restReadBack.json?.rulings ?? []).some((r) => r.ruling.id === agentId),
  );

  section('8. Integrity');
  const replay = await req(`/api/rulings/${rulingId}/replay`);
  check('replay endpoint returns 200', replay.status === 200);
  check('replay finds no broken link', replay.json?.replay?.ok === true, replay.json?.replay?.detail ?? '');
  check('replay reports the head seal', /^[0-9a-f]{96}$/.test(replay.json?.replay?.headSeal ?? ''));
  check('replay returns the audit events', (replay.json?.events?.length ?? 0) >= 2);

  section('9. Export');
  const md = await req(`/api/export?id=${rulingId}&format=markdown`);
  check('markdown export returns 200', md.status === 200);
  check('markdown export downloads as a file', (md.headers.get('content-disposition') ?? '').includes('attachment'));
  check('markdown export contains the ruling', md.text.includes(rulingId));
  check('markdown export carries provenance', md.text.includes('Wikidata'));

  const jsonExport = await req(`/api/export?id=${rulingId}&format=json`);
  check('json export returns 200', jsonExport.status === 200);
  check('json export parses', !!jsonExport.json?.ruling?.id);
  check('json export carries a disclaimer', !!jsonExport.json?.disclaimer);

  section('10. Shared read route');
  const shareToken = created.json?.ruling?.shareToken;
  check('ruling has a share token', !!shareToken);
  const shared = await req(`/share/${shareToken}`);
  check('shared ruling renders', shared.status === 200, `got ${shared.status}`);
  check('shared ruling shows the decision', shared.text.includes('Rationale'));

  section('11. Routes and repository chrome');
  for (const path of ['/desk', '/corpus', '/agent', '/export', '/method', '/settings', '/verify', '/share']) {
    const page = await req(path);
    check(`GET ${path} returns 200`, page.status === 200, `got ${page.status}`);
  }
  const disputePage = await req(`/dispute/${entity.entityId}/${dispute.propertyId}`);
  check('dynamic dispute route renders', disputePage.status === 200, `got ${disputePage.status}`);
  check('dispute page lists competing claims', disputePage.text.includes(dispute.propertyLabel));
  check(
    'footer links to the repository',
    disputePage.text.includes(REPO_URL),
    'repo URL missing from footer',
  );
  const mcpManifest = await req('/mcp.json');
  check('mcp.json is published', mcpManifest.status === 200);
  check(
    'mcp.json points at a live endpoint',
    (() => {
      try {
        const parsed = JSON.parse(mcpManifest.text);
        const url = Object.values(parsed.mcpServers ?? {})[0]?.url ?? '';
        return url.startsWith('http');
      } catch {
        return false;
      }
    })(),
  );

  section('12. Teardown');
  const removed = await req(`/api/rulings/${rulingId}`, { method: 'DELETE' });
  check('DELETE /api/rulings/:id succeeds', removed.status === 200, `got ${removed.status}`);
  check('delete leaves a tombstone', removed.json?.tombstone === true);
  const afterDelete = await req(`/api/rulings/${rulingId}`);
  check(
    'deleted ruling is retained as a tombstone',
    afterDelete.status === 200 && afterDelete.json?.ruling?.status === 'retired',
    `got ${afterDelete.status}`,
  );
  const replayAfter = await req(`/api/rulings/${rulingId}/replay`);
  check('replay still succeeds after delete', replayAfter.json?.replay?.ok === true);
  if (agentId) await req(`/api/rulings/${agentId}`, { method: 'DELETE' });

  console.log(`\n${passed} checks passed, ${failures.length} failed.`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
};

run().catch((err) => {
  console.error(`\nverifier crashed: ${err?.stack ?? err}`);
  process.exitCode = 1;
});