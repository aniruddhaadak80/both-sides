/**
 * Boots a production build and asserts the security headers are present.
 * Uses ALLOW_EMBEDDED_DB so no database is required.
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

const PORT = process.env.PORT ?? '3111';
const BASE = `http://127.0.0.1:${PORT}`;

const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT, ALLOW_EMBEDDED_DB: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (d) => {
  log += d;
});
server.stderr.on('data', (d) => {
  log += d;
});

const REQUIRED = {
  'content-security-policy': 'default-src',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin',
  'permissions-policy': 'camera=',
  'cross-origin-opener-policy': 'same-origin',
  'strict-transport-security': 'max-age=',
  'x-dns-prefetch-control': 'off',
};

let code = 1;
try {
  const started = Date.now();
  let ready = false;
  let lastStatus = null;
  let lastBody = '';
  while (Date.now() - started < 60000) {
    try {
      const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(15000) });
      lastStatus = res.status;
      lastBody = (await res.text()).slice(0, 300);
      if (res.status < 500) {
        ready = true;
        break;
      }
    } catch (err) {
      lastStatus = `THROW ${String(err).slice(0, 120)}`;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!ready) {
    throw new Error(`server not ready: last=${lastStatus} body=${lastBody}\n${log.slice(-1200)}`);
  }

  const health = await (await fetch(`${BASE}/api/health`)).json();
  console.log(`store = ${health?.persistence?.store}`);

  const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(30000) });
  console.log(`GET / -> ${res.status}\n`);
  let missing = 0;
  for (const [header, needle] of Object.entries(REQUIRED)) {
    const value = res.headers.get(header);
    const pass = !!value && value.toLowerCase().includes(needle.toLowerCase());
    if (!pass) missing += 1;
    console.log(`  ${pass ? 'ok  ' : 'MISS'} ${header}: ${value ?? '(absent)'}`);
  }

  const csp = res.headers.get('content-security-policy') ?? '';
  for (const directive of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'"]) {
    const pass = csp.includes(directive);
    if (!pass) missing += 1;
    console.log(`  ${pass ? 'ok  ' : 'MISS'} csp contains ${directive}`);
  }

  console.log(`\n${missing === 0 ? 'all security headers present' : `${missing} missing`}`);
  code = missing === 0 ? 0 : 1;
} catch (err) {
  console.error(String(err?.message ?? err));
} finally {
  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 1200));
  if (server.exitCode === null) server.kill('SIGKILL');
  process.exit(code);
}