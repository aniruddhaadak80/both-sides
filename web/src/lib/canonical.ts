import { createHash } from 'node:crypto';

/**
 * Deterministic JSON: object keys sorted recursively, arrays order-preserved.
 * `undefined` members are dropped so two structurally equal payloads always
 * serialise to the same bytes.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'number' && !Number.isFinite(value) ? null : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => canonicalize(v === undefined ? null : v));
  }
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const member = source[key];
    if (member === undefined) continue;
    out[key] = canonicalize(member);
  }
  return out;
}

export const GENESIS = 'both-sides/genesis/v1';

export function genesisSeal(scopeId: string): string {
  return sha384Hex(`${GENESIS}:${scopeId}`);
}

/** seal_n = SHA-384( UTF-8(prevSeal) || canonicalJson(event_n) ) */
export function chainSeal(prevSeal: string, event: unknown): string {
  return sha384Hex(`${prevSeal}${canonicalJson(event)}`);
}

export function sha384Hex(input: string): string {
  return createHash('sha384').update(Buffer.from(input, 'utf8')).digest('hex');
}