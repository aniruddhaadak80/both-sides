/** Hammers ruling creation to capture an intermittent failure body. */
const BASE = process.env.BASE_URL ?? 'https://both-sides-eta.vercel.app';

const corpus = await (await fetch(`${BASE}/api/corpus`)).json();
const entity = corpus.entities[0];
const dispute = entity.disputes[0];

let ok = 0;
const bad = [];

for (let i = 0; i < 24; i += 1) {
  const session = await fetch(`${BASE}/api/session`);
  const cookie = (session.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith('bs_scope='));

  const adj = await (
    await fetch(`${BASE}/api/adjudicate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ entityId: entity.entityId, propertyId: dispute.propertyId }),
    })
  ).json();
  const chosen = adj.result?.leader?.claimId;
  if (!chosen) {
    bad.push({ i, status: 'no-leader', body: JSON.stringify(adj).slice(0, 200) });
    continue;
  }

  const res = await fetch(`${BASE}/api/rulings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      entityId: entity.entityId,
      propertyId: dispute.propertyId,
      chosenClaimId: chosen,
      rationale: `hammer attempt ${i}`,
      idempotencyKey: `hammer-${Date.now()}-${i}`,
    }),
  });
  const text = await res.text();
  if (res.status === 200) {
    ok += 1;
  } else {
    bad.push({ i, status: res.status, body: text.slice(0, 500) });
  }
  process.stdout.write(`${i}:${res.status} `);
}

console.log(`\n\nok=${ok} bad=${bad.length}`);
for (const b of bad) console.log(JSON.stringify(b, null, 2));