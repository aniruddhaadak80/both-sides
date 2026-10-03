'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Hit {
  entityId: string;
  label: string;
  description: string | null;
}

type State =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'results'; hits: Hit[] }
  | { kind: 'importing'; entityId: string }
  | { kind: 'imported'; label: string; entityId: string; disputes: number }
  | { kind: 'error'; message: string };

export function ImportPanel() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setState({ kind: 'searching' });
    try {
      const res = await fetch(`/api/entities?q=${encodeURIComponent(query.trim())}`);
      const body = (await res.json()) as { hits?: Hit[] } | { error?: { message?: string } };
      if (!res.ok || !('hits' in body)) {
        setState({
          kind: 'error',
          message: body && 'error' in body ? (body.error?.message ?? 'Search failed.') : 'Search failed.',
        });
        return;
      }
      setState({ kind: 'results', hits: body.hits ?? [] });
    } catch {
      setState({ kind: 'error', message: 'The search request could not reach the server.' });
    }
  }

  async function importEntity(entityId: string) {
    setState({ kind: 'importing', entityId });
    try {
      const res = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityId }),
      });
      const body = (await res.json()) as
        | { entity?: { label: string; entityId: string; disputes: unknown[] } }
        | { error?: { message?: string } };
      if (!res.ok || !('entity' in body) || !body.entity) {
        setState({
          kind: 'error',
          message: body && 'error' in body ? (body.error?.message ?? 'Import failed.') : 'Import failed.',
        });
        return;
      }
      setState({
        kind: 'imported',
        label: body.entity.label,
        entityId: body.entity.entityId,
        disputes: body.entity.disputes.length,
      });
      router.refresh();
    } catch {
      setState({ kind: 'error', message: 'The import request could not reach the server.' });
    }
  }

  const busy = state.kind === 'searching' || state.kind === 'importing';
  const importingId = state.kind === 'importing' ? state.entityId : null;

  return (
    <section className="rounded-lg border border-rule bg-paper p-5">
      <h2 className="font-display text-xl">Import a real entity</h2>
      <p className="mt-1 text-sm text-ink-70">
        Search the upstream knowledge base by name, then import it. The read is live and the result
        is stored for this session.
      </p>

      <form onSubmit={search} className="mt-4 flex flex-wrap gap-2">
        <label htmlFor="entity-search" className="sr-only">
          Search for an entity
        </label>
        <input
          id="entity-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Reykjavik, Montevideo, Kyoto"
          className="min-w-0 flex-1 rounded border border-rule bg-paper-2 px-3 py-2 text-sm"
          maxLength={80}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
        >
          {state.kind === 'searching' ? 'Searching…' : 'Search'}
        </button>
      </form>

      <div aria-live="polite" className="mt-4">
        {state.kind === 'results' ? (
          state.hits.length === 0 ? (
            <p className="text-sm text-ink-70">No entity matched “{query}”.</p>
          ) : (
            <ul className="space-y-2">
              {state.hits.map((hit) => (
                <li
                  key={hit.entityId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-rule px-3 py-2"
                >
                  <span>
                    <span className="font-medium">{hit.label}</span>{' '}
                    <code className="text-xs text-ink-60">{hit.entityId}</code>
                    {hit.description ? (
                      <span className="block text-xs text-ink-70">{hit.description}</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => importEntity(hit.entityId)}
                    disabled={busy}
                    className="rounded border border-felt px-3 py-1.5 text-sm font-medium text-felt disabled:opacity-50"
                  >
                    {importingId === hit.entityId ? 'Importing…' : 'Import'}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {state.kind === 'imported' ? (
          <p className="rounded border border-felt/40 bg-felt/10 p-3 text-sm">
            Imported <strong>{state.label}</strong> ({state.entityId}) with {state.disputes} disputed
            proper{state.disputes === 1 ? 'y' : 'ies'}. Open it from the corpus.
          </p>
        ) : null}

        {state.kind === 'error' ? (
          <p className="rounded border border-vermilion/40 bg-vermilion/10 p-3 text-sm">
            {state.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}