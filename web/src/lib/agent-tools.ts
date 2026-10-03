/**
 * The canonical agent tool manifest.
 *
 * The MCP route, the agent console and the landing statistics all read from
 * here, and a unit test asserts that `tools/list` stays in step. A hardcoded
 * count in a component is how the interface ends up claiming ten tools while
 * the endpoint serves nine.
 */
export interface AgentToolInfo {
  name: string;
  kind: 'read' | 'analysis' | 'write';
  description: string;
}

export const AGENT_TOOLS: readonly AgentToolInfo[] = [
  {
    name: 'list_disputes',
    kind: 'read',
    description: 'Every entity in the corpus with at least one contradicting property.',
  },
  {
    name: 'get_dispute',
    kind: 'read',
    description: 'One property dispute in full, including every claim and its references.',
  },
  {
    name: 'list_rulings',
    kind: 'read',
    description: 'The rulings recorded in the calling session, newest first.',
  },
  {
    name: 'engine_reference',
    kind: 'read',
    description: 'The published factor weights, verdict bands and engine version.',
  },
  {
    name: 'get_audit_trail',
    kind: 'read',
    description: 'The append-only, hash-chained audit events for one ruling.',
  },
  {
    name: 'adjudicate',
    kind: 'analysis',
    description: 'Run the deterministic precedence engine over one dispute.',
  },
  {
    name: 'record_ruling',
    kind: 'write',
    description: 'Persist a ruling that chooses one claim. Idempotent on idempotencyKey.',
  },
  {
    name: 'revise_ruling',
    kind: 'write',
    description: 'Amend a rationale, appending a new sealed audit event.',
  },
  {
    name: 'retire_ruling',
    kind: 'write',
    description: 'Soft-delete a ruling, retaining the chain for replay.',
  },
];

export const AGENT_TOOL_NAMES = AGENT_TOOLS.map((t) => t.name);

export const AGENT_TOOL_COUNT = AGENT_TOOLS.length;

export const MUTATING_TOOL_NAMES = AGENT_TOOLS.filter((t) => t.kind === 'write').map((t) => t.name);