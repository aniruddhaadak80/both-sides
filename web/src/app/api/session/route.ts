import { readCookieScope, withScope } from '@/lib/api';
import { readScopeId, scopeCookieHeader } from '@/lib/session';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/** Mints the anonymous ownership scope that every other endpoint filters by. */
export async function GET(request: Request) {
  const fromCookie = readCookieScope(request);
  const store = await cookies();
  const fromNext = store.get('bs_scope')?.value;
  const scopeId = fromCookie ?? (fromNext && /^[0-9a-f]{32}$/.test(fromNext) ? fromNext : null) ?? (await readScopeId());

  const response = withScope({ scopeId }, scopeId);
  response.headers.append('set-cookie', scopeCookieHeader(scopeId));
  return response;
}