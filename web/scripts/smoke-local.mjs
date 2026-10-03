/**
 * Boots the app locally, runs the end-to-end verifier against it, then shuts it
 * down. One process owns the lifecycle so nothing is left running.
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

const PORT = process.env.PORT ?? '3000';
const BASE = `http://127.0.0.1:${PORT}`;

const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', process.env.MODE === 'start' ? 'start' : 'dev'],
  {
    cwd: process.cwd(),
    env: { ...process.env, PORT, NODE_ENV: process.env.MODE === 'start' ? 'production' : 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let serverLog = '';
server.stdout.on('data', (d) => {
  serverLog += d.toString();
});
server.stderr.on('data', (d) => {
  serverLog += d.toString();
});

async function waitForReady(timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (server.exitCode !== null) {
      throw new Error(`server exited early (code ${server.exitCode})\n${serverLog.slice(-3000)}`);
    }
    try {
      const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(20000) });
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`server did not become ready\n${serverLog.slice(-3000)}`);
}

function runVerifier() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/verify.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, BASE_URL: BASE },
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

let code = 1;
try {
  console.log(`waiting for ${BASE} …`);
  await waitForReady();
  code = await runVerifier();
} catch (err) {
  console.error(String(err?.message ?? err));
} finally {
  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 1500));
  if (server.exitCode === null) server.kill('SIGKILL');
  if (code !== 0) {
    console.log('\n--- server log tail ---');
    console.log(serverLog.slice(-4000));
  }
  process.exit(code);
}