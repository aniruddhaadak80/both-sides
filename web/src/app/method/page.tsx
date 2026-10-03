import { FACTOR_WEIGHTS, VERDICT_BANDS } from '@/lib/engine';
import { site } from '@/lib/site';

export const metadata = { title: 'Method' };

export default function MethodPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl">Method</h1>
      <p className="mt-2 text-ink-80">
        How a claim wins, how a ruling is sealed, and what the engine deliberately refuses to do.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-2xl">The five factors</h2>
        <p className="mt-1 text-sm text-ink-70">
          Each factor is normalised to 0–1, multiplied by its weight, and scaled to 100 points. The
          weights sum to exactly 1.
        </p>
        <table className="mt-4 w-full border-collapse text-sm">
          <caption className="sr-only">Factor weights and what each one measures</caption>
          <thead>
            <tr className="border-b border-rule text-left">
              <th scope="col" className="py-2 pr-3 font-semibold">
                Factor
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Weight
              </th>
              <th scope="col" className="py-2 font-semibold">
                What it measures
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              ['editorialRank', 'Upstream editor preference: preferred, normal or deprecated.'],
              ['evidenceDepth', 'How many independent references are attached to the claim.'],
              ['corroboration', 'Whether the second source quotes a matching figure.'],
              ['recency', 'How recently the reference was retrieved, decaying over 12 years.'],
              ['specificity', 'Whether the statement is a precise measurement or a vague band.'],
            ].map(([key, description]) => (
              <tr key={key} className="border-b border-rule/60">
                <th scope="row" className="py-2 pr-3 text-left font-mono text-xs">
                  {key}
                </th>
                <td className="py-2 pr-3 font-mono tabular-nums">
                  {FACTOR_WEIGHTS[key as keyof typeof FACTOR_WEIGHTS].toFixed(2)}
                </td>
                <td className="py-2 text-ink-80">{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Verdict bands</h2>
        <p className="mt-1 text-sm text-ink-70">
          The margin is the gap between the leader and the runner-up.
        </p>
        <ul className="mt-3 space-y-2">
          {VERDICT_BANDS.map((band) => (
            <li key={band.verdict} className="rounded border border-rule bg-paper p-3">
              <p className="font-medium">
                {band.verdict} — margin ≥ {band.minMargin.toFixed(2)}
              </p>
              <p className="mt-0.5 text-sm text-ink-70">{band.meaning}</p>
              <p className="mt-0.5 text-sm">Required action: {band.action}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Two rules the engine will not bend</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-80">
          <li>
            <strong>A deprecated claim cannot govern.</strong> Upstream editors marking a claim
            deprecated is an explicit rejection, so it is barred while any active claim exists,
            however many references it carries.
          </li>
          <li>
            <strong>Ties break on claim id.</strong> Identical scores are ordered by reference count
            and then lexicographically by claim id, so two runs on the same input always produce the
            same ranking.
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">How the chain is sealed</h2>
        <pre className="mt-2 overflow-x-auto rounded bg-ink p-4 text-xs text-paper">
{`seal_0 = SHA-384("both-sides/genesis/v1:" + scopeId)
seal_n = SHA-384( UTF-8(seal_{n-1}) || canonicalJson(event_n) )

canonicalJson sorts object keys recursively and drops
undefined members, so equal payloads hash equally.`}
        </pre>
        <p className="mt-2 text-sm text-ink-80">
          Every create, update and retire appends one event. Replaying the chain recomputes each
          seal and reports the first link that does not match. Deleting a ruling keeps a tombstone,
          so the replay still works after a removal.
        </p>
      </section>

      <section className="mt-10 rounded border border-rule bg-paper-2/70 p-4 text-sm text-ink-80">
        <p>
          <strong>What this is not.</strong> Both Sides ranks claims and records a human decision.
          It does not verify that the chosen value is true, and a high score is not a correctness
          guarantee. Check the primary sources before relying on a ruling.
        </p>
        <p className="mt-2">
          The engine is deterministic and versioned as{' '}
          <code className="text-xs">{site.name}</code> engine <code className="text-xs">1.0.0</code>,
          and the same function backs the UI, the REST endpoint and the agent tool.
        </p>
      </section>
    </div>
  );
}