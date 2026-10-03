'use client';

import { useState } from 'react';

interface LogEntry {
  id: number;
  label: string;
  request: string;
  response: string;
  ok: boolean;
}

let counter = 0;

export function AgentConsole({
  defaultEntityId,
  defaultPropertyId,
}: {
  defaultEntityId: string;
  defaultPropertyId: string;
}) {
  const [entityId, setEntityId] = useState(defaultEntityId);
  const [propertyId, setPropertyId] = useState(defaultPropertyId);
  const [rationale, setRationale] = useState('Ruled on the reference with the most independent citations.');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  async function call(label: string, body: unknown) {
    setBusy(true);
    const requestText = JSON.stringify(body, null, 2);
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const text = JSON.stringify(data, null, 2);
      setLog((prev) => [
        { id: ++counter, label, request: requestText, response: text, ok: res.ok },
        ...prev,
      ]);
    } catch (err) {
      setLog((prev) => [
        {
          id: ++counter,
          label,
          request: requestText,
          response: String(err),
          ok: false,
        },
        ...prev,
      ]);
    } finally {
      setBusy(false);
    }
  }

  const initialize = () =>
    call('initialize', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });

  const toolsList = () => call('tools/list', { jsonrpc: '2.0', id: 2, method: 'tools/list' });

  const adjudicate = () =>
    call('tools/call · adjudicate', {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'adjudicate', arguments: { entityId, propertyId } },
    });

  const recordRuling = () =>
    call('tools/call · record_ruling', {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'record_ruling',
        arguments: {
          entityId,
          propertyId,
          chosenClaimId: `${entityId}-${propertyId}-1`,
          rationale,
          idempotencyKey: `console-${entityId}-${propertyId}-${rationale.slice(0, 24)}`,
        },
      },
    });

  const listTools = () =>
    call('tools/call · list_disputes', {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'list_disputes', arguments: {} },
    });

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-rule bg-paper p-5">
        <h2 className="font-display text-xl">Try a call</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-ink-60">entityId</span>
            <input
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="mt-1 w-full rounded border border-rule bg-paper-2 px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-ink-60">propertyId</span>
            <input
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="mt-1 w-full rounded border border-rule bg-paper-2 px-3 py-2 font-mono text-sm"
            />
          </label>
        </div>
        <label className="mt-3 block text-sm">
          <span className="block text-xs uppercase tracking-wide text-ink-60">rationale</span>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={2}
            maxLength={600}
            className="mt-1 w-full rounded border border-rule bg-paper-2 px-3 py-2 text-sm"
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ['initialize', initialize],
            ['tools/list', toolsList],
            ['list_disputes', listTools],
            ['adjudicate', adjudicate],
            ['record_ruling', recordRuling],
          ].map(([label, fn]) => (
            <button
              key={label as string}
              type="button"
              disabled={busy}
              onClick={fn as () => void}
              className="rounded border border-felt px-3 py-1.5 text-sm font-medium text-felt disabled:opacity-50"
            >
              {label as string}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-60">
          record_ruling uses claim id <code>{entityId || 'Q…'}-{propertyId || 'P…'}-1</code>; change
          entityId and propertyId to a real dispute first.
        </p>
      </section>

      <section>
        <h2 className="font-display text-xl">Calls</h2>
        {log.length === 0 ? (
          <p className="mt-2 rounded border border-rule bg-paper-2/60 p-4 text-sm text-ink-70">
            No calls yet. Start with <code>initialize</code>.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {log.map((entry) => (
              <li key={entry.id} className="rounded border border-rule bg-paper">
                <div className="flex items-center justify-between gap-2 border-b border-rule px-4 py-2">
                  <span className="font-medium">{entry.label}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${
                      entry.ok ? 'bg-felt text-paper' : 'bg-vermilion text-paper'
                    }`}
                  >
                    {entry.ok ? 'OK' : 'ERROR'}
                  </span>
                </div>
                <details className="px-4 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-ink-60">
                    Request and response
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-ink p-3 text-[11px] leading-relaxed text-paper">
{`→ ${entry.request}

← ${entry.response}`}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}