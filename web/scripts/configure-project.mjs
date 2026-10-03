import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const authPath = join(process.env.APPDATA ?? '', 'com.vercel.cli', 'Data', 'auth.json');
const token = JSON.parse(readFileSync(authPath, 'utf8')).token;
const link = JSON.parse(readFileSync(join(process.cwd(), '.vercel', 'project.json'), 'utf8'));

const res = await fetch(`https://api.vercel.com/v9/projects/${link.projectId}`, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    framework: 'nextjs',
    nodeVersion: '22.x',
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
  `framework=${body.framework} nodeVersion=${body.nodeVersion} ssoProtection=${JSON.stringify(
    body.ssoProtection ?? null,
  )}`,
);