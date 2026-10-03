/** Concurrent load test: does parallel traffic trigger the intermittent 500? */
const BASE = process.env.BASE_URL ?? 'https://both-sides-eta.vercel.app';
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 12);
const ROUNDS = Number(process.env.ROUNDS ?? 3);

const corpus = await (await fetch(`${BASE}/api/corpus`)).json();
const entity = corpus.entities[0];
const dispute = entity.disputes[0];

const statuses = {};
const bodies = [];

async function one(i) {
  const session = await fetch(`${BASE}/api/session`);
  const cookie = (session.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith('bs_scope='));

  const res = await fetch(`${BASE}/api/rulings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      entityId: entity.entityId,
      propertyId: dispute.propertyId,
      chosenClaimId: `${entity.entityId}-${dispute.propertyId}-1`,
      rationale: `concurrent probe ${i}`,
      idempotencyKey: `conc-${Date.now()}-${i}`,
    }),
  });
  const text = await res.text();
  statuses[res.status] = (statuses[res.status] ?? 0) + 1;
  if (res.status >= 400) bodies.push(`HTTP ${res.status}: ${text.slice(0, 300)}`);
}

for (let round = 0; round < ROUNDS; round += 1) {
  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => one(`${round}-${i}`).catch((e) => {
      statuses.THROW = (statuses.THROW ?? 0) + 1;
      bodies.push(`THROW ${String(e).slice(0, 160)}`);
    })),
  );
  console.log(`round ${round} done`, JSON.stringify(statuses));
}

console.log(`\nstatuses ${JSON.stringify(statuses)}`);
for (const b of bodies.slice(0, 6)) console.log(b);