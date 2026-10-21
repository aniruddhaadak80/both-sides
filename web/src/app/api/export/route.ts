import { fail } from '@/lib/api';
import { ENGINE_VERSION, VERDICT_BANDS } from '@/lib/engine';
import { corroborationText, fetchUpstreamEntity } from '@/lib/upstream';
import { findEntity, loadCorpus } from '@/lib/corpus';
import { getAudit, getRuling, getRulingByShareToken, replay } from '@/lib/repository';
import { readScopeId } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const scopeId = await readScopeId();
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const token = url.searchParams.get('token');
  const format = url.searchParams.get('format') === 'json' ? 'json' : 'markdown';

  // A share token and a session scope are two ways of naming the same authorisation. The
  // shared page already treats a valid token as sufficient to read the ruling, so the
  // download it offers has to work for exactly that audience -- otherwise the page
  // advertises an export the only person it is addressed to cannot use. A token grants
  // nothing extra: it resolves to the same ruling the page has already rendered.
  const ruling = token ? await getRulingByShareToken(token) : id ? await getRuling(id, scopeId) : undefined;

  if (!token && !id) return fail('invalid_request', 'An ?id= or ?token= is required.', 400);
  if (!ruling) {
    return fail('not_found', `No ruling ${id ?? token} belongs to this session.`, 404);
  }

  const [report, events] = await Promise.all([replay(ruling.id), getAudit(ruling.id)]);

  let entity = findEntity(await loadCorpus(scopeId), ruling.entityId);
  if (!entity) {
    const live = await fetchUpstreamEntity(ruling.entityId);
    if (live) {
      entity = {
        entityId: live.entityId,
        label: live.label,
        description: live.description,
        wikipedia: live.wikipedia,
        openstreetmap: live.openstreetmap,
        disputes: live.disputes,
      };
    }
  }
  const dispute = entity?.disputes.find((d) => d.propertyId === ruling.propertyId) ?? null;

  const payload = {
    product: 'Both Sides',
    exportedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    ruling,
    integrity: report,
    auditTrail: events,
    dispute,
    corroborationText: entity ? corroborationText(entity) : '',
    sources: {
      wikipedia: entity?.wikipedia
        ? { title: entity.wikipedia.title, url: entity.wikipedia.url, retrieved: entity.wikipedia.timestamp }
        : null,
      openstreetmap: entity?.openstreetmap
        ? { name: entity.openstreetmap.displayName, id: entity.openstreetmap.osmId }
        : null,
    },
    disclaimer:
      'Both Sides ranks competing claims and records a human ruling. It does not certify that the chosen value is correct, and it is not a substitute for consulting the primary sources.',
  };

  // The ruling can be named by ?id= or resolved from a ?token=. The filename
  // follows the ruling, never the token: a token is the capability that grants
  // the read, and a filename ends up in download folders and shell history.
  const slug = ruling.id;

  if (format === 'json') {
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="both-sides-${slug}.json"`,
      },
    });
  }

  const band = VERDICT_BANDS.find((b) => b.verdict === ruling.verdict);
  const lines: string[] = [
    `# Ruling — ${ruling.entityLabel} · ${ruling.propertyLabel}`,
    '',
    `> ${payload.disclaimer}`,
    '',
    '## Decision',
    '',
    `- **Ruling id:** \`${ruling.id}\``,
    `- **Chosen claim:** \`${ruling.chosenClaimId}\` → **${ruling.chosenValue}**`,
    `- **Status:** ${ruling.status}`,
    `- **Recorded:** ${ruling.createdAt}`,
    `- **Engine:** ${ruling.engineVersion}`,
    `- **Leading score:** ${ruling.score} (margin ${ruling.margin})`,
    `- **Verdict:** ${ruling.verdict} — ${band?.meaning ?? ''}`,
    `- **Required action:** ${band?.action ?? ''}`,
    '',
    '## Rationale',
    '',
    ruling.rationale,
    '',
  ];

  if (dispute) {
    lines.push('## Competing claims', '');
    for (const claim of dispute.claims) {
      const refs = claim.referenceUrls.length ? claim.referenceUrls.join(', ') : 'no reference URL';
      lines.push(
        `- \`${claim.claimId}\` **${claim.value}** — rank ${claim.rank}, ${claim.referenceCount} reference(s), retrieved ${claim.retrieved ?? 'unknown'}`,
      );
      lines.push(`  - references: ${refs}`);
    }
    lines.push('');
  }

  lines.push('## Integrity', '');
  lines.push(`- Replay: **${report.ok ? 'verified' : 'BROKEN'}** across ${report.events} event(s)`);
  lines.push(`- Head seal: \`${report.headSeal}\``);
  if (report.firstBrokenSeq !== null) {
    lines.push(`- First broken link: seq ${report.firstBrokenSeq} — ${report.detail}`);
  }
  lines.push('');
  lines.push('### Chain');
  lines.push('');
  for (const ev of events) {
    lines.push(`${ev.seq}. \`${ev.at}\` **${ev.action}** → seal \`${ev.seal.slice(0, 32)}…\``);
  }
  lines.push('');

  lines.push('## Provenance', '');
  if (payload.sources.wikipedia) {
    lines.push(
      `- Wikipedia: [${payload.sources.wikipedia.title}](${payload.sources.wikipedia.url}) (retrieved ${payload.sources.wikipedia.retrieved})`,
    );
  } else {
    lines.push('- Wikipedia: not available for this entity.');
  }
  if (payload.sources.openstreetmap) {
    lines.push(`- OpenStreetMap: ${payload.sources.openstreetmap.name} (relation ${payload.sources.openstreetmap.id})`);
  } else {
    lines.push('- OpenStreetMap: not available for this entity.');
  }
  lines.push('- Wikidata: structured claims and ranks, CC0 1.0.');
  lines.push('');
  lines.push(
    'Verify the chain yourself: `seal_n = SHA-384(UTF-8(prevSeal) || canonicalJson(event_n))`, genesis `' +
      'both-sides/genesis/v1`' +
      '`.',
  );
  lines.push('');

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="both-sides-${slug}.md"`,
    },
  });
}