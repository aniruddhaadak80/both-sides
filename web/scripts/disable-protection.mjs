/**
 * Disables Vercel Deployment Protection on the linked project so the production
 * alias is publicly reachable. Reads the Vercel CLI's own stored token at
 * runtime; the token is never printed or written to disk.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import process from 'node:process';

const candidates = [
  join(process.env.APPDATA ?? '', 'com.vercel.cli', 'Data', 'auth.json'),
  join(homedir(), '.local', 'share', 'com.vercel.cli', 'auth.json'),
  join(homedir(), '.vercel', 'auth.json'),
];

let token = null;
for (const path of candidates) {
  if (!existsSync(path)) continue;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed?.token) {
      token = parsed.token;
      break;
    }
  } catch {
    /* try the next location */
  }
}
if (!token) {
  console.error('Could not find a Vercel CLI auth token.');
  process.exit(2);
}

const linkPath = join(process.cwd(), '.vercel', 'project.json');
if (!existsSync(linkPath)) {
  console.error('No .vercel/project.json — run `vercel link` first.');
  process.exit(2);
}
const link = JSON.parse(readFileSync(linkPath, 'utf8'));
const projectId = link.projectId;
const teamId = link.orgId ?? link.teamId;

console.log(`project ${link.projectName} (${projectId})`);

const res = await fetch(`https://api.vercel.com/v9/projects/${projectId}`, {
  method: 'PATCH',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    ssoProtection: null,
    passwordProtection: null,
  }),
});

const body = await res.json();
console.log(`status ${res.status}`);
if (!res.ok) {
  console.error(JSON.stringify(body?.error ?? body).slice(0, 400));
  process.exit(1);
}
console.log(
  `ssoProtection=${JSON.stringify(body?.ssoProtection ?? null)} passwordProtection=${JSON.stringify(
    body?.passwordProtection ?? null,
  )}`,
);
if (teamId) console.log(`team ${teamId}`);