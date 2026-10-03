import { NextResponse } from 'next/server';

import { isValidScope, SCOPE_COOKIE, scopeCookieHeader } from './session';
import type { ApiError } from './types';

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(code: string, message: string, status: number, details?: Record<string, unknown>): NextResponse {
  const body: ApiError = { error: { code, message, ...(details ? { details } : {}) } };
  return NextResponse.json(body, { status });
}

export function readCookieScope(request: Request): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SCOPE_COOKIE) {
      const value = rest.join('=');
      return isValidScope(value) ? value : null;
    }
  }
  return null;
}

export function withScope<T>(data: T, scopeId: string): NextResponse {
  return NextResponse.json(data, { headers: { 'set-cookie': scopeCookieHeader(scopeId) } });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function clampString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}