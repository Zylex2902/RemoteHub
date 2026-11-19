// Foldable screens: emulates a hinge and checks that each half of the screen gets its own part of the UI.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const { SITE, launchOptions } = require('./helpers');
const FILE = 'file://' + path.join(SITE, 'index.html');

(async () => {
  const browser = await chromium.launch(launchOptions(['--enable-experimental-web-platform-features']));
  for (const [name, w, h, feature] of [
    ['book', 1485, 720, { orientation: 'vertical', offset: 720, maskLength: 45 }],
    ['tabletop', 720, 1485, { orientation: 'horizontal', offset: 720, maskLength: 45 }],
  ]) {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true, displayFeature: feature });
    await page.goto(FILE); await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const g = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
      const main = document.getElementById('main');
      return { hseg: matchMedia('(horizontal-viewport-segments: 2)').matches, vseg: matchMedia('(vertical-viewport-segments: 2)').matches,
        drive: g('viewDrive'), settings: g('viewSettings'), log: g('viewLog'), stop: g('btnStop'),
        tabbar: getComputedStyle(document.getElementById('tabbar')).display, scroll: main.scrollHeight - main.clientHeight,
        over: [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > innerWidth + 0.5 && !e.closest('#sheet'); }).length };
    });
    assert.strictEqual(r.tabbar, 'none', name); assert.strictEqual(r.over, 0, name + ' overflow'); assert.ok(r.scroll <= 1, name + ' page scrolls');
    if (name === 'book') {
      assert.ok(r.hseg && !r.vseg); assert.ok(r.drive.r <= 720 && r.log.r <= 720, 'left half: drive and log');
      assert.ok(r.settings.l >= 765, 'right half: settings start after the hinge'); assert.ok(r.stop.b <= r.drive.b && r.stop.b <= h, 'STOP visible');
    } else {
      assert.ok(r.vseg && !r.hseg); assert.ok(r.drive.b <= 720 && r.stop.b <= 720, 'top half: drive with STOP');
      assert.ok(r.settings.t >= 765 && r.log.t >= 765, 'bottom half: settings and log');
    }
    console.log('fold', name, 'ok');
    await ctx.close();
  }
  await browser.close();
  console.log('OK fold layouts');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
