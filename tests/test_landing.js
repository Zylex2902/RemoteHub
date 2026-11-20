// Landing page (site/index.html): loads cleanly, links to the app, both languages, fits every width.
const { chromium } = require('playwright');
const assert = require('assert');
const { serve, launchOptions } = require('./helpers');

(async () => {
  const server = await serve();
  const browser = await chromium.launch(launchOptions());
  for (const [w, h, locale] of [[320, 640, 'nl-NL'], [390, 844, 'en-US'], [1366, 800, 'nl-NL']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale });
    const page = await ctx.newPage(), errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
    await page.goto(server.url);
    // scroll through so lazy images load
    for (let y = 0; y < 9000; y += 500) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(60); }
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({
      lang: document.documentElement.dataset.lang, scrollX: document.documentElement.scrollWidth - innerWidth,
      // images that are shown (the second hero phone is hidden on small screens) must load
      broken: [...document.images].filter((i) => i.getClientRects().length && (!i.complete || !i.naturalWidth)).map((i) => i.getAttribute('src')),
      app: [...document.querySelectorAll('a[href="app/"]')].length,
      disclaimer: /(trademarks of the LEGO Group|handelsmerken van de LEGO Group)/.test(document.querySelector('.disclaimer').innerText),
      h1: document.querySelector('h1').innerText,
    }));
    assert.strictEqual(r.lang, locale.startsWith('nl') ? 'nl' : 'en', w + ' language from the browser');
    assert.ok(r.scrollX <= 0, w + ': page scrolls sideways by ' + r.scrollX);
    assert.deepStrictEqual(r.broken, [], w + ' broken images');
    assert.ok(r.app >= 2, 'links to the app'); assert.ok(r.disclaimer, 'trademark disclaimer');
    assert.ok(/LEGO® Education SPIKE™/.test(r.h1), 'compatibility named in the heading, with the symbols');
    if (w === 390) {
      // language switch, remembered
      await page.click('#langBtn');
      assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.lang), 'nl');
      await page.reload(); assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.lang), 'nl', 'choice remembered');
      // the app is one click away
      await page.click('.hero .btn.primary');
      await page.waitForFunction(() => document.getElementById('btnConnect'));
      assert.ok(page.url().endsWith('/app/'), page.url());
    }
    assert.deepStrictEqual(errs, [], w + ' errors');
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log('OK landing page: images, links to the app, disclaimer, both languages, 320 to 1366 px wide');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
