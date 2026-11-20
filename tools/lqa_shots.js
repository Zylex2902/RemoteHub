// Screenshots of the app in one or more languages, for the translation review page (tools/lqa.py page).
//   npm run lqa:shots -- de fr      ->  dist/lqa/shots/<code>/*.jpg + index.json
// Each screenshot lists the texts (keys) that are visible on it, so a reviewer can see a text in place.
// Runs the built app (site/app) against the simulated hub of the browser tests; phone size, light theme.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { APP, launchOptions, fakeHub } = require('../tests/helpers');
const ROOT = path.resolve(__dirname, '..');
const LANGS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'languages.json'), 'utf8'));
const LOCALE = { nl: 'nl-NL', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', es: 'es-ES', pt: 'pt-BR', pl: 'pl-PL', zh: 'zh-CN', ja: 'ja-JP' };

// The keys whose text shows on the page: every piece between placeholders must be visible.
function keysIn(seen, texts) {
  const out = [];
  for (const [k, v] of Object.entries(texts)) {
    const parts = v.split(/\{[A-Za-z0-9]+\}/).map((p) => p.trim()).filter((p) => p.length >= 2);
    if (!parts.length || parts.join('').length < 3) continue;
    if (parts.every((p) => seen.includes(p))) out.push(k);
  }
  return out;
}
const visibleText = (page) => page.evaluate(() => {
  const svg = [...document.querySelectorAll('.blocklyText, .blocklyFlyoutLabelText')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent);
  const attrs = [...document.querySelectorAll('[placeholder],[aria-label],[title]')].filter((e) => e.getClientRects().length).map((e) => [e.placeholder, e.getAttribute('aria-label'), e.title].filter(Boolean).join('\n'));
  return [document.body.innerText, ...svg, ...attrs].join('\n').replace(/ /g, ' ');
});

(async () => {
  const codes = process.argv.slice(2).length ? process.argv.slice(2) : LANGS.map((l) => l.code).filter((c) => c !== 'en' && c !== 'nl');
  const browser = await chromium.launch(launchOptions());
  for (const code of codes) {
    const texts = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', code + '.json'), 'utf8'));
    const dir = path.join(ROOT, 'dist', 'lqa', 'shots', code);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: LOCALE[code] || code, colorScheme: 'light', hasTouch: true });
    const page = await ctx.newPage();
    await page.addInitScript(fakeHub, { maxPacket: 509, truncate: 0, sensors: true });
    await page.goto('file://' + path.join(APP, 'index.html'));
    await page.waitForTimeout(600);
    const index = [];
    const shot = async (id, title, tall) => {
      // Tall screens: make the window as high as the content so one picture shows the whole screen.
      if (tall) {
        const h = await page.evaluate(() => { const m = document.getElementById('main'); return m.scrollHeight + (window.innerHeight - m.clientHeight); });
        await page.setViewportSize({ width: 390, height: Math.min(4000, Math.max(844, h)) }); await page.waitForTimeout(250);
      }
      const file = id + '.jpg';
      await page.screenshot({ path: path.join(dir, file), type: 'jpeg', quality: 78 });
      index.push({ id, title, file, keys: keysIn(await visibleText(page), texts) });
      if (tall) { await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150); }
    };
    const tab = async (v) => { await page.click('.tab[data-view="' + v + '"]'); await page.waitForTimeout(500); };
    const sheet = async (btn, id, title, close) => { await page.evaluate((b) => document.getElementById(b).click(), btn); await page.waitForTimeout(400); await shot(id, title); await page.evaluate((c) => document.getElementById(c).click(), close); await page.waitForTimeout(300); };

    await shot('drive-start', 'Drive, before connecting');
    await page.click('#btnConnect');
    await page.waitForFunction(() => document.getElementById('pill').dataset.phase === 'ready', null, { timeout: 15000 });
    await page.waitForTimeout(800);
    await shot('drive', 'Drive, connected', true);
    await tab('viewPlay'); await shot('play', 'Play', true);
    await sheet('btnDraw', 'draw', 'Play: draw a route', 'btnDrawClose');
    await tab('viewCode'); await page.waitForTimeout(600);
    await shot('code', 'Code: blocks');
    // Every toolbox category with its blocks.
    const cats = await page.$$eval('.blocklyToolboxCategory, .blocklyTreeRow', (n) => n.length);
    for (let i = 0; i < cats; i++) {
      await page.evaluate((i) => { const n = document.querySelectorAll('.blocklyToolboxCategory, .blocklyTreeRow')[i]; n && n.dispatchEvent(new MouseEvent('click', { bubbles: true })); n && n.click && n.click(); }, i);
      await page.waitForTimeout(350);
      const name = await page.evaluate((i) => { const n = document.querySelectorAll('.blocklyToolboxCategory, .blocklyTreeRow')[i]; return n ? n.textContent.trim() : ''; }, i);
      await shot('blocks-' + (i + 1), 'Code: blocks, ' + (name || 'category ' + (i + 1)));
    }
    await page.keyboard.press('Escape');
    await sheet('btnAsPy', 'aspy', 'Code: blocks as Python', 'btnPyClose');
    await page.click('#codeKind button[data-kind="python"]'); await page.waitForTimeout(400);
    await shot('python', 'Code: Python');
    await page.click('#codeKind button[data-kind="blocks"]'); await page.waitForTimeout(300);
    await tab('viewSettings'); await shot('settings', 'Settings', true);
    await sheet('btnShare', 'share', 'Settings: share', 'btnCloseShare');
    await tab('viewLog'); await shot('log', 'Log', true);
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 1));
    const all = new Set(index.flatMap((s) => s.keys));
    console.log(code + ':', index.length, 'screenshots in', path.relative(ROOT, dir) + ',', all.size, 'of', Object.keys(texts).length, 'texts seen on them');
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error('FAIL', e.message || e); process.exit(1); });
