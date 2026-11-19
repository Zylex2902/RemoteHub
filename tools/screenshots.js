// Makes the app screenshots for the landing page (site/img/), from the built app and a simulated hub.
//   node tools/screenshots.js        (needs Playwright's Chromium; set CHROME_PATH for another Chrome)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { SITE, serve, launchOptions, fakeHub } = require('../tests/helpers');

const IMG = path.join(SITE, 'img');
const sh = (v) => ({ shadow: { type: 'hr_num', fields: { NUM: v } } });
// Example program: a square with a smile, and a second stack that stops for obstacles.
const PROGRAM = { blocks: { languageVersion: 0, blocks: [
  { type: 'start', x: 20, y: 20, next: { block: { type: 'img', fields: { img: '0000009090000009000909990' }, next: { block:
    { type: 'repeat', inputs: { n: sh(4), DO: { block: { type: 'moveFor', fields: { dir: 'fw', unit: 'cm' }, inputs: { n: sh(20) }, next: { block:
      { type: 'turn', fields: { side: 'right' }, inputs: { n: sh(90) } } } } } }, next: { block: { type: 'mood', fields: { mood: 'happy' } } } } } } } },
  { type: 'when', x: 20, y: 470, inputs: { c: { block: { type: 'b_dist', fields: { op: '<' }, inputs: { n: sh(10) } } } },
    next: { block: { type: 'moveStop', next: { block: { type: 'mood', fields: { mood: 'oops' } } } } } },
] } };

(async () => {
  fs.mkdirSync(IMG, { recursive: true });
  const server = await serve(), APPURL = server.url + 'app/';
  const browser = await chromium.launch(launchOptions());
  const open = async (viewport, mobile, scale) => {
    const ctx = await browser.newContext({ viewport, locale: 'nl-NL', hasTouch: mobile, isMobile: mobile, deviceScaleFactor: scale, colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.addInitScript(fakeHub, { maxPacket: 509, truncate: 0, sensors: true });
    await page.addInitScript(() => { if (!localStorage.getItem('hubremote3')) localStorage.setItem('hubremote3', JSON.stringify({ profiles: [], react: false })); });
    await page.goto(APPURL);
    await page.click('#btnConnect');
    await page.waitForFunction(() => document.getElementById('pill').dataset.phase === 'ready', null, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll('#sensors .schip').length === 3);
    await page.waitForTimeout(600);
    return page;
  };
  const loadProgram = (page) => page.evaluate((p) => {
    const ws = Blockly.getMainWorkspace(); ws.clear(); Blockly.serialization.workspaces.load(p, ws);
    const b = ws.getTopBlocks(true)[0], xy = b.getRelativeToSurfaceXY(), s = ws.scale; ws.scroll(24 - xy.x * s, 36 - xy.y * s);
  }, PROGRAM);
  const shot = async (page, name) => { await page.screenshot({ path: path.join(IMG, name) }); console.log('img/' + name, fs.statSync(path.join(IMG, name)).size, 'bytes'); };

  // phone: driving with the joystick held up and to the right
  let page = await open({ width: 390, height: 844 }, true, 2);
  await page.evaluate(() => {
    const pad = document.getElementById('pad'), r = pad.getBoundingClientRect();
    pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width * 0.62, clientY: r.top + r.height * 0.22, pointerId: 1, pointerType: 'touch', isPrimary: true }));
  });
  await page.waitForTimeout(700);
  await shot(page, 'phone-drive.png');
  // phone: code
  await page.evaluate(() => document.getElementById('pad').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch' })));
  await page.click('.tab[data-view="viewCode"]'); await page.waitForTimeout(1000);
  await loadProgram(page); await page.waitForTimeout(500);
  await shot(page, 'phone-code.png');
  // phone: play
  await page.click('.tab[data-view="viewPlay"]'); await page.waitForTimeout(600);
  await page.evaluate(() => {
    const main = document.getElementById('main'), card = document.querySelector('#songBtns').closest('.card');
    main.scrollTop += card.getBoundingClientRect().top - main.getBoundingClientRect().top - 14;
  });
  await page.waitForTimeout(400);
  await shot(page, 'phone-play.png');
  await page.context().close();
  // laptop: the code editor across the screen
  page = await open({ width: 1366, height: 768 }, false, 1);
  await page.click('#modeSwitch .tab2[data-view="viewCode"]'); await page.waitForTimeout(1000);
  await loadProgram(page); await page.waitForTimeout(500);
  await shot(page, 'laptop-code.png');
  await browser.close(); server.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
