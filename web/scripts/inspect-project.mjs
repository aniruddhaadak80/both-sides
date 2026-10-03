import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const authPath = join(process.env.APPDATA ?? '', 'com.vercel.cli', 'Data', 'auth.json');
const token = JSON.parse(readFileSync(authPath, 'utf8')).token;
const link = JSON.parse(readFileSync(join(process.cwd(), '.vercel', 'project.json'), 'utf8'));

const res = await fetch(`https://api.vercel.com/v9/projects/${link.projectId}`, {
  headers: { authorization: `Bearer ${token}` },
});
const p = await res.json();

for (const key of [
  'framework',
  'rootDirectory',
  'buildCommand',
  'outputDirectory',
  'installCommand',
  'devCommand',
  'nodeVersion',
  'includeFilesOutsideRoot',
]) {
  console.log(`${key} = ${JSON.stringify(p?.[key] ?? null)}`);
}
console.log(`builds = ${JSON.stringify(p?.builds ?? null)}`);
console.log(`git = ${JSON.stringify(p?.link ?? null)}`);