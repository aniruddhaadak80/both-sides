'use client';

import { useEffect } from 'react';

/**
 * Establishes the anonymous ownership cookie on first visit. Server components
 * cannot set cookies, so the scope is minted here and every later request,
 * including the ones the server renders, filters by it.
 */
export function ScopeBootstrap() {
  useEffect(() => {
    if (document.cookie.includes('bs_scope=')) return;
    void fetch('/api/session', { credentials: 'same-origin' }).catch(() => {
      /* the next navigation will retry */
    });
  }, []);
  return null;
}