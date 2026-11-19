// Service worker: installs over http://localhost and serves the app when offline.
const { chromium } = require('playwright');
const assert = require('assert');
const { serve, launchOptions } = require('./helpers');

(async () => {
  const server = await serve();
  const browser = await chromium.launch(launchOptions());
  const ctx = await browser.newContext(); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(server.url + 'app/');   // the app lives under /app/; the root is the landing page
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => new Promise((r) => setTimeout(r, 600))));
  const man = await page.evaluate(() => fetch('manifest.webmanifest').then((r) => r.json()));
  assert.strictEqual(man.name, 'Hub Remote'); assert.strictEqual(man.icons.length, 3);
  assert.ok(!/lego|spike/i.test(JSON.stringify(man)), 'no third-party marks in the manifest');
  await page.reload(); await page.waitForTimeout(600);
  await ctx.setOffline(true);
  await page.reload(); await page.waitForTimeout(600);
  assert.strictEqual(await page.title(), 'Hub Remote'); assert.ok(await page.$('#btnConnect'), 'page loads offline from cache');
  assert.strictEqual(await page.evaluate(() => fetch('icon-192.png').then((r) => r.ok)), true, 'icon cached');
  assert.strictEqual(await page.evaluate(() => document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === 'loaded').length >= 2)), true, 'fonts available offline');
  assert.deepStrictEqual(errs, []);
  await browser.close(); server.close();
  console.log('OK service worker: installs, serves page and fonts offline');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
