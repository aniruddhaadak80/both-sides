'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { RankedClaim } from '@/lib/types';

export function RulingForm({
  entityId,
  propertyId,
  claims,
  leaderId,
}: {
  entityId: string;
  propertyId: string;
  claims: RankedClaim[];
  leaderId: string | undefined;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string>(leaderId ?? claims[0]?.claimId ?? '');
  const [rationale, setRationale] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'error' | 'done'>('idle');
  const [message, setMessage] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) {
      setState('error');
      setMessage('Choose which claim governs.');
      return;
    }
    if (rationale.trim().length < 8) {
      setState('error');
      setMessage('Write a short rationale so this ruling can be reviewed later.');
      return;
    }
    setState('saving');
    setMessage('');
    try {
      const res = await fetch('/api/rulings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entityId,
          propertyId,
          chosenClaimId: chosen,
          rationale: rationale.trim(),
          idempotencyKey: `${entityId}:${propertyId}:${chosen}:${rationale.trim().slice(0, 40)}`,
        }),
      });
      const body = (await res.json()) as { ruling?: { id: string }; error?: { message?: string } };
      if (!res.ok || !body.ruling) {
        setState('error');
        setMessage(body.error?.message ?? 'The ruling could not be saved.');
        return;
      }
      setState('done');
      setMessage(`Recorded as ${body.ruling.id}. The chain now has one sealed event.`);
      router.refresh();
    } catch {
      setState('error');
      setMessage('The save request could not reach the server.');
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-rule bg-paper p-5">
      <h2 className="font-display text-xl">Rule on it</h2>
      <p className="mt-1 text-sm text-ink-70">
        Pick the claim that governs and say why. The engine result and a SHA-384 seal are stored
        with your ruling.
      </p>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-ink-60">
          Governing claim
        </legend>
        <div className="mt-2 space-y-2">
          {claims.map((claim) => (
            <label
              key={claim.claimId}
              className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 ${
                chosen === claim.claimId ? 'border-felt bg-felt/8' : 'border-rule'
              }`}
            >
              <input
                type="radio"
                name="chosen"
                value={claim.claimId}
                checked={chosen === claim.claimId}
                onChange={() => setChosen(claim.claimId)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{claim.value}</span>
                <span className="block text-xs text-ink-70">
                  {claim.claimId} · score {claim.score.toFixed(2)}
                  {claim.eligible ? '' : ' · barred from governing'}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4">
        <label htmlFor="rationale" className="text-sm font-semibold uppercase tracking-wide text-ink-60">
          Rationale
        </label>
        <textarea
          id="rationale"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="Why does this claim govern? Cite the reference you relied on."
          className="mt-2 w-full rounded border border-rule bg-paper-2 px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={state === 'saving'}
        className="mt-4 rounded bg-felt px-4 py-2 text-sm font-medium text-paper hover:bg-felt-80 disabled:opacity-50"
      >
        {state === 'saving' ? 'Recording…' : 'Record ruling'}
      </button>

      <p aria-live="polite" className="mt-3 text-sm">
        {message ? (
          <span className={state === 'error' ? 'text-vermilion' : 'text-felt'}>{message}</span>
        ) : null}
      </p>
    </form>
  );
}