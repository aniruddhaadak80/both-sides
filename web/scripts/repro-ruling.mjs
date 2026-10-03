/**
 * Reproduces a ruling creation failure with a fresh anonymous session so the
 * server-side error is visible in the response instead of the interface.
 */
const BASE = process.env.BASE_URL ?? 'https://both-sides-eta.vercel.app';

const corpus = await (await fetch(`${BASE}/api/corpus`)).json();
const entity = corpus.entities[0];
const dispute = entity.disputes[0];
console.log(`entity ${entity.entityId} property ${dispute.propertyId}`);

const session = await fetch(`${BASE}/api/session`);
const cookie = (session.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(';')[0])
  .filter((c) => c.startsWith('bs_scope='))[0];
console.log(`cookie ${cookie ? 'acquired' : 'MISSING'}`);

const adj = await (
  await fetch(`${BASE}/api/adjudicate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ entityId: entity.entityId, propertyId: dispute.propertyId }),
  })
).json();
const chosen = adj.result.leader.claimId;

// Exactly what the browser form sends.
const body = {
  entityId: entity.entityId,
  propertyId: dispute.propertyId,
  chosenClaimId: chosen,
  rationale: 'Recorded in the automated browser pass against production.',
  idempotencyKey: `${entity.entityId}:${dispute.propertyId}:${chosen}:Recorded in the automated browser pass`,
};

const res = await fetch(`${BASE}/api/rulings`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(`status ${res.status}`);
console.log(text.slice(0, 1200));

// Now the same request without an idempotency key, to isolate the variable.
const res2 = await fetch(`${BASE}/api/rulings`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ ...body, idempotencyKey: undefined }),
});
console.log(`\nwithout idempotencyKey -> ${res2.status}`);
console.log((await res2.text()).slice(0, 400));