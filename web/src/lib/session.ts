import { randomBytes } from 'node:crypto';

import { cookies } from 'next/headers';

export const SCOPE_COOKIE = 'bs_scope';

function newScopeId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Anonymous ownership without accounts. The scope id lives in an HTTP-only cookie
 * so it never reaches client script, and every query is filtered by it.
 */
export async function readScopeId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SCOPE_COOKIE)?.value;
  return existing && /^[0-9a-f]{32}$/.test(existing) ? existing : newScopeId();
}

export function scopeCookieHeader(scopeId: string): string {
  return [
    `${SCOPE_COOKIE}=${scopeId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=31536000',
  ].join('; ');
}

export function isValidScope(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
}