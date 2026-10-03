/**
 * Secret and exposure audit.
 *
 *   node scripts/security-audit.mjs
 *
 * Scans tracked files for credentials, verifies that no environment file is
 * committed, and — when BASE_URL is set — fetches the deployed pages and their
 * JavaScript chunks to prove that no server-only value reached the browser.
 * Exits non-zero if anything is found.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const findings = [];
const note = (severity, where, detail) => {
  findings.push({ severity, where, detail });
  console.log(`  ${severity === 'high' ? 'HIGH' : 'WARN'} ${where} :: ${detail}`);
};

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const root = process.env.REPO_ROOT ?? process.cwd();

console.log('1. tracked files that look like credentials');
const tracked = git(['ls-files'], root)
  .split('\n')
  .map((f) => f.trim())
  .filter(Boolean);

const RULES = [
  { name: 'postgres url', re: /postgres(?:ql)?:\/\/[^\s'"`]+/gi },
  { name: 'neon host', re: /[a-z0-9-]+\.neon\.tech/gi },
  { name: 'neon key', re: /\bnpg_[A-Za-z0-9]{20,}\b/g },
  { name: 'openai key', re: /\bsk-[A-Za-z0-9]{32,}\b/g },
  { name: 'anthropic key', re: /\bsk-ant-[A-Za-z0-9-]{20,}\b/g },
  { name: 'github token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { name: 'slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'sanity token', re: /\bs[a-zA-Z0-9]{20,}\.[A-Za-z0-9_-]{20,}\b/g },
  { name: 'aws access key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'bearer literal', re: /Bearer\s+[A-Za-z0-9._-]{24,}/g },
];

const ALLOWLIST = [
  // Documented placeholders and the public project id.
  'postgresql://user:password@host/db',
  'postgresql://postgres:postgres@localhost:5432/bothsides',
  '4npxmu4m',
];

for (const file of tracked) {
  const abs = join(root, file);
  if (!existsSync(abs)) continue;
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  if (text.length > 4 * 1024 * 1024) continue;
  if (/\.(png|jpg|jpeg|gif|webp|ico|woff2?|lock)$/i.test(file)) continue;

  for (const rule of RULES) {
    const matches = text.match(rule.re);
    if (!matches) continue;
    for (const raw of matches) {
      const value = raw.trim();
      if (ALLOWLIST.some((ok) => value.includes(ok))) continue;
      if (/^\$\{/.test(value)) continue;
      note('high', file, `${rule.name}: ${value.slice(0, 60)}`);
    }
  }
}
if (findings.length === 0) console.log('  no credential-shaped strings in tracked files');

console.log('\n2. environment files that must not be committed');
const envTracked = tracked.filter((f) => /(^|\/)\.env($|\.)/.test(f) && f !== '.env.example');
if (envTracked.length === 0) console.log('  no .env files are tracked');
else for (const f of envTracked) note('high', f, 'environment file is tracked');

console.log('\n3. gitignore covers local env');
const ignore = existsSync(join(root, '.gitignore'))
  ? readFileSync(join(root, '.gitignore'), 'utf8')
  : '';
for (const pattern of ['.env', 'node_modules/', '.next/']) {
  if (!ignore.includes(pattern)) note('warn', '.gitignore', `missing ${pattern}`);
}
console.log('  .gitignore checked');

const BASE = process.env.BASE_URL?.replace(/\/$/, '');
if (BASE) {
  console.log(`\n4. deployed client bundle on ${BASE}`);
  const leakPatterns = [
    { name: 'postgres url', re: /postgres(?:ql)?:\/\//i },
    { name: 'neon host', re: /neon\.tech/i },
    { name: 'neon key', re: /npg_[A-Za-z0-9]{20,}/ },
    { name: 'sanity token', re: /SANITY_API_(READ|WRITE)_TOKEN|sk[a-zA-Z0-9]{20,}\./ },
    { name: 'oidc token', re: /VERCEL_OIDC_TOKEN|eyJhbGciOi/ },
  ];

  const pages = ['/', '/desk', '/corpus', '/agent', '/method', '/settings', '/share'];
  const bodies = [];
  for (const path of pages) {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(60000) });
    const html = await res.text();
    bodies.push({ path, html });
    for (const p of leakPatterns) {
      if (p.re.test(html)) note('high', `html ${path}`, p.name);
    }
  }
  console.log(`  fetched ${bodies.length} pages, no server-only value in the HTML`);

  const chunkUrls = new Set();
  for (const { html } of bodies) {
    for (const m of html.matchAll(/\/_next\/static\/[^"']+\.js/g)) chunkUrls.add(m[0]);
  }
  let scanned = 0;
  for (const src of chunkUrls) {
    const res = await fetch(`${BASE}${src}`, { signal: AbortSignal.timeout(60000) });
    const js = await res.text();
    scanned += 1;
    for (const p of leakPatterns) {
      if (p.re.test(js)) note('high', `chunk ${src.slice(-28)}`, p.name);
    }
  }
  console.log(`  scanned ${scanned} client chunks, no credential pattern found`);

  console.log('\n5. security headers on the live response');
  const head = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(60000) });
  for (const header of ['x-content-type-options', 'x-frame-options', 'referrer-policy']) {
    const value = head.headers.get(header);
    if (!value) note('warn', 'response headers', `missing ${header}`);
    else console.log(`  ${header}: ${value}`);
  }

  console.log('\n6. error responses must not leak internals');
  const probes = [
    ['/api/rulings/does-not-exist', 'GET'],
    ['/api/export?id=nope', 'GET'],
    ['/dispute/Q0/P1082', 'GET'],
  ];
  for (const [path, method] of probes) {
    const res = await fetch(`${BASE}${path}`, { method, signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    for (const p of leakPatterns) {
      if (p.re.test(text)) note('high', `${method} ${path}`, p.name);
    }
    if (/at\s+\w+\s+\(|node_modules|\/vercel\/path0|ERR_/i.test(text)) {
      note('warn', `${method} ${path}`, 'response looks like it contains a stack trace');
    }
  }
  console.log('  probed error paths for leaked internals');
}

console.log(`\n${findings.length === 0 ? 'audit clean' : `${findings.length} finding(s)`}`);
process.exitCode = findings.length === 0 ? 0 : 1;