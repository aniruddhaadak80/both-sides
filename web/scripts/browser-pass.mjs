/**
 * Real browser pass against the deployed app: captures screenshots on desktop
 * and mobile, walks the primary journey with visible controls, checks keyboard
 * focus, and fails on any console error or failed request.
 *
 *   BASE_URL=https://both-sides-eta.vercel.app node scripts/browser-pass.mjs
 */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../docs/screenshots');
const BASE = (process.env.BASE_URL ?? 'https://both-sides-eta.vercel.app').replace(/\/$/, '');

const problems = [];
const shots = [];

async function shoot(page, name, opts = {}) {
  const path = resolve(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: opts.fullPage ?? false });
  shots.push(name);
  console.log(`  shot  ${name}`);
}

const run = async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  const corpus = await (await fetch(`${BASE}/api/corpus`)).json();
  const entity = corpus.entities?.[0];
  const dispute = entity?.disputes?.[0];
  if (!dispute) throw new Error('no dispute available in the corpus');

  const consoleErrors = [];
  const failedRequests = [];

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${page.url()} :: ${m.text().slice(0, 200)}`);
  });
  page.on('requestfailed', (r) => {
    const url = r.url();
    const reason = r.failure()?.errorText ?? 'failed';
    // Next cancels in-flight App Router prefetches on navigation. That is
    // expected and is not a broken request.
    const isCancelledPrefetch = reason.includes('ERR_ABORTED') && url.includes('_rsc=');
    if (isCancelledPrefetch) return;
    failedRequests.push(`${url.slice(0, 140)} :: ${reason}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.url().slice(0, 140)} :: HTTP ${r.status()}`);
  });

  console.log('\ndesktop 1440x900');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 90000 });
  await shoot(page, '01-landing-desktop', { fullPage: true });

  // The landing page must show a real contradiction, not placeholder copy.
  const bodyText = await page.textContent('body');
  if (!/claims/i.test(bodyText ?? '')) problems.push('landing does not mention competing claims');
  if (!/GitHub/i.test(bodyText ?? '')) problems.push('landing has no GitHub reference');

  await page.goto(`${BASE}/desk`, { waitUntil: 'networkidle', timeout: 90000 });
  await shoot(page, '02-desk-desktop');

  await page.goto(`${BASE}/dispute/${entity.entityId}/${dispute.propertyId}`, {
    waitUntil: 'networkidle',
    timeout: 90000,
  });
  await shoot(page, '03-dispute-desktop', { fullPage: true });
  const disputeText = await page.textContent('body');
  if (!disputeText?.includes(dispute.propertyLabel)) {
    problems.push('dispute page does not show the property under dispute');
  }

  // Record a ruling through the visible form.
  const rationale = page.locator('#rationale');
  if (await rationale.count()) {
    await rationale.fill('Recorded in the automated browser pass against production.');
    const firstRadio = page.locator('input[name="chosen"]').first();
    if (await firstRadio.count()) await firstRadio.check();
    await page.getByRole('button', { name: /record ruling/i }).click();
    await page.waitForTimeout(3500);
    const msg = await page.textContent('body');
    if (!/Recorded as|Recorded as rul_/i.test(msg ?? '')) {
      problems.push('submitting the ruling form did not report success');
    }
    await shoot(page, '04-ruling-recorded');
  } else {
    problems.push('ruling form not found on the dispute page');
  }

  await page.goto(`${BASE}/agent`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.getByRole('button', { name: 'tools/list', exact: true }).click();
  await page.waitForTimeout(4000);
  await shoot(page, '05-agent-console', { fullPage: true });
  const agentText = await page.textContent('body');
  if (!/list_disputes|record_ruling/.test(agentText ?? '')) {
    problems.push('agent console did not render tool output');
  }

  await page.goto(`${BASE}/corpus`, { waitUntil: 'networkidle', timeout: 90000 });
  await shoot(page, '06-corpus-desktop');

  await page.goto(`${BASE}/method`, { waitUntil: 'networkidle', timeout: 90000 });
  await shoot(page, '07-method-desktop', { fullPage: true });

  await page.goto(`${BASE}/verify`, { waitUntil: 'networkidle', timeout: 90000 });
  await shoot(page, '08-verify-desktop');

  // Keyboard focus must be visible on the primary navigation.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await shoot(page, '09-keyboard-focus');
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    return { tag: el.tagName, text: (el.textContent ?? '').trim().slice(0, 40), outline: style.outlineWidth };
  });
  if (!focused) problems.push('no element received keyboard focus');
  else if (focused.outline === '0px') problems.push('focused element has no visible outline');

  // The repository link must exist in the shared chrome.
  const repoLinks = await page.locator(`a[href="https://github.com/aniruddhaadak80/both-sides"]`).count();
  if (repoLinks < 2) problems.push(`expected repository links in nav and footer, found ${repoLinks}`);

  console.log('\nmobile 390x844');
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const mp = await mobile.newPage();
  mp.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`mobile ${mp.url()} :: ${m.text().slice(0, 200)}`);
  });

  await mp.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 90000 });
  await shoot(mp, '10-landing-mobile', { fullPage: true });

  await mp.getByRole('button', { name: /menu/i }).click();
  await mp.waitForTimeout(600);
  await shoot(mp, '11-mobile-menu');
  const mobileRepo = await mp.locator(`a[href="https://github.com/aniruddhaadak80/both-sides"]`).count();
  if (mobileRepo < 1) problems.push('mobile menu has no repository link');

  await mp.goto(`${BASE}/desk`, { waitUntil: 'networkidle', timeout: 90000 });
  await shoot(mp, '12-desk-mobile', { fullPage: true });

  await browser.close();

  console.log(`\nscreenshots: ${shots.length}`);
  if (consoleErrors.length) {
    console.log('\nconsole errors:');
    for (const e of [...new Set(consoleErrors)].slice(0, 12)) console.log(`  - ${e}`);
  }
  if (failedRequests.length) {
    console.log('\nfailed requests:');
    for (const f of [...new Set(failedRequests)].slice(0, 12)) console.log(`  - ${f}`);
  }
  if (problems.length) {
    console.log('\nproblems:');
    for (const p of problems) console.log(`  - ${p}`);
  }

  const bad = problems.length + new Set(consoleErrors).size + new Set(failedRequests).size;
  console.log(`\n${bad === 0 ? 'browser pass clean' : `${bad} issue(s) found`}`);
  process.exitCode = bad === 0 ? 0 : 1;
};

run().catch((err) => {
  console.error(`browser pass crashed: ${err?.stack ?? err}`);
  process.exitCode = 1;
});