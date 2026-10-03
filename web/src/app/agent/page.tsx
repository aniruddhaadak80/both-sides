import { AgentConsole } from '@/components/AgentConsole';
import { AGENT_TOOLS } from '@/lib/agent-tools';
import { loadCorpus } from '@/lib/corpus';
import { readScopeId } from '@/lib/session';

export const metadata = { title: 'Agent' };
export const dynamic = 'force-dynamic';

export default async function AgentPage() {
  const corpus = await loadCorpus(await readScopeId());
  const first = corpus.entities[0];
  const firstDispute = first?.disputes[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl">Agent console</h1>
      <p className="mt-2 max-w-2xl text-ink-80">
        A live JSON-RPC 2.0 endpoint at <code className="text-sm">/api/mcp</code>. The mutating
        tools call the same service layer the interface uses, and every operation is scoped to this
        anonymous session.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-xl">Tools</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Available MCP tools</caption>
            <thead>
              <tr className="border-b border-rule text-left">
                <th scope="col" className="py-2 pr-3 font-semibold">Tool</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Kind</th>
                <th scope="col" className="py-2 font-semibold">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {AGENT_TOOLS.map((t) => (
                <tr key={t.name} className="border-b border-rule/60">
                  <th scope="row" className="py-2 pr-3 text-left font-mono text-xs">{t.name}</th>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        t.kind === 'write'
                          ? 'bg-vermilion text-paper'
                          : t.kind === 'analysis'
                            ? 'bg-lapis text-paper'
                            : 'bg-felt text-paper'
                      }`}
                    >
                      {t.kind}
                    </span>
                  </td>
                  <td className="py-2 text-ink-80">{t.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-8">
        <AgentConsole
          defaultEntityId={firstDispute ? first.entityId : 'Q35765'}
          defaultPropertyId={firstDispute ? firstDispute.propertyId : 'P1082'}
        />
      </div>
    </div>
  );
}