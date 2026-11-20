// End-to-end test: runs the built page in headless Chrome against a simulated hub.
// ONLY=AB node tests/test_page.js runs just those sections (A-Q).
const { chromium } = require('playwright');
const jsQR = require('jsqr');
const assert = require('assert');
const path = require('path');
const { APP, OUT, serve, launchOptions, fakeHub } = require('./helpers');
const FILE = 'file://' + path.join(APP, 'index.html');
let HTTP = '';

(async () => {
  const server = await serve(); HTTP = server.url + 'app/';
  // WebGL for the building-guide viewer runs on the software renderer in headless Chrome.
  const browser = await chromium.launch(launchOptions(['--enable-unsafe-swiftshader']));
  const errors = [];
  const open = async (ctxOpts, hubOpts, url, init) => {
    const ctx = await browser.newContext(Object.assign({ locale: 'nl-NL' }, ctxOpts));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::|manifest/i.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(fakeHub, Object.assign({ maxPacket: 509, truncate: 0, sensors: true }, hubOpts || {}));
    if (init) await page.addInitScript(init);
    await page.goto(url || FILE);
    return page;
  };
  const waitPhase = (page, p, timeout = 15000) => page.waitForFunction((p) => document.getElementById('pill').dataset.phase === p, p, { timeout });
  const tunnelOf = (page) => page.evaluate(() => window.__hub.tunnel.map((x) => x.text));
  const isDrive = (x) => /^[A-F]:-?\d+( [A-F]:-?\d+)*$/.test(x);
  const last = async (page) => { const t = (await tunnelOf(page)).filter(isDrive); return t[t.length - 1]; };
  const cmds = async (page) => (await tunnelOf(page)).filter((x) => !isDrive(x) && x !== '?');
  const ptr = (page, sel, type, x, y, id) => page.evaluate(([sel, type, x, y, id]) => {
    const el = document.querySelector(sel);
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: id, pointerType: 'touch', isPrimary: id === 1 }));
  }, [sel, type, x, y, id]);
  const rect = (page, sel) => page.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; });
  const setRange = (page, sel, v) => page.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const AUX1 = '#auxSettings .auxwrap:nth-child(1) ';
  const ONLY = process.env.ONLY || '', RUN = (x) => !ONLY || ONLY.includes(x);
  let page, H, before, expected;

  // ---------- A. desktop, Dutch ----------
  if (RUN('A')) {
  page = await open({ viewport: { width: 1366, height: 900 } });
  assert.strictEqual(await page.$eval('html', (e) => e.lang), 'nl');
  assert.strictEqual(await page.$eval('#btnConnectText', (e) => e.textContent), 'Verbind met hub');
  // motor test and gripper refuse politely when not connected
  await page.click('#btnTestL');
  await page.waitForFunction(() => /Verbind eerst/.test(document.getElementById('toasts').textContent));
  await page.click('#btnConnect'); await waitPhase(page, 'ready');
  H = await page.evaluate(() => ({ ok: window.__hub.fileOk, program: window.__hub.program, ev: window.__hub.events, slot: window.__hub.announced.slot, maxWrite: window.__hub.maxWrite }));
  expected = await page.$eval('#hub-program', (e) => e.textContent.replace(/^\s*\n/, ''));
  assert.strictEqual(H.ok, true); assert.strictEqual(H.program, expected); assert.ok(H.program.startsWith('import hub')); assert.strictEqual(H.slot, 19);
  assert.ok(H.maxWrite <= 180); assert.ok(H.ev.includes('devnot:200'));
  await page.waitForFunction(() => document.getElementById('selLeft').value === 'C');
  assert.strictEqual(await page.$eval('#battPct', (e) => e.dataset.t), '87%');
  // --- 7. sensors live
  await page.waitForFunction(() => document.querySelectorAll('#sensors .schip').length === 3);
  let chips = await page.$$eval('#sensors .schip', (els) => els.map((e) => e.textContent));
  assert.deepStrictEqual(chips, ['A35 cm', 'Brood', 'F40%'], chips.join('|'));
  await page.evaluate(() => { window.__hub.color = 3; window.__hub.dist = -1; });
  await page.waitForFunction(() => /blauw/.test(document.getElementById('sensors').textContent) && /vrij/.test(document.getElementById('sensors').textContent));
  await page.evaluate(() => { window.__hub.dist = 350; });
  // drive
  await page.evaluate(() => (window.__hub.tunnel.length = 0));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500);
  assert.strictEqual(await last(page), 'C:-60 D:60');
  // --- 7. obstacle stop: forward blocked, reverse and turning still work
  await page.click('#chkGuard + span'); await setRange(page, '#rngGuard', 20);
  await page.waitForTimeout(300); assert.strictEqual(await last(page), 'C:-60 D:60', 'far away: still driving');
  await page.evaluate(() => { window.__hub.dist = 150; });
  await page.waitForFunction(() => /Obstakel op 15 cm/.test(document.getElementById('toasts').textContent));
  await page.waitForTimeout(250); assert.strictEqual(await last(page), 'C:0 D:0', 'blocked');
  assert.ok(await page.$eval('#sensors .schip[data-id="distanceA"]', (e) => e.classList.contains('alert')));
  await page.keyboard.up('KeyW'); await page.keyboard.down('KeyS'); await page.waitForTimeout(450);
  assert.strictEqual(await last(page), 'C:60 D:-60', 'reverse allowed'); await page.keyboard.up('KeyS');
  await page.keyboard.down('KeyD'); await page.waitForTimeout(450);
  assert.strictEqual(await last(page), 'C:-36 D:-36', 'turn allowed'); await page.keyboard.up('KeyD');
  await page.evaluate(() => { window.__hub.dist = 500; });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(600);
  assert.strictEqual(await last(page), 'C:-60 D:60', 'free again'); await page.keyboard.up('KeyW'); await page.waitForTimeout(350);
  await page.click('#chkGuard + span');
  // --- 3. motor test: one side pulses forward briefly
  await page.evaluate(() => (window.__hub.tunnel.length = 0));
  await page.click('#btnTestL'); await page.waitForTimeout(450);
  assert.strictEqual(await last(page), 'C:-40 D:0', 'test left');
  await page.waitForTimeout(700); assert.strictEqual(await last(page), 'C:0 D:0');
  await page.click('#btnTestR'); await page.waitForTimeout(450);
  assert.strictEqual(await last(page), 'C:0 D:40', 'test right'); await page.waitForTimeout(700);
  // --- 6. extra motor: name, own speed, hold mode
  await page.selectOption(AUX1 + '[data-k="port"]', 'E'); await page.fill(AUX1 + '[data-k="name"]', 'Arm'); await setRange(page, AUX1 + '[data-k="speed"]', 80);
  assert.strictEqual(await page.$eval('#aux .auxrow span', (e) => e.textContent), 'Arm (E)');
  await page.click('#viewLog h2');   // leave the text field
  await page.keyboard.down('KeyE'); await page.waitForTimeout(250);
  assert.strictEqual(await last(page), 'C:0 D:0 E:80'); await page.keyboard.up('KeyE'); await page.waitForTimeout(250);
  assert.strictEqual(await last(page), 'C:0 D:0 E:0');
  // --- 6. gripper mode: open/close to fixed positions, zero point, slow jog
  await page.selectOption(AUX1 + '[data-k="mode"]', 'grip'); await setRange(page, AUX1 + '[data-k="travel"]', 120);
  assert.ok(await page.$eval(AUX1 + '.fold', (e) => e.classList.contains('on')));
  assert.deepStrictEqual(await page.$$eval('#aux .hold', (els) => els.map((e) => e.textContent.trim())), ['Q Dicht', 'E Open']);
  await page.keyboard.press('KeyE'); await page.keyboard.press('KeyQ');
  await page.dispatchEvent('#aux .hold[data-dir="1"]', 'pointerdown');
  await page.click(AUX1 + '.zero'); await page.waitForTimeout(200);
  assert.deepStrictEqual(await cmds(page), ['pos E 120 80', 'pos E 0 80', 'pos E 120 80', 'zero E']);
  await page.waitForTimeout(300); assert.strictEqual(await last(page), 'C:0 D:0', 'gripper port not in drive messages');
  await page.dispatchEvent(AUX1 + '.jog[data-dir="1"]', 'pointerdown'); await page.waitForTimeout(250);
  assert.strictEqual(await last(page), 'C:0 D:0 E:30', 'jog');
  await page.dispatchEvent(AUX1 + '.jog[data-dir="1"]', 'pointerup'); await page.waitForTimeout(400);
  { const t = (await tunnelOf(page)).filter(isDrive); const i = t.lastIndexOf('C:0 D:0 E:30');
    assert.strictEqual(t[i + 1], 'C:0 D:0 E:0', 'jog release stops the motor once'); assert.strictEqual(t[t.length - 1], 'C:0 D:0'); }
  await page.screenshot({ path: OUT + '/desktop.png' });
  // --- 5. tank mode: two sticks, each drives one side (two pointers at once)
  assert.strictEqual(await page.$eval('#modes [data-mode="tilt"]', (e) => getComputedStyle(e).display), 'none', 'no tilt on a mouse-only device');
  await page.click('#modes [data-mode="tank"]'); await page.waitForTimeout(300);
  assert.strictEqual(await page.$eval('#pad', (e) => getComputedStyle(e).display), 'none');
  const L = await rect(page, '.vstick[data-side="l"]'), R = await rect(page, '.vstick[data-side="r"]');
  await ptr(page, '.vstick[data-side="l"]', 'pointerdown', L.cx, L.cy, 1); await ptr(page, '.vstick[data-side="l"]', 'pointermove', L.cx, L.y + 2, 1);
  await ptr(page, '.vstick[data-side="r"]', 'pointerdown', R.cx, R.cy, 2); await ptr(page, '.vstick[data-side="r"]', 'pointermove', R.cx, R.y + R.h - 2, 2);
  await page.waitForTimeout(450);
  assert.strictEqual(await last(page), 'C:-60 D:-60', 'tank: left forward, right backward');
  await ptr(page, '.vstick[data-side="r"]', 'pointerup', R.cx, R.cy, 2); await page.waitForTimeout(350);
  assert.strictEqual(await last(page), 'C:-60 D:0', 'right released');
  await ptr(page, '.vstick[data-side="l"]', 'pointerup', L.cx, L.cy, 1); await page.waitForTimeout(350);
  assert.strictEqual(await last(page), 'C:0 D:0');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(400); assert.strictEqual(await last(page), 'C:-60 D:60', 'keyboard still works in tank mode'); await page.keyboard.up('KeyW');
  await page.screenshot({ path: OUT + '/desktop-tank.png' });
  await page.click('#modes [data-mode="joy"]'); await page.waitForTimeout(300);
  // --- 4. profiles: new, rename, independent settings, switch back, delete in two taps
  await page.click('#btnNew');
  assert.strictEqual(await page.$eval('#inpName', (e) => e.value), 'Mijn robot 2');
  assert.strictEqual(await page.$eval('#selLeft', (e) => e.value), 'A');
  assert.strictEqual(await page.$$eval('#aux .auxrow', (e) => e.length), 0);
  await page.fill('#inpName', 'Kraan'); await page.selectOption('#selLeft', 'F'); await page.click('#viewLog h2');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(450);
  assert.strictEqual(await last(page), 'B:60 F:-60', 'new profile drives its own ports');
  assert.deepStrictEqual(await page.$$eval('#selProfile option', (o) => o.map((x) => x.textContent)), ['Mijn robot', 'Kraan']);
  const first = await page.$eval('#selProfile option', (o) => o.value);
  await page.selectOption('#selProfile', first); await page.waitForTimeout(400);   // switch while still driving
  await page.keyboard.up('KeyW');
  assert.strictEqual(await page.$eval('#selLeft', (e) => e.value), 'C');
  assert.strictEqual(await page.$eval('#aux .auxrow span', (e) => e.textContent), 'Arm (E)');
  { const t = (await tunnelOf(page)).filter(isDrive); const i = t.lastIndexOf('B:60 F:-60');
    assert.strictEqual(t[i + 1], 'B:0 C:0 D:0 F:0', 'ports of the previous profile are stopped on switch: ' + t.slice(i, i + 3).join(' | ')); }
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('hubremote3')));
  assert.strictEqual(stored.profiles.length, 2); assert.strictEqual(stored.profiles[0].aux[0].mode, 'grip'); assert.strictEqual(stored.profiles[1].name, 'Kraan');
  await page.selectOption('#selProfile', stored.profiles[1].id);
  await page.click('#btnDelete'); assert.strictEqual((await page.$$eval('#selProfile option', (o) => o.length)), 2, 'first tap only asks');
  await page.waitForTimeout(200); await page.click('#btnDelete');
  assert.deepStrictEqual(await page.$$eval('#selProfile option', (o) => o.map((x) => x.textContent)), ['Mijn robot']);
  // share sheet from a local file: link shown, QR hidden with explanation
  await page.click('#btnShare'); await page.waitForTimeout(350);
  assert.ok(await page.$eval('#sheet', (e) => e.classList.contains('on')));
  assert.ok(/lokaal geopend/.test(await page.$eval('#shareNote', (e) => e.textContent)));
  assert.ok(await page.$eval('#qr', (e) => e.classList.contains('off')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(350);
  assert.ok(!(await page.$eval('#sheet', (e) => e.classList.contains('on'))));
  // theme: light by default, dark on request
  assert.strictEqual(await page.$eval('html', (e) => e.dataset.theme), 'light');
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.selectOption('#selTheme', 'dark'); await page.waitForTimeout(200);
  assert.notStrictEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), lightBg);
  assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('hubremote3')).theme), 'dark');
  await page.screenshot({ path: OUT + '/desktop-dark.png' });
  await page.selectOption('#selTheme', 'light'); await page.waitForTimeout(200);
  // --- 8. language switch at runtime
  await page.selectOption('#selLang', 'en'); await page.waitForTimeout(300);
  assert.strictEqual(await page.$eval('html', (e) => e.lang), 'en');
  assert.strictEqual(await page.$eval('#pillText', (e) => e.textContent), 'Ready');
  assert.strictEqual(await page.$eval('.tab[data-view="viewSettings"] span', (e) => e.textContent), 'Settings');
  assert.ok(/independent project/.test(await page.$eval('[data-i18n="about.text"]', (e) => e.textContent)));
  assert.ok(/LEGO®/.test(await page.$eval('[data-i18n="about.text"]', (e) => e.textContent)));
  assert.strictEqual(await page.$eval('#hint', (e) => e.textContent), 'Ready to drive. If the connection drops, the robot stops by itself.');
  assert.deepStrictEqual(await page.$$eval('#aux .hold', (els) => els.map((e) => e.textContent.trim())), ['Q Close', 'E Open']);
  assert.ok(/blue|red/.test(await page.$eval('#sensors', (e) => e.textContent)));
  assert.strictEqual(await page.$eval('#selLeft option', (e) => e.textContent), 'Port A');
  await page.selectOption('#selLang', 'nl'); await page.waitForTimeout(300);
  assert.strictEqual(await page.$eval('#pillText', (e) => e.textContent), 'Klaar');
  // --- regression: battery warning, reconnect without re-upload, hub restart, cancel, stop/restart, disconnect
  await page.evaluate(() => (window.__hub.battery = 18));
  await page.waitForFunction(() => /bijna leeg \(18%\)/.test(document.getElementById('toasts').textContent));
  await page.evaluate(() => (window.__hub.battery = 60));
  before = await page.evaluate(() => window.__hub.events.length);
  await page.evaluate(() => window.__hub.drop());
  await waitPhase(page, 'reconnecting'); await waitPhase(page, 'ready');
  H = await page.evaluate(() => ({ ev: window.__hub.events.slice(), choosers: window.__hub.choosers }));
  assert.deepStrictEqual(H.ev.slice(before), ['devnot:200'], H.ev.slice(before).join(',')); assert.strictEqual(H.choosers, 1);
  before = H.ev.length;
  await page.evaluate(() => { window.__hub.started = false; window.__hub.drop(); });
  await waitPhase(page, 'reconnecting'); await waitPhase(page, 'ready', 20000);
  H = await page.evaluate((b) => window.__hub.events.slice(b), before);
  assert.ok(H.includes('upload:program.py:19') && H.includes('start:19'), H.join(','));
  await page.evaluate(() => { window.__hub.offline = true; window.__hub.drop(); });
  await waitPhase(page, 'reconnecting'); await page.waitForTimeout(700);
  await page.click('#btnDisconnect'); await waitPhase(page, 'idle');
  await page.waitForTimeout(2500); assert.strictEqual(await page.$eval('#pill', (e) => e.dataset.phase), 'idle');
  assert.strictEqual(await page.$$eval('#sensors .schip', (e) => e.length), 0, 'sensors cleared when idle');
  await page.evaluate(() => { window.__hub.offline = false; });
  await page.click('#btnConnect'); await waitPhase(page, 'ready', 20000);
  await page.evaluate(() => window.__hub.hubStop()); await waitPhase(page, 'stopped');
  await page.evaluate(() => { window.__hub.started = true; });
  await page.click('#btnConnect'); await waitPhase(page, 'ready');
  await page.click('#btnDisconnect'); await waitPhase(page, 'idle');
  assert.deepStrictEqual(await page.evaluate(() => window.__hub.events.slice(-2)), ['stop', 'gatt-disconnect']);
  await page.context().close();
  console.log('A ok: sensors, obstacle stop, motor test, extra motors, gripper, tank, profiles, language, regression');

  }
  // ---------- B. sharing over http: QR decodes to the link, link imports the profile on another device ----------
  if (RUN('B')) {
  page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, {}, HTTP);
  await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(400);
  await page.fill('#inpName', 'Grijpbot één'); await page.selectOption('#selLeft', 'E'); await page.selectOption('#selRight', 'F'); await page.click('#chkInvR + span');
  await setRange(page, '#rngTrim', -7); await page.click('#chkGuard + span'); await setRange(page, '#rngGuard', 33);
  await page.selectOption(AUX1 + '[data-k="port"]', 'B'); await page.fill(AUX1 + '[data-k="name"]', 'Klauw'); await page.selectOption(AUX1 + '[data-k="mode"]', 'grip'); await setRange(page, AUX1 + '[data-k="travel"]', -200);
  await page.click('#btnShare'); await page.waitForTimeout(400);
  const link = await page.$eval('#shareLink', (e) => e.value);
  assert.ok(link.startsWith(HTTP + '#p='), link);
  const mods = await page.$eval('#qr svg', (svg) => { const n = +svg.dataset.modules; const dark = new Set(); const re = /M(\d+) (\d+)h1v1h-1z/g; let m; const d = svg.querySelector('path').getAttribute('d'); while ((m = re.exec(d))) dark.add(m[2] + ',' + m[1]); return { n, dark: [...dark] }; });
  const scale = 6, quiet = 4, size = (mods.n + quiet * 2) * scale, img = new Uint8ClampedArray(size * size * 4).fill(255), dark = new Set(mods.dark);
  for (let r = 0; r < mods.n; r++) for (let c = 0; c < mods.n; c++) if (dark.has(r + ',' + c)) for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) { const i = (((r + quiet) * scale + y) * size + (c + quiet) * scale + x) * 4; img[i] = img[i + 1] = img[i + 2] = 0; }
  const decoded = jsQR(img, size, size);
  assert.ok(decoded && decoded.data === link, 'QR decodes to the share link');
  await page.screenshot({ path: OUT + '/share.png' });
  const shareBox = await rect(page, '#sheet .box'); assert.ok(shareBox.x >= 0 && shareBox.x + shareBox.w <= 390 && shareBox.y >= 0 && shareBox.y + shareBox.h <= 844, 'share sheet fits');
  await page.context().close();
  page = await open({ viewport: { width: 1280, height: 800 }, locale: 'en-US' }, {}, link);     // another device, English
  await page.waitForFunction(() => /Profile Grijpbot .* added/.test(document.getElementById('toasts').textContent));
  assert.strictEqual(await page.evaluate(() => location.hash), '', 'hash cleared after import');
  const imp = await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('hubremote3')); return g.profiles.find((p) => p.id === g.active); });
  assert.deepStrictEqual({ name: imp.name, left: imp.left, right: imp.right, invL: imp.invL, invR: imp.invR, trim: imp.trim, guard: imp.guard, guardCm: imp.guardCm, aux0: imp.aux[0] },
    { name: 'Grijpbot één', left: 'E', right: 'F', invL: true, invR: true, trim: -7, guard: true, guardCm: 33, aux0: { port: 'B', name: 'Klauw', speed: 60, mode: 'grip', travel: -200 } });
  assert.strictEqual(await page.$eval('html', (e) => e.lang), 'en');
  assert.strictEqual(await page.$eval('#btnConnectText', (e) => e.textContent), 'Connect to hub');
  assert.strictEqual(await page.$$eval('#selProfile option', (o) => o.length), 2);
  await page.goto(link); await page.waitForTimeout(600);       // same link again: no duplicate
  assert.strictEqual(await page.$$eval('#selProfile option', (o) => o.length), 2, 'no duplicate on second import');
  await page.goto(HTTP + '#p=AAAA'); await page.waitForFunction(() => /not valid/.test(document.getElementById('toasts').textContent));
  await page.context().close();
  console.log('B ok: share link, QR, import, English default');

  }
  // ---------- C. tilt steering on a touch device ----------
  if (RUN('C')) {
  // Only the simulated sensor counts: real orientation events from the browser are dropped, and the
  // motion permission prompt (iOS, and Chrome 159+, which grants it on some machines and refuses
  // it on others) gives the answer the test sets.
  const blockRealTilt = () => {
    window.__realTilt = 0; window.__permAnswer = 'granted';
    window.addEventListener('deviceorientation', (e) => { if (e.isTrusted) { window.__realTilt++; e.stopImmediatePropagation(); } }, true);
    DeviceOrientationEvent.requestPermission = () => Promise.resolve(window.__permAnswer);
  };
  page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, {}, undefined, blockRealTilt);
  await page.click('#btnConnect'); await waitPhase(page, 'ready');
  assert.notStrictEqual(await page.$eval('#modes [data-mode="tilt"]', (e) => getComputedStyle(e).display), 'none');
  const tiltEv = (b, g) => page.evaluate(([b, g]) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: b, gamma: g })), [b, g]);
  await page.click('#modes [data-mode="tilt"]'); await page.waitForTimeout(300);
  const P = await rect(page, '#pad');
  await ptr(page, '#pad', 'pointerdown', P.cx, P.cy, 1);
  await page.waitForFunction(() => /geen kantelgegevens/.test(document.getElementById('toasts').textContent));   // no sensor data yet
  await tiltEv(45, 0);
  await page.evaluate(() => (window.__hub.tunnel.length = 0));
  await ptr(page, '#pad', 'pointerdown', P.cx, P.cy, 1); await page.waitForTimeout(300);
  assert.strictEqual(await last(page), 'C:0 D:0', 'neutral at the angle you grab it');
  await tiltEv(20, 0); await page.waitForTimeout(450);
  assert.strictEqual(await last(page), 'C:-60 D:60', 'tilt forward drives forward');
  await tiltEv(45, 25); await page.waitForTimeout(450);
  assert.strictEqual(await last(page), 'C:-36 D:-36', 'tilt right turns right');
  await tiltEv(70, 0); await page.waitForTimeout(450);
  assert.strictEqual(await last(page), 'C:60 D:-60', 'tilt back reverses');
  await page.screenshot({ path: OUT + '/tilt.png' });
  await ptr(page, '#pad', 'pointerup', P.cx, P.cy, 1); await page.waitForTimeout(350);
  assert.strictEqual(await last(page), 'C:0 D:0', 'release stops');
  await tiltEv(10, 0); await page.waitForTimeout(300); assert.strictEqual(await last(page), 'C:0 D:0', 'no driving unless held');
  assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('hubremote3')).mode), 'tilt');
  // permission refused (iPhone "Don't allow"): a clear message and back to the joystick
  await page.click('#modes [data-mode="joy"]'); await page.evaluate(() => { window.__permAnswer = 'denied'; });
  await page.click('#modes [data-mode="tilt"]');
  await page.waitForFunction(() => /Geen toegang tot de bewegingssensor/.test(document.getElementById('toasts').textContent));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('hubremote3')).mode === 'joy');
  const realTilt = await page.evaluate(() => window.__realTilt);
  await page.context().close();
  console.log('C ok: tilt, permission refused (' + realTilt + ' real sensor events ignored)');

  }
  // ---------- D. small-packet fallback, 20-byte hub, v2 settings migration ----------
  if (RUN('D')) {
  page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, { truncate: 100 });
  await page.click('#btnConnect'); await waitPhase(page, 'ready', 30000);
  assert.strictEqual(await page.evaluate(() => window.__hub.fileOk), true);
  assert.ok(/opnieuw met 20 bytes/.test(await page.$eval('#log', (e) => e.textContent)));
  await page.context().close();
  page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, { maxPacket: 20 });
  await page.click('#btnConnect'); await waitPhase(page, 'ready');
  assert.ok((await page.evaluate(() => window.__hub.maxWrite)) <= 20);
  await page.context().close();
  page = await open({ viewport: { width: 1280, height: 800 } }, {}, FILE, () => { if (!localStorage.getItem('hubremote3')) localStorage.setItem('hubremote', JSON.stringify({ left: 'E', right: 'F', invL: false, invR: true, speed: 85, turn: 40, trim: 5, aux1: 'B', aux2: '-', slot: 7, sound: false, haptic: true, userPorts: true })); });
  const mig = await page.evaluate(() => JSON.parse(localStorage.getItem('hubremote3')));
  assert.deepStrictEqual([mig.slot, mig.sound, mig.profiles.length, mig.profiles[0].left, mig.profiles[0].right, mig.profiles[0].invL, mig.profiles[0].invR, mig.profiles[0].speed, mig.profiles[0].trim, mig.profiles[0].aux[0].port, mig.profiles[0].aux[0].speed],
    [7, false, 1, 'E', 'F', false, true, 85, 5, 'B', 85]);
  await page.context().close();
  // the hub drops the link right after its first answer (seen in Bluefy): retried without the chooser
  page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, { dropAfterInfo: 1 });
  await page.click('#btnConnect'); await waitPhase(page, 'ready', 20000);
  let lg = await page.$eval('#log', (e) => e.textContent);
  assert.ok(/De hub verbrak de verbinding/.test(lg) && /poging 1/.test(lg) && /Stap: meldingen aanzetten \[wwr /.test(lg), lg);
  assert.strictEqual(await page.evaluate(() => window.__hub.choosers), 1);
  await page.context().close();
  page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, { dropAfterInfo: 9 });
  await page.click('#btnConnect'); await page.waitForFunction(() => /Fout: .*\(bij /.test(document.getElementById('log').textContent), null, { timeout: 20000 });
  lg = await page.$eval('#log', (e) => e.textContent);
  assert.ok(/poging 2/.test(lg) && !/poging 3/.test(lg), lg);
  assert.strictEqual(await page.$eval('#pill', (e) => e.dataset.phase), 'idle');
  await page.context().close();
  console.log('D ok: fallback, 20-byte hub, migration, link drops while connecting');

  }
  // ---------- E. layouts with sensors and an extra motor showing ----------
  if (RUN('E')) {
  const sizes = [
    ['fold-cover-280', 280, 653, true], ['fold-cover-344', 344, 882, true], ['iphone-se', 375, 667, true], ['iphone', 390, 844, true],
    ['iphone-land', 844, 390, true], ['fold-open', 768, 884, true], ['fold-open-land', 884, 768, true], ['ipad', 820, 1180, true], ['ipad-land', 1180, 820, true], ['laptop', 1366, 700, false],
  ];
  for (const [name, w, h, touch] of sizes) {
    page = await open({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    await page.click('#btnConnect'); await waitPhase(page, 'ready');
    await page.waitForFunction(() => document.querySelectorAll('#sensors .schip').length === 3);
    await page.waitForTimeout(700);
    const measure = () => page.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const vis = (el) => getComputedStyle(el).display !== 'none';
      const over = [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > innerWidth + 0.5 || b.left < -0.5) && !e.closest('#log') && !e.closest('#toasts') && !e.closest('#sheet')
        // the block editor clips its own canvas, and keeps its floating menus off-screen until used
        && !(e.closest('#blocklyDiv') && e.id !== 'blocklyDiv') && !e.closest('.blocklyWidgetDiv,.blocklyDropDownDiv,.blocklyTooltipDiv'); }).map((e) => e.tagName + '#' + e.id + '.' + e.className).slice(0, 4);
      const pad = r('pad'), modes = r('modes'); const cx = pad.left + pad.width / 2, cy = pad.top + pad.height / 2;
      const near = Math.hypot(Math.max(modes.left - cx, 0, cx - modes.right), Math.max(modes.top - cy, 0, cy - modes.bottom));
      return { stopBottom: r('btnStop').bottom, padW: pad.width, tabbar: vis(document.getElementById('tabbar')), tabTop: r('tabbar').top, vh: innerHeight, over,
        modesGap: near - pad.width / 2, scroll: document.getElementById('viewDrive').scrollHeight - document.getElementById('viewDrive').clientHeight, mainScroll: document.getElementById('main').scrollHeight - document.getElementById('main').clientHeight };
    });
    let m = await measure();
    assert.deepStrictEqual(m.over, [], name + ' outside viewport: ' + m.over.join(' | '));
    const limit = m.tabbar ? m.tabTop : m.vh;
    assert.ok(m.stopBottom <= limit + 0.5, name + ': STOP not fully visible (' + Math.round(m.stopBottom) + ' > ' + Math.round(limit) + ')');
    assert.ok(m.padW >= 120, name + ': joystick too small ' + m.padW);
    assert.ok(m.modesGap >= -6, name + ': mode switch overlaps joystick by ' + (-m.modesGap).toFixed(1));
    assert.strictEqual(m.tabbar, w < 900, name + ' tabbar');
    await page.screenshot({ path: OUT + '/' + name + '.png' });
    if (m.tabbar) {
      await page.click('#modes [data-mode="tank"]'); await page.waitForTimeout(350);
      const m2 = await measure(); assert.deepStrictEqual(m2.over, [], name + ' tank outside viewport');
      assert.ok(m2.stopBottom <= limit + 0.5, name + ': STOP hidden in tank mode');
      if (name === 'iphone') await page.screenshot({ path: OUT + '/iphone-tank.png' });
      await page.click('#modes [data-mode="joy"]');
      await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(450);
      await page.selectOption(AUX1 + '[data-k="port"]', 'E'); await page.selectOption(AUX1 + '[data-k="mode"]', 'grip'); await page.waitForTimeout(450);
      const so = await page.evaluate(() => [...document.querySelectorAll('#viewSettings *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > innerWidth + 0.5 || b.left < -0.5); }).map((e) => e.tagName + '.' + e.className).slice(0, 4));
      assert.deepStrictEqual(so, [], name + ' settings overflow: ' + so.join(' | '));
      await page.screenshot({ path: OUT + '/' + name + '-settings.png', fullPage: false });
      await page.click('.tab[data-view="viewDrive"]'); await page.waitForTimeout(450);
      const m3 = await measure(); assert.deepStrictEqual(m3.over, [], name + ' with aux row');
    }
    if (!m.tabbar) {
      // wide layout: the page itself never scrolls; the right column (play + settings) scrolls on its own and the last settings card is reachable
      const w2 = await page.evaluate(() => { const s = document.getElementById('side'), mn = document.getElementById('main'); s.scrollTop = 1e6;
        const lastCard = document.getElementById('viewSettings').lastElementChild.getBoundingClientRect(); return { main: mn.scrollHeight - mn.clientHeight, settings: s.scrollHeight - s.clientHeight, lastBottom: lastCard.bottom, vh: innerHeight, logH: document.getElementById('log').getBoundingClientRect().height }; });
      assert.ok(w2.main <= 1, name + ': page scrolls by ' + w2.main); assert.ok(m.scroll <= 2, name + ': drive column is clipped by ' + m.scroll); assert.ok(w2.settings > 50, name + ': settings column should scroll');
      assert.ok(w2.lastBottom <= w2.vh + 1, name + ': last settings card not reachable'); assert.ok(w2.logH >= 60, name + ': log too small ' + w2.logH);
      await page.screenshot({ path: OUT + '/' + name + '-scrolled.png' });
    }
    console.log('E', name.padEnd(16), w + 'x' + h, 'pad', Math.round(m.padW), 'stop', Math.round(m.stopBottom), '/', Math.round(limit), 'modes gap', Math.round(m.modesGap), 'scroll', m.scroll, m.mainScroll);
    await page.context().close();
  }

  }
  // ---------- F. no Web Bluetooth notices in both languages ----------
  if (RUN('F')) {
  for (const [loc, re] of [['nl-NL', /Bluefy uit de App Store/], ['en-GB', /free Bluefy app/]]) {
    const ctx = await browser.newContext({ locale: loc, viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(String(e)));
    await p.addInitScript(() => Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true })); await p.goto(FILE);
    assert.ok(re.test(await p.$eval('#noBle', (e) => e.textContent)), loc);
    assert.strictEqual(await p.$eval('#btnConnect', (e) => e.disabled), true);
    await ctx.close();
  }
  }
  // ---------- G. play: songs, robot talk, faces, robot language, piano, dances, recorded route, on/off motor ----------
  if (RUN('G')) {
  const toastHas = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toasts').textContent), re.source);
  const since = async (n) => (await tunnelOf(page)).slice(n);
  const count = () => page.evaluate(() => window.__hub.tunnel.length);
  const NOTE_OK = (tok) => { const [f, ms] = tok.split(':').map(Number); return Number.isInteger(f) && Number.isInteger(ms) && (f === 0 || (f >= 100 && f <= 10000)) && ms >= 10 && ms <= 3000; };
  const tunes = (msgs) => msgs.filter((x) => /^tune\+? /.test(x));
  const imgs = (msgs) => msgs.filter((x) => x.startsWith('img ')).map((x) => x.slice(4));
  page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  // not connected: everything plays on the phone, nothing goes to the hub
  await page.click('.tab[data-view="viewPlay"]'); await page.waitForTimeout(300);
  assert.ok(/Niet verbonden/.test(await page.$eval('#playWhere', (e) => e.textContent)));
  await page.click('#song-birthday'); await page.click('#mood-happy');
  await page.click('#btnDance1'); await toastHas(/Verbind eerst/);
  assert.strictEqual(await page.$eval('#btnRoute', (e) => e.disabled), true, 'no route yet');
  // connect: volume is sent and the robot says hello with a wink
  await page.click('.tab[data-view="viewDrive"]'); await page.waitForTimeout(300);
  await page.click('#btnConnect'); await waitPhase(page, 'ready'); await page.waitForTimeout(500);
  let msgs = await cmds(page);
  assert.ok(msgs.includes('vol 60'), msgs.join('|'));
  assert.ok(tunes(msgs).length >= 1 && imgs(msgs).includes('0000009099000009000909990'), 'hello reaction: ' + msgs.join('|'));
  // songs: a tune in messages of at most 24 notes, then "tune+"; Quiet sends hush
  await page.click('.tab[data-view="viewPlay"]'); await page.waitForTimeout(300);
  assert.ok(/Verbonden/.test(await page.$eval('#playWhere', (e) => e.textContent)));
  let n0 = await count();
  await page.click('#song-birthday'); await page.waitForTimeout(300);
  msgs = await since(n0);
  const tw = tunes(msgs);
  assert.strictEqual(tw.length, 3, msgs.join('|'));   // 25 notes + gaps = 50 tokens: 24 + 24 + 2
  assert.ok(tw[0].startsWith('tune 392:230 0:40 392:75 0:15 440:320') && tw[1].startsWith('tune+ ') && tw[2].startsWith('tune+ '), tw[0]);
  assert.deepStrictEqual(tw.map((x) => x.split(' ').length - 1), [24, 24, 2]);
  assert.ok(imgs(msgs).length === 1, 'note face');
  n0 = await count(); await page.click('#song-quiet'); await page.waitForTimeout(200);
  assert.ok((await since(n0)).includes('hush'));
  for (const id of ['jingle', 'entertainer', 'mountain', 'mozart', 'ode', 'elise', 'fanfare']) {
    n0 = await count(); await page.click('#song-' + id); await page.waitForTimeout(250);
    const toks = tunes(await since(n0)).flatMap((x) => x.split(' ').slice(1));
    assert.ok(toks.length > 4 && toks.every(NOTE_OK), id + ': ' + toks.join(' '));
  }
  await setRange(page, '#rngVol', 40); await page.waitForTimeout(200);
  assert.ok((await cmds(page)).includes('vol 40'));
  // robot talk: every mood sends valid notes and a 25-pixel face
  for (const id of ['hello', 'happy', 'sad', 'wow', 'oops', 'angry', 'sleep', 'love']) {
    n0 = await count(); await page.click('#mood-' + id); await page.waitForTimeout(250);
    msgs = await since(n0);
    const toks = tunes(msgs).flatMap((x) => x.split(' ').slice(1));
    assert.ok(toks.length >= 3 && toks.every(NOTE_OK), id + ': ' + toks.join(' '));
    assert.ok(imgs(msgs).length === 1 && /^[0-9]{25}$/.test(imgs(msgs)[0]), id + ' face');
  }
  // robot language: the hub says the sentence in beeps, two per syllable; a question rises; the mouth moves, then smiles
  const sayNotes = async (text) => { const n = await count(); await page.fill('#inpSay', text); await page.click('#btnSay'); await page.waitForTimeout(250);
    return tunes(await since(n)).flatMap((x) => x.split(' ').slice(1)); };
  const sounding = (toks) => toks.filter((x) => !x.startsWith('0:')).map((x) => +x.split(':')[0]);
  n0 = await count();
  const said = await sayNotes('Hallo robot?');
  assert.ok(said.every(NOTE_OK), said.join(' '));
  const sNormal = sounding(said), q = sNormal.slice(-3);
  assert.strictEqual(sNormal.length, 9, 'Hal-lo ro-bot?: ' + sNormal.join(' '));
  assert.ok(q[0] < q[1] && q[1] < q[2], 'question rises: ' + q);
  await page.waitForTimeout(1200);
  let faces = imgs(await since(n0));
  assert.ok(faces[0] === '0909000000099909000909990' && faces.length >= 3, 'mouth moves: ' + faces.length);
  assert.strictEqual(faces[faces.length - 1], '0000009090000009000909990', 'smile when done');
  assert.deepStrictEqual(await sayNotes('Hallo robot?'), said, 'same sentence, same sound');
  await page.selectOption('#selVoice', 'high');
  assert.ok(sounding(await sayNotes('Hallo robot?'))[0] > sNormal[0] * 1.4, 'high voice');
  n0 = await count(); await page.click('#phrases .btn'); await page.waitForTimeout(250);
  assert.ok(sounding(tunes(await since(n0)).flatMap((x) => x.split(' ').slice(1))).length >= 10, 'phrase is said');
  assert.strictEqual(await page.$eval('#speakNote', (e) => e.textContent).then((x) => /robotpiepjes/.test(x)), true);
  await page.click('#song-quiet'); await page.waitForTimeout(1200);
  // piano: a key plays one note; record three keys and play them back
  n0 = await count();
  await ptr(page, '.wkey[data-note="E4"]', 'pointerdown', 0, 0, 1); await page.waitForTimeout(150);
  assert.ok((await since(n0)).includes('tune 330:320'));
  await page.click('#btnSongRec'); await toastHas(/Opnemen/);
  for (const k of ['C4', 'F#4', 'G4']) { await ptr(page, '[data-note="' + k + '"]', 'pointerdown', 0, 0, 1); await page.waitForTimeout(300); }
  await page.click('#btnSongRec'); await toastHas(/Liedje bewaard \(3 noten\)/);
  n0 = await count(); await page.click('#btnSongPlay'); await page.waitForTimeout(200);
  const song = tunes(await since(n0))[0].split(' ').slice(1).filter((x) => !x.startsWith('0:')).map((x) => +x.split(':')[0]);
  assert.deepStrictEqual(song, [262, 370, 392]);
  // dance: drives in the Drive screen with a banner; STOP ends it, stops the motors and the music
  await page.click('#btnDance1'); await page.waitForTimeout(500);
  assert.ok(await page.$eval('.tab[data-view="viewDrive"]', (e) => e.classList.contains('on')), 'switched to Drive');
  assert.ok(await page.$eval('#banner', (e) => e.classList.contains('on')));
  assert.strictEqual(await page.$eval('#bannerText', (e) => e.textContent), 'Wiebeldans rijdt');
  assert.notStrictEqual(await last(page), 'C:0 D:0', 'dance drives');
  n0 = await count();
  await page.dispatchEvent('#btnStop', 'pointerdown'); await page.waitForTimeout(400);
  assert.strictEqual(await page.$eval('#banner', (e) => e.classList.contains('on')), false);
  assert.ok((await since(n0)).includes('hush')); assert.strictEqual(await last(page), 'C:0 D:0');
  // dance to the end
  await page.click('.tab[data-view="viewPlay"]'); await page.waitForTimeout(300);
  await page.click('#btnDance1'); await toastHas(/Wiebeldans is klaar/);
  await page.waitForTimeout(400); assert.strictEqual(await last(page), 'C:0 D:0');
  // the joystick takes over from a dance; leaving the Drive screen stops one
  await page.click('.tab[data-view="viewPlay"]'); await page.waitForTimeout(300);
  await page.click('#btnDance2'); await page.waitForTimeout(400);
  let P = await rect(page, '#pad');
  await ptr(page, '#pad', 'pointerdown', P.cx, P.cy, 1); await page.waitForTimeout(200);
  assert.strictEqual(await page.$eval('#banner', (e) => e.classList.contains('on')), false, 'joystick takes over');
  await ptr(page, '#pad', 'pointerup', P.cx, P.cy, 1);
  await page.click('.tab[data-view="viewPlay"]'); await page.waitForTimeout(300);
  await page.click('#btnDance2'); await page.waitForTimeout(400);
  await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(400);
  assert.strictEqual(await page.$eval('#banner', (e) => e.classList.contains('on')), false, 'view switch ends the dance');
  assert.strictEqual(await last(page), 'C:0 D:0');
  // record a route with the joystick, then drive it back
  await page.click('.tab[data-view="viewPlay"]'); await page.waitForTimeout(300);
  await page.click('#btnRec'); await page.waitForTimeout(400);
  assert.ok(await page.$eval('#banner', (e) => e.classList.contains('rec')));
  P = await rect(page, '#pad');
  await page.waitForTimeout(300);                                       // standing still first is not recorded
  await ptr(page, '#pad', 'pointerdown', P.cx, P.cy - P.h / 3, 1); await page.waitForTimeout(800);
  await ptr(page, '#pad', 'pointerup', P.cx, P.cy - P.h / 3, 1); await page.waitForTimeout(800);
  await page.click('#bannerBtn'); await toastHas(/Route bewaard/);
  const route = await page.evaluate(() => JSON.parse(localStorage.getItem('hubremote3')).path);
  assert.ok(route.length >= 12 && route.length <= 40, 'route length ' + route.length);
  assert.ok(route[0][0] !== 0 || route[0][1] !== 0, 'starts with movement');
  assert.deepStrictEqual(route[route.length - 1], [0, 0]); assert.ok(route.some(([l, r]) => l > 30 && r > 30), 'drove forward');
  await page.click('.tab[data-view="viewPlay"]'); await page.waitForTimeout(300);
  assert.strictEqual(await page.$eval('#btnRoute', (e) => e.disabled), false);
  await page.evaluate(() => (window.__hub.tunnel.length = 0));
  await page.click('#btnRoute'); await toastHas(/Route is klaar/); await page.waitForTimeout(400);   // soft stop takes a few ticks
  const drove = (await tunnelOf(page)).filter(isDrive);
  assert.ok(drove.some((x) => x !== 'C:0 D:0'), 'route drives'); assert.strictEqual(drove[drove.length - 1], 'C:0 D:0');
  // extra motor in on/off mode: a tap starts it, a tap in the other direction reverses, a second tap stops; STOP stops it too
  await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(300);
  await page.selectOption(AUX1 + '[data-k="port"]', 'E'); await page.selectOption(AUX1 + '[data-k="mode"]', 'toggle');
  await page.click('.tab[data-view="viewDrive"]'); await page.waitForTimeout(300);
  const tap = async (dir) => { const sel = '#aux .hold[data-aux="0"][data-dir="' + dir + '"]'; await ptr(page, sel, 'pointerdown', 0, 0, 1); await ptr(page, sel, 'pointerup', 0, 0, 1); await page.waitForTimeout(400); };
  await tap(1); assert.ok(/E:60/.test(await last(page)), await last(page));
  await page.waitForTimeout(600); assert.ok(/E:60/.test(await last(page)), 'keeps turning after release');
  assert.strictEqual(await page.$$eval('#aux .hold.on', (b) => b.map((x) => x.dataset.dir).join()), '1');
  await tap(-1); assert.ok(/E:-60/.test(await last(page)), await last(page));
  await tap(-1); assert.ok(/E:0/.test(await last(page)), await last(page));
  assert.strictEqual(await page.$$eval('#aux .hold.on', (b) => b.length), 0);
  await tap(1); await page.dispatchEvent('#btnStop', 'pointerdown'); await page.waitForTimeout(400);
  assert.ok(/E:0/.test(await last(page)), 'STOP stops it'); assert.strictEqual(await page.$$eval('#aux .hold.on', (b) => b.length), 0);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(400); assert.ok(/E:60/.test(await last(page)), 'key E toggles on');
  await page.keyboard.press('KeyE'); await page.waitForTimeout(400); assert.ok(/E:0/.test(await last(page)), 'key E toggles off');
  // reactions can be switched off
  await page.click('.tab[data-view="viewPlay"]'); await page.waitForTimeout(300);
  await page.click('#chkReact + span'); await page.waitForTimeout(100);
  assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('hubremote3')).react), false);
  // English
  await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(300);
  await page.selectOption('#selLang', 'en'); await page.waitForTimeout(300);
  assert.strictEqual(await page.$eval('#song-ode span:last-child', (e) => e.textContent), 'Ode to Joy');
  assert.strictEqual(await page.$eval('#inpSay', (e) => e.placeholder), 'Type what the robot should say');
  await page.screenshot({ path: OUT + '/play.png', fullPage: true });
  await page.context().close();
  console.log('G ok: songs, moods, faces, robot language, piano, dances, route, on/off motor, reactions');
  }
  // ---------- H. code tab: blocks (Blockly), run against the simulated hub ----------
  if (RUN('H')) {
  // an old program made with cards (version 5.0) is converted to blocks on load
  const oldProg = { id: 'old1', name: 'Kaartjes', vars: ['k'], stacks: [[{ t: 'start', p: {} }, { t: 'repeat', p: { n: { k: 'n', v: 3 } } }, { t: 'changeVar', p: { v: 'k', n: { k: 'n', v: 1 } } }, { t: 'end', p: {} }]] };
  const seed = 'if (!localStorage.getItem("hubremote3")) localStorage.setItem("hubremote3", ' + JSON.stringify(JSON.stringify({ profiles: [], programs: [oldProg], progActive: 'old1' })) + ');';
  page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, {}, undefined, seed);
  page.on('dialog', (d) => d.accept(d.message().includes('variabele') ? 'teller' : 'Robotdans'));
  const toastHas = (re, timeout) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toasts').textContent), re.source, { timeout: timeout || 15000 });
  const count = () => page.evaluate(() => window.__hub.tunnel.length);
  const since = async (n) => (await tunnelOf(page)).slice(n);
  const wsLoad = (json) => page.evaluate((j) => { const ws = Blockly.getMainWorkspace(); ws.clear(); Blockly.serialization.workspaces.load(j, ws); }, json);
  const blockTypes = () => page.evaluate(() => Blockly.getMainWorkspace().getTopBlocks(true).map((b) => { const out = []; for (let x = b; x; x = x.getNextBlock()) out.push(x.type); return out; }));
  const sh = (v) => ({ shadow: { type: 'hr_num', fields: { NUM: v } } });
  await page.click('.tab[data-view="viewCode"]'); await page.waitForTimeout(800);
  assert.deepStrictEqual(await blockTypes(), [['start', 'repeat']], 'card program shown as blocks');
  assert.strictEqual(await page.evaluate(() => Blockly.getMainWorkspace().getTopBlocks()[0].getNextBlock().getInputTargetBlock('DO').type), 'changeVar');
  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('hubremote3')).programs[0]);
  assert.ok(migrated.ws && migrated.ws.blocks && !migrated.stacks, 'stored as blocks');
  // fresh start in a new context (empty storage), so no late save from the old page can interfere: the example program
  await page.context().close();
  page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page.on('dialog', (d) => d.accept(d.message().includes('variabele') ? 'teller' : 'Robotdans'));
  await page.click('#btnConnect'); await waitPhase(page, 'ready');
  await page.click('.tab[data-view="viewCode"]'); await page.waitForTimeout(800);
  // the example program in blocks: smile, forward 10 cm, a happy sound, back 10 cm, write Hi!
  assert.deepStrictEqual(await blockTypes(), [['start', 'img', 'moveFor', 'mood', 'moveFor', 'write']]);
  assert.strictEqual(await page.$$eval('.blocklyToolboxCategory', (e) => e.length), 9);
  await page.evaluate(() => { const ws = Blockly.getMainWorkspace(), o = ws.highlightBlock.bind(ws); window.__lit = []; ws.highlightBlock = (id, on) => { window.__lit.push([id, on]); return o(id, on); }; });
  let n0 = await count();
  await page.click('#btnPlay');
  await toastHas(/Programma klaar/, 20000);
  let msgs = await since(n0);
  assert.deepStrictEqual(msgs.filter((x) => x.startsWith('deg ')), ['deg C:-206:50 D:206:50', 'deg C:206:50 D:-206:50'], msgs.join('|'));
  assert.ok(msgs.includes('img 0000009090000009000909990') && msgs.some((x) => x.startsWith('tune ')) && msgs.includes('halt'));
  let pos = await page.evaluate(() => ({ c: window.__hub.m.C.pos, d: window.__hub.m.D.pos }));
  assert.ok(Math.abs(pos.c) < 3 && Math.abs(pos.d) < 3, 'back where it started ' + JSON.stringify(pos));
  const lit = await page.evaluate(() => window.__lit);
  assert.ok(lit.filter((x) => x[1]).length >= 5 && lit[lit.length - 1][1] === false, 'running blocks light up, and go dark at the end');
  // a real drag: a beep block from the Geluid menu snaps under the last block
  const clickCat = async (i) => { await (await page.$$('.blocklyToolboxCategory'))[i].click(); await page.waitForTimeout(600); };
  await clickCat(4);   // Geluid
  const from = await page.evaluate(() => { const b = Blockly.getMainWorkspace().getFlyout().getWorkspace().getTopBlocks(true).find((x) => x.type === 'beepFor'); const r = b.getSvgRoot().getBoundingClientRect(); return { x: r.left + 12, y: r.top + 10 }; });
  const to = await page.evaluate(() => { const ws = Blockly.getMainWorkspace(); let b = ws.getTopBlocks(true)[0]; while (b.getNextBlock()) b = b.getNextBlock(); const r = b.getSvgRoot().getBoundingClientRect(); return { x: r.left + 12, y: r.bottom + 2 }; });
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12); await page.waitForTimeout(20); }
  // like a finger: look where the block is and steer it so its top meets the bottom of the last block
  const at = await page.evaluate(() => { const r = document.querySelector('.blocklyDragging').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  await page.mouse.move(to.x + (to.x - 12 - at.x), to.y + (to.y - 6 - at.y), { steps: 4 }); await page.waitForTimeout(100);
  await page.mouse.up(); await page.waitForTimeout(400);
  assert.deepStrictEqual(await blockTypes(), [['start', 'img', 'moveFor', 'mood', 'moveFor', 'write', 'beepFor']], 'dragged block snapped on');
  // make a variable with the button in the Variabelen menu
  await clickCat(8);   // Variabelen
  await page.click('.blocklyFlyoutButton'); await page.waitForTimeout(500);
  assert.deepStrictEqual(await page.evaluate(() => Blockly.getMainWorkspace().getVariableMap().getAllVariables().map((v) => v.getName())), ['teller']);
  assert.ok(await page.evaluate(() => Blockly.getMainWorkspace().getFlyout().getWorkspace().getTopBlocks().some((b) => b.type === 'setVar')), 'variable blocks offered');
  await page.mouse.click(30, 300); await page.waitForTimeout(200);
  // a new program from blocks: repeat 2 { beep }, motor C 90 degrees, teller = distance, a picture chosen in the picker
  await page.click('#btnProgNew'); await page.waitForTimeout(400);
  assert.deepStrictEqual(await blockTypes(), [['start']]);
  await wsLoad({ variables: [{ name: 'teller', id: 'vt' }], blocks: { languageVersion: 0, blocks: [{ type: 'start', x: 20, y: 20, next: { block:
    { type: 'repeat', inputs: { n: sh(2), DO: { block: { type: 'beepFor', fields: { note: 'C5' }, inputs: { n: sh(0.2) } } } }, next: { block:
      { type: 'motorFor', fields: { p: 'C', dir: 'cw', unit: 'deg' }, inputs: { n: sh(90) }, next: { block:
        { type: 'setVar', fields: { v: { id: 'vt' } }, inputs: { n: { shadow: { type: 'hr_num', fields: { NUM: 0 } }, block: { type: 'rep_sensor', fields: { S: 'dist' } } } }, next: { block:
          { type: 'img', id: 'pic1', fields: { img: '0000009090000009000909990' } } } } } } } } } }] } });
  await page.waitForTimeout(300);
  const picAt = await page.evaluate(() => { const f = Blockly.getMainWorkspace().getBlockById('pic1').getField('img'); const r = f.getSvgRoot().getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(picAt.x, picAt.y); await page.waitForTimeout(400);
  assert.ok(await page.$eval('#imgSheet', (e) => e.classList.contains('on')), 'picture picker opens');
  await page.click('#imgPresets .imgbtn[aria-label="hartje"]'); await page.click('#imgGrid .px[data-i="12"]');
  await page.click('#imgDone'); await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => Blockly.getMainWorkspace().getBlockById('pic1').getFieldValue('img')), '0909099999990990999000900');
  await page.click('#btnProgRename'); await page.waitForTimeout(200);
  assert.strictEqual(await page.$eval('#selProg', (e) => e.selectedOptions[0].textContent), 'Robotdans');
  n0 = await count();
  await page.click('#btnPlay'); await toastHas(/Programma klaar/, 15000);
  msgs = await since(n0);
  assert.strictEqual(msgs.filter((x) => x === 'tune 523:200').length, 2, msgs.join('|'));
  assert.ok(msgs.indexOf('deg C:90:75') > msgs.lastIndexOf('tune 523:200'), 'motor after the beeps');
  assert.ok(msgs.includes('img 0909099999990990999000900'), 'chosen picture');
  // saved: reload and the program is still there
  await page.waitForTimeout(500);
  await page.reload(); await page.waitForTimeout(500);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hubremote3')));
  const rd = saved.programs.find((p) => p.name === 'Robotdans');
  assert.ok(rd && rd.ws.variables.some((v) => v.name === 'teller'), JSON.stringify(rd && rd.ws.variables));
  await page.click('#btnConnect'); await waitPhase(page, 'ready');
  await page.click('.tab[data-view="viewCode"]'); await page.waitForTimeout(800);
  assert.deepStrictEqual(await blockTypes(), [['start', 'repeat', 'motorFor', 'setVar', 'img']]);
  // nothing to run without a When block
  await page.click('#btnProgNew'); await page.waitForTimeout(300);
  await wsLoad({ blocks: { languageVersion: 0, blocks: [{ type: 'moveStop', x: 20, y: 20 }] } });
  await page.click('#btnPlay'); await toastHas(/Wanneer-blok/);
  // STOP and leaving the screen stop a program that drives
  await wsLoad({ blocks: { languageVersion: 0, blocks: [{ type: 'start', x: 20, y: 20, next: { block: { type: 'moveStart', fields: { dir: 'fw' }, next: { block: { type: 'wait', inputs: { n: sh(10) } } } } } }] } });
  await page.click('#btnPlay'); await page.waitForTimeout(700);
  assert.notStrictEqual(await last(page), 'C:0 D:0', 'program drives');
  assert.strictEqual(await page.$eval('#codeStatus', (e) => e.textContent), 'Programma loopt');
  // one round button: STOP while running, play again afterwards
  assert.deepStrictEqual(await page.$eval('#btnPlay', (e) => [e.classList.contains('running'), e.getAttribute('aria-label')]), [true, 'STOP']);
  n0 = await count();
  await page.dispatchEvent('#btnPlay', 'pointerdown'); await page.waitForTimeout(400);
  assert.deepStrictEqual(await page.$eval('#btnPlay', (e) => [e.classList.contains('running'), e.getAttribute('aria-label')]), [false, 'Start']);
  assert.ok((await since(n0)).includes('halt')); assert.strictEqual(await last(page), 'C:0 D:0');
  assert.strictEqual(await page.evaluate(() => document.body.classList.contains('running')), false);
  await page.click('#btnPlay'); await page.waitForTimeout(500);
  await page.click('.tab[data-view="viewPlay"]'); await page.waitForTimeout(400);
  assert.strictEqual(await last(page), 'C:0 D:0', 'view switch stops the program');
  // events: wait until something is close; when the hub button is pressed (a second stack)
  await page.click('.tab[data-view="viewCode"]'); await page.waitForTimeout(600);
  await wsLoad({ blocks: { languageVersion: 0, blocks: [
    { type: 'start', x: 20, y: 20, next: { block: { type: 'waitUntil', inputs: { c: { block: { type: 'b_dist', fields: { op: '<' }, inputs: { n: sh(10) } } } }, next: { block: { type: 'beepFor', fields: { note: 'C5' }, inputs: { n: sh(0.5) } } } } } },
    { type: 'when', x: 20, y: 300, inputs: { c: { block: { type: 'b_and', inputs: { A: { block: { type: 'b_btn', fields: { b: 'L' } } }, B: { block: { type: 'b_not', inputs: { A: { block: { type: 'b_btn', fields: { b: 'R' } } } } } } } } } }, next: { block: { type: 'mood', fields: { mood: 'happy' } } } }] } });
  n0 = await count();
  await page.click('#btnPlay'); await page.waitForTimeout(500);
  assert.strictEqual(await page.$eval('#codeStatus', (e) => e.textContent), 'Wacht op gebeurtenissen');
  assert.ok(!(await since(n0)).some((x) => x.startsWith('tune')), 'nothing yet');
  await page.evaluate(() => { window.__hub.dist = 60; }); await page.waitForTimeout(600);
  assert.ok((await since(n0)).includes('tune 523:500'), 'beep once something is close');
  n0 = await count();
  await page.evaluate(() => window.__hub.say('btn L 1')); await page.waitForTimeout(500);
  assert.ok((await since(n0)).some((x) => x.startsWith('tune ') && x !== 'tune 523:500'), 'mood on the hub button');
  await page.evaluate(() => { window.__hub.dist = 350; });
  await page.dispatchEvent('#btnPlay', 'pointerdown'); await page.waitForTimeout(300);
  // drive keys do nothing while programming (arrows and letters belong to the editor)
  await page.keyboard.down('KeyW'); await page.waitForTimeout(400);
  assert.strictEqual(await last(page), 'C:0 D:0', 'W does not drive in the Code tab');
  await page.keyboard.up('KeyW');
  // wide screen: Code fills the screen; the header switch goes back to the overview and stops the program
  await wsLoad({ blocks: { languageVersion: 0, blocks: [{ type: 'start', x: 20, y: 20, next: { block: { type: 'moveStart', fields: { dir: 'fw' }, next: { block: { type: 'wait', inputs: { n: sh(10) } } } } } }] } });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(600);
  const ed = await rect(page, '#blocklyDiv');
  assert.ok(ed.w > 1200 && ed.h >= 450, 'editor fills a laptop screen ' + JSON.stringify(ed));
  assert.strictEqual(await page.$eval('#viewDrive', (e) => getComputedStyle(e).display), 'none', 'no driving controls while programming');
  assert.ok(await page.$eval('#modeSwitch .tab2[data-view="viewCode"]', (e) => e.classList.contains('on')));
  await page.click('#btnPlay'); await page.waitForTimeout(500);
  assert.notStrictEqual(await last(page), 'C:0 D:0', 'program drives');
  await page.click('#modeSwitch .tab2[data-view="viewDrive"]'); await page.waitForTimeout(500);
  assert.strictEqual(await last(page), 'C:0 D:0', 'switching to the overview stops the program');
  assert.strictEqual(await page.$eval('#viewCode', (e) => getComputedStyle(e).display), 'none', 'overview without the editor');
  assert.ok((await rect(page, '#pad')).w > 120 && (await rect(page, '#viewPlay')).w > 300, 'overview shows driving and play');
  await page.click('#modeSwitch .tab2[data-view="viewCode"]'); await page.waitForTimeout(600);
  // STOP stays on screen and the editor fits on phones
  for (const [w, h] of [[280, 653], [844, 390], [375, 667], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(400);
    if (!(await page.$eval('#viewCode', (e) => e.classList.contains('active')))) { await page.click('.tab[data-view="viewCode"]'); await page.waitForTimeout(600); }
    const b = await rect(page, '#btnPlay'), e = await rect(page, '#blocklyDiv');
    assert.ok(b.y >= 0 && b.y + b.h <= h && b.w > 60, w + 'x' + h + ' STOP visible: ' + JSON.stringify(b));
    assert.ok(e.h >= 250 && e.x >= 0 && e.x + e.w <= w + 0.5, w + 'x' + h + ' editor ' + JSON.stringify(e));
  }
  await page.screenshot({ path: OUT + '/code.png' });
  // English blocks after a language switch
  await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(300);
  await page.selectOption('#selLang', 'en'); await page.waitForTimeout(300);
  await page.click('.tab[data-view="viewCode"]'); await page.waitForTimeout(800);
  assert.ok(/Move|When/.test(await page.$eval('#blocklyDiv', (e) => e.textContent)), 'blocks in English');
  await page.context().close();
  console.log('H ok: card programs converted, example run with lit blocks, drag and snap, variable button, picture picker, save, STOP, view switch, events, no drive keys, full-screen code on wide screens, layouts, English');
  }
  // ---------- I. the small hub: 2 ports, no speaker, no light matrix ----------
  if (RUN('I')) {
  page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, { small: true, sensors: false });
  const count = () => page.evaluate(() => window.__hub.tunnel.length);
  const since = async (n) => (await tunnelOf(page)).slice(n);
  const toHub = (msgs) => msgs.filter((x) => /^(tune|beep|img)\b/.test(x));
  await page.click('#btnConnect'); await waitPhase(page, 'ready');
  await page.waitForFunction(() => /Essential-hub/.test(document.getElementById('log').textContent));
  await page.waitForFunction(() => document.getElementById('selLeft').value === 'A' && document.getElementById('selRight').value === 'B');
  assert.deepStrictEqual(await page.$$eval('#selLeft option', (o) => o.map((x) => x.value)), ['A', 'B'], 'only ports A and B');
  assert.strictEqual(await page.$eval('#infoKind', (e) => e.textContent), 'SPIKE™ Essential-hub (2 poorten)');
  // driving uses A and B
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500);
  assert.ok(/^A:-\d+ B:\d+$/.test(await last(page)) && (await last(page)) !== 'A:0 B:0', await last(page));
  await page.keyboard.up('KeyW'); await page.waitForTimeout(400);
  // horn, songs, robot sounds, robot language and the piano play on the phone: nothing goes to the hub
  let n0 = await count();
  await page.keyboard.down('KeyH'); await page.keyboard.up('KeyH');
  await page.click('.tab[data-view="viewPlay"]'); await page.waitForTimeout(400);
  assert.ok(/Essential-hub heeft geen luidspreker/.test(await page.$eval('#playWhere', (e) => e.textContent)));
  await page.click('#song-birthday'); await page.click('#mood-happy');
  await page.fill('#inpSay', 'Hallo'); await page.click('#btnSay');
  await ptr(page, '.wkey[data-note="E4"]', 'pointerdown', 0, 0, 1); await page.waitForTimeout(400);
  assert.deepStrictEqual(toHub(await since(n0)), [], 'no sound or pictures sent to the small hub');
  // blocks: the motors move, the beep plays on the phone, the picture is skipped
  await page.click('.tab[data-view="viewCode"]'); await page.waitForTimeout(800);
  await page.evaluate(() => { const ws = Blockly.getMainWorkspace(); ws.clear(); Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{ type: 'start', x: 20, y: 20, next: { block:
    { type: 'beepFor', fields: { note: 'C5' }, inputs: { n: { shadow: { type: 'hr_num', fields: { NUM: 0.2 } } } }, next: { block: { type: 'img', fields: { img: '0909099999999990999000900' }, next: { block:
      { type: 'moveFor', fields: { dir: 'fw', unit: 'cm' }, inputs: { n: { shadow: { type: 'hr_num', fields: { NUM: 10 } } } } } } } } } } }] } }, ws); });
  n0 = await count();
  await page.click('#btnPlay');
  await page.waitForFunction(() => /Programma klaar/.test(document.getElementById('toasts').textContent), null, { timeout: 15000 });
  const msgs = await since(n0);
  assert.ok(msgs.includes('deg A:-206:50 B:206:50'), msgs.join('|'));
  assert.deepStrictEqual(toHub(msgs), []);
  // the setting overrides the detection: as a big hub, the horn goes to the hub again and all ports are offered
  await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(400);
  await page.selectOption('#selHubKind', 'big'); await page.waitForTimeout(200);
  assert.strictEqual(await page.$$eval('#selLeft option', (o) => o.length), 6);
  assert.strictEqual(await page.$eval('#infoKind', (e) => e.textContent), 'SPIKE™ Prime-hub (6 poorten)');
  await page.click('.tab[data-view="viewDrive"]'); await page.waitForTimeout(400);
  n0 = await count();
  await page.keyboard.down('KeyH'); await page.keyboard.up('KeyH'); await page.waitForTimeout(200);
  assert.ok((await since(n0)).includes('beep'));
  await page.context().close();
  console.log('I ok: small hub recognised, ports A and B, sounds on the phone, no pictures, blocks run, setting overrides');
  }
  // ---------- J. Python on the hub ----------
  if (RUN('J')) {
  page = await open({ viewport: { width: 1366, height: 900 } });
  page.on('dialog', (d) => d.accept());
  const ev = () => page.evaluate(() => window.__hub.events.slice());
  const out = () => page.$eval('#pyOut', (e) => e.textContent);
  const runPy = async (src) => { await page.fill('#pyText', src); await page.click('#btnPlay'); };
  const backReady = () => page.waitForFunction(() => document.getElementById('pill').dataset.phase === 'ready' && !document.body.classList.contains('running'), null, { timeout: 8000 });
  await page.click('#btnConnect'); await waitPhase(page, 'ready');
  await page.click('#modeSwitch .tab2[data-view="viewCode"]'); await page.waitForTimeout(500);
  await page.click('#codeKind button[data-kind="python"]'); await page.waitForTimeout(300);
  let r = await page.evaluate(() => ({ py: !!document.getElementById('pyBox').getClientRects().length, blocks: !!document.getElementById('blocklyDiv').getClientRects().length,
    src: document.getElementById('pyText').value, kw: document.querySelectorAll('#pyHi .tk').length, fabIn: document.getElementById('btnPlay').parentNode.id,
    help: document.getElementById('codeHelp').textContent, ex: [...document.querySelectorAll('#selPyEx option')].map((o) => o.value), cheat: document.querySelectorAll('#pyCheat code').length }));
  assert.ok(r.py && !r.blocks, 'Python editor instead of blocks');
  assert.ok(/runloop\.run\(main\(\)\)/.test(r.src) && /light_matrix\.write/.test(r.src), 'starts with the hello example');
  assert.ok(r.kw > 3, 'keywords coloured'); assert.strictEqual(r.fabIn, 'pyEdit');
  assert.ok(/slot 18/.test(r.help) && /slot 19/.test(r.help), r.help);
  assert.deepStrictEqual(r.ex, ['', 'hello', 'square', 'wall', 'line', 'tilt', 'empty']); assert.ok(r.cheat > 10);
  const fab = await rect(page, '#btnPlay'), box = await rect(page, '#pyEdit');
  assert.ok(fab.x + fab.w <= box.x + box.w && fab.y + fab.h <= box.y + box.h && fab.y + fab.h <= 900, 'run button in the editor corner, on screen');
  // typing: Enter keeps the indent and adds 4 after a colon; Tab gives spaces
  await page.fill('#pyText', ''); await page.focus('#pyText');
  await page.keyboard.type('for i in range(3):'); await page.keyboard.press('Enter'); await page.keyboard.type('x = i'); await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace'); await page.keyboard.press('Tab'); await page.keyboard.type('y');
  assert.strictEqual(await page.$eval('#pyText', (e) => e.value), 'for i in range(3):\n    x = i\n    y');
  assert.strictEqual(await page.$eval('#pyNums', (e) => e.textContent.trim().split('\n').length), 3);
  // run: the code goes to slot 18, print() shows up, then the remote control in slot 19 starts again
  let e0 = (await ev()).length;
  await runPy("print('een')\nprint('twee')\n");
  await page.waitForFunction(() => /twee/.test(document.getElementById('pyOut').textContent));
  await page.waitForFunction(() => /Python-programma klaar/.test(document.getElementById('pyOut').textContent));
  await backReady();
  let evs = (await ev()).slice(e0);
  assert.ok(evs.includes('upload:program.py:18') && evs.includes('start:18'), evs.join(' '));
  assert.ok(evs.indexOf('start:19') > evs.indexOf('start:18'), 'remote control restarted after Python: ' + evs.join(' '));
  assert.ok(!evs.includes('upload:program.py:19'), 'remote control not uploaded again');
  assert.ok(await page.evaluate(() => window.__hub.running === 'control'));
  assert.ok(/een\s*twee/.test(await out()));
  // an error points at the line
  await runPy("print('a')\nx = 1/0\n");
  await page.waitForFunction(() => /Fout in je code op regel 2/.test(document.getElementById('toasts').textContent));
  assert.strictEqual(await page.$eval('#pyNums .err', (e) => e.textContent), '2');
  assert.ok(await page.$eval('#pyOut', (e) => !!e.querySelector('.err')));
  await backReady();
  // STOP (the round button) stops a program that keeps running
  await runPy("while True:\n    pass\n");
  await page.waitForFunction(() => window.__hub.running === 'python' && document.getElementById('pill').dataset.phase === 'python');
  assert.ok(await page.$eval('#btnPlay', (e) => e.classList.contains('running')));
  assert.ok(await page.$eval('#drive', (e) => e.classList.contains('idle')), 'no driving while Python runs');
  e0 = (await ev()).length;
  await page.click('#btnPlay');
  await page.waitForFunction(() => /Python-programma gestopt/.test(document.getElementById('pyOut').textContent));
  await backReady();
  evs = (await ev()).slice(e0);
  assert.strictEqual(evs[0], 'stop', evs.join(' ')); assert.ok(evs.includes('start:19'));
  // leaving the Code screen stops it too
  await runPy("while True:\n    pass\n");
  await page.waitForFunction(() => window.__hub.running === 'python');
  await page.click('#modeSwitch .tab2[data-view="viewDrive"]');
  await page.waitForFunction(() => window.__hub.running === 'control', null, { timeout: 8000 });
  await backReady();
  // an example uses the robot's ports; code and mode are kept after a reload
  await page.click('#modeSwitch .tab2[data-view="viewCode"]'); await page.waitForTimeout(400);
  await page.selectOption('#selPyEx', 'square'); await page.waitForTimeout(100);
  r = await page.evaluate(() => ({ src: document.getElementById('pyText').value, l: document.getElementById('selLeft').value, rr: document.getElementById('selRight').value }));
  assert.ok(r.src.includes('motor_pair.pair(motor_pair.PAIR_1, port.' + r.l + ', port.' + r.rr + ')'), r.src);
  await page.click('#btnProgNew'); await page.fill('#pyText', "print('bewaard')\n"); await page.waitForTimeout(500);
  await page.reload(); await page.waitForTimeout(500);
  await page.click('#modeSwitch .tab2[data-view="viewCode"]'); await page.waitForTimeout(500);
  r = await page.evaluate(() => ({ src: document.getElementById('pyText').value, n: document.getElementById('selProg').options.length, py: !!document.getElementById('pyBox').getClientRects().length }));
  assert.ok(r.py && r.src === "print('bewaard')\n" && r.n === 2, JSON.stringify(r));
  // back to blocks: Blockly and its run button return
  await page.click('#codeKind button[data-kind="blocks"]'); await page.waitForTimeout(600);
  assert.strictEqual(await page.$eval('#btnPlay', (e) => e.parentNode.id), 'blocklyDiv');
  assert.ok(await page.evaluate(() => Blockly.getMainWorkspace().getTopBlocks().length > 0));
  // the run button stays on screen in Python mode on phones, landscape and tablets
  await page.click('#codeKind button[data-kind="python"]'); await page.waitForTimeout(300);
  for (const [w, h] of [[320, 568], [390, 844], [844, 390], [768, 1024], [1366, 700]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(350);
    if (w < 900 && !(await page.$eval('#viewCode', (e) => e.classList.contains('active')))) { await page.click('.tab[data-view="viewCode"]'); await page.waitForTimeout(400); }
    await page.evaluate(() => document.getElementById('main').scrollTo(0, 0));
    const b = await rect(page, '#btnPlay');
    assert.ok(b.y >= 0 && b.y + b.h <= h && b.x + b.w <= w, w + 'x' + h + ' Python run button visible: ' + JSON.stringify(b));
  }
  await page.context().close();
  console.log('J ok: Python editor, run in its own slot, output, error line, STOP, view switch, examples, kept after reload, run button on every size');
  }
  // ---------- K. building models and the wiring diagram ----------
  if (RUN('K')) {
  page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, { sensors: true });
  const wire = (sel) => page.$$eval(sel + ' .w-port', (g) => g.map((x) => x.dataset.port + ':' + (x.classList.contains('ok') ? 'ok' : x.classList.contains('bad') ? 'bad' : x.classList.contains('extra') ? 'extra' : x.classList.contains('used') ? 'used' : '-')));
  await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(400);
  assert.deepStrictEqual(await wire('#wiring'), ['A:used', 'B:used', 'C:-', 'D:-', 'E:-', 'F:-'], 'default profile: left A, right B, not connected');
  assert.ok(!(await page.$eval('#wireLive', (e) => e.classList.contains('on'))));
  await page.click('.tab[data-view="viewDrive"]'); await page.waitForTimeout(300);
  await page.click('#btnConnect'); await waitPhase(page, 'ready');
  await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(400);
  // motors on C and D are taken over and shown green; the sensors the hub finds are grey extras
  await page.waitForFunction(() => document.querySelector('#wiring .w-port[data-port="C"]').classList.contains('ok'));
  assert.deepStrictEqual(await wire('#wiring'), ['A:extra', 'B:extra', 'C:ok', 'D:ok', 'E:-', 'F:extra']);
  assert.ok(await page.$eval('#wireLive', (e) => e.classList.contains('on')));
  // the catalogue: four models, links to LEGO Education's own instructions in a new tab
  const models = await page.$$eval('#models .model', (m) => m.map((x) => ({ id: x.dataset.model, href: x.querySelector('a').href, target: x.querySelector('a').target, ports: x.querySelectorAll('.w-port').length, used: x.querySelectorAll('.w-port.used').length })));
  assert.deepStrictEqual(models.map((m) => m.id), ['db', 'db3', 'adb', 'ess']);
  assert.ok(models.every((m) => m.target === '_blank' && /^https:\/\/education\.lego\.com\/nl-nl\/product-resources\/.+\/building-instructions\/$/.test(m.href)), JSON.stringify(models));
  assert.deepStrictEqual(models.map((m) => [m.ports, m.used]), [[6, 3], [6, 4], [6, 6], [2, 2]]);
  // use the Advanced Driving Base: profile with its ports, example programs in blocks and Python
  await page.click('#models .model[data-model="adb"] .btn.primary'); await page.waitForTimeout(300);
  await page.waitForFunction(() => /Geavanceerde rijbasis" staat klaar/.test(document.getElementById('toasts').textContent));
  let r = await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('hubremote3')), p = g.profiles.find((x) => x.id === g.active);
    return { p, n: g.profiles.length, progs: g.programs.map((x) => x.name), py: g.py.map((x) => x.name), line: (g.py.find((x) => x.name === 'Stop op zwart') || {}).src, active: g.progActive === g.programs.find((x) => x.name === 'Vierkant rijden').id }; });
  assert.strictEqual(r.p.name, 'Geavanceerde rijbasis'); assert.strictEqual(r.p.model, 'adb');
  assert.deepStrictEqual([r.p.left, r.p.right, r.p.aux[0].port, r.p.aux[1].port, r.p.aux[0].name], ['E', 'A', 'C', 'D', 'Werktuig C']);
  assert.ok(r.progs.includes('Vierkant rijden') && r.progs.includes('Stop op zwart') && r.active, r.progs.join());
  assert.ok(r.py.includes('Vierkant rijden') && r.py.includes('Stop op zwart'), r.py.join());
  assert.ok(r.line.includes('motor_pair.pair(motor_pair.PAIR_1, port.E, port.A)') && r.line.includes('color_sensor.color(port.B) != color.BLACK'), r.line);
  assert.strictEqual(await page.$eval('#selLeft', (e) => e.value), 'E');
  // live check: A has a distance sensor instead of a motor (red), B has the colour sensor (green), no motor on E (red)
  assert.deepStrictEqual(await wire('#wiring'), ['A:bad', 'B:ok', 'C:ok', 'D:ok', 'E:bad', 'F:bad']);
  // using it again switches to the same profile instead of adding one
  const nProfiles = r.n;
  await page.click('#models .model[data-model="db"] .btn.primary'); await page.waitForTimeout(200);
  await page.click('#models .model[data-model="adb"] .btn.primary'); await page.waitForTimeout(300);
  r = await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('hubremote3')); return { n: g.profiles.length, names: g.programs.filter((x) => x.name === 'Vierkant rijden').length }; });
  assert.strictEqual(r.n, nProfiles + 1, 'one new profile for Driving Base, none for the second tap'); assert.strictEqual(r.names, 1, 'no duplicate programs');
  // the starter program opens as blocks
  await page.click('.tab[data-view="viewCode"]'); await page.waitForTimeout(800);
  assert.deepStrictEqual(await page.evaluate(() => Blockly.getMainWorkspace().getTopBlocks(true).map((b) => { const o = []; for (let x = b; x; x = x.getNextBlock()) o.push(x.type); return o; })), [['start', 'repeat', 'mood']]);
  await page.selectOption('#selProg', { label: 'Stop op zwart' }); await page.waitForTimeout(500);
  assert.deepStrictEqual(await page.evaluate(() => Blockly.getMainWorkspace().getTopBlocks(true).map((b) => { const o = []; for (let x = b; x; x = x.getNextBlock()) o.push(x.type); return o; })), [['start', 'moveSpeed', 'moveStart', 'waitUntil', 'moveStop', 'mood']]);
  // the share sheet shows the wiring, and the link carries the model
  await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(400);
  await page.click('#btnShare'); await page.waitForTimeout(300);
  assert.strictEqual(await page.$$eval('#shareWiring .w-port.used', (g) => g.length), 6);
  const link = await page.$eval('#shareLink', (e) => e.value);
  await page.click('#btnCloseShare');
  const p2 = await open({ viewport: { width: 390, height: 844 } }, {}, link);
  r = await p2.evaluate(() => { const g = JSON.parse(localStorage.getItem('hubremote3')); return g.profiles.find((x) => x.id === g.active); });
  assert.strictEqual(r.model, 'adb', 'model kept in the share link');
  await p2.context().close();
  // small hub: two ports in the diagram
  await page.selectOption('#selHubKind', 'small'); await page.waitForTimeout(200);
  assert.strictEqual(await page.$$eval('#wiring .w-port', (g) => g.length), 2);
  await page.context().close();
  console.log('K ok: wiring diagram with live check, four models linking to the official instructions, profile and example programs, share link, small hub');
  }
  // ---------- L. importing an LDraw file exported from BrickLink Studio ----------
  if (RUN('L')) {
  page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const at = (file, x = 0) => `1 16 ${x} 0 0 1 0 0 0 1 0 0 0 1 ${file}`;
  const pick = (name, text) => page.setInputFiles('#ldrFile', { name, mimeType: 'text/plain', buffer: Buffer.from(text) });
  const toastHas = (re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('toasts').textContent), re.source, { timeout: 5000 });
  await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(400);
  // a project file and a non-LDraw file are refused with a hint
  await page.setInputFiles('#ldrFile', { name: 'robot.io', mimeType: 'application/octet-stream', buffer: Buffer.from('PK\u0003\u0004') });
  await toastHas(/Studio-projectbestand \(\.io\)/);
  await pick('notes.txt', 'just some text'); await toastHas(/niet lezen als LDraw/);
  assert.ok(await page.$eval('#ldrResult', (e) => e.hidden));
  // an own design: hub, two medium motors, a large motor and a distance sensor -> ports are a guess
  await pick('Mijn robot.ldr', ['0 Untitled Model', '0 Name: Mijn robot.ldr', '0 Author: test', at('45601c01.dat'), at('54696p01c01.dat', 40), at('54696p01c01.dat', -40),
    at('54675c01.dat', 60), at('37316c01.dat', 90), at('3001.dat'), at('32524.dat'), at('32524.dat', 8)].join('\r\n'));
  await page.waitForFunction(() => !document.getElementById('ldrResult').hidden);
  let r = await page.evaluate(() => ({ text: document.getElementById('ldrResult').innerText, chips: [...document.querySelectorAll('#ldrResult .chip')].map((c) => c.textContent),
    used: [...document.querySelectorAll('#ldrResult .w-port.used')].map((g) => g.dataset.port) }));
  assert.deepStrictEqual(r.chips, ['1× SPIKE™ Prime-hub', '1× grote motor', '2× middelgrote motor', '1× afstandssensor']);
  assert.ok(/"Untitled Model": 8 onderdelen/.test(r.text) && /Dit is een gok/.test(r.text), r.text);
  assert.deepStrictEqual(r.used, ['A', 'B', 'C', 'D']);
  await page.click('#btnLdrMake');
  await toastHas(/Profiel "Untitled Model" gemaakt/);
  r = await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('hubremote3')); return { p: g.profiles.find((x) => x.id === g.active), progs: g.programs.map((x) => x.name) }; });
  assert.deepStrictEqual([r.p.left, r.p.right, r.p.aux[0].port, r.p.aux[0].name, r.p.sens, r.p.model], ['A', 'B', 'C', 'Grote motor', { D: 'distance' }, '']);
  assert.ok(r.progs.includes('Vierkant rijden') && !r.progs.includes('Stop op zwart'), r.progs.join());
  assert.deepStrictEqual(await page.$$eval('#wiring .w-port.used', (g) => g.map((x) => x.dataset.port)), ['A', 'B', 'C', 'D']);
  // the share link keeps the sensor
  await page.click('#btnShare'); await page.waitForTimeout(300);
  const link = await page.$eval('#shareLink', (e) => e.value); await page.click('#btnCloseShare');
  const p2 = await open({ viewport: { width: 390, height: 844 } }, {}, link);
  r = await p2.evaluate(() => { const g = JSON.parse(localStorage.getItem('hubremote3')); return g.profiles.find((x) => x.id === g.active).sens; });
  assert.deepStrictEqual(r, { D: 'distance' }); await p2.context().close();
  // a Studio .mpd with submodels that matches Driving Base 3: the ports from its instructions are used
  await pick('db3.mpd', ['0 FILE main.ldr', '0 Rijrobot', at('45601.dat'), at('drive.ldr'), at('54675c01.dat'), at('37308c01.dat'),
    '0 FILE drive.ldr', at('54696p01c01.dat'), at('54696p01c01.dat', 40), at('3001.dat')].join('\n'));
  await page.waitForFunction(() => /Rijbasis 3/.test(document.getElementById('ldrResult').innerText));
  await page.click('#btnLdrMake'); await page.waitForTimeout(300);
  r = await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('hubremote3')); return g.profiles.find((x) => x.id === g.active); });
  assert.deepStrictEqual([r.name, r.model, r.left, r.right, r.aux[0].port], ['Rijrobot', 'db3', 'C', 'D', 'E']);
  // nothing from SPIKE in the file
  await pick('house.ldr', ['0 House', at('3001.dat'), at('3003.dat')].join('\n'));
  await page.waitForFunction(() => /Geen SPIKE™-hub/.test(document.getElementById('ldrResult').innerText));
  assert.strictEqual(await page.$('#btnLdrMake'), null);
  await page.context().close();
  console.log('L ok: LDraw import (.ldr, .mpd), part list, port guess, official model recognised, profile with sensors, share link, .io and bad files');
  }
  // ---------- M. building guides: LDraw models step by step in 3D ----------
  if (RUN('M')) {
  // as a single file there is no viewer: a clear message
  page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(300);
  await page.click('#btnBuildDemo');
  await page.waitForFunction(() => /werken via de website/.test(document.getElementById('toasts').textContent));
  await page.context().close();
  page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, {}, server.url + 'app/');
  // headless Chrome draws 3D in software: let queued input and frames finish before reading the page
  const settle = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 30)))));
  const stepText = async () => { await settle(); return page.$eval('#buildStep', (e) => e.textContent); };
  const chips = async () => { await settle(); return page.$$eval('#buildParts .bpart', (c) => c.map((x) => x.textContent)); };
  await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(300);
  assert.ok(await page.$eval('#btnBuild', (e) => e.classList.contains('hide2')), 'no guide for the default profile');
  // the example: loads the viewer and the brick pack, 12 steps, parts per step in Dutch colours
  await page.click('#btnBuildDemo');
  await page.waitForFunction(() => /Stap 1 van 12/.test(document.getElementById('buildStep').textContent), null, { timeout: 30000 });
  assert.deepStrictEqual(await chips(), ['1×Plate 2 x 6 · donkergrijs']);
  // the brick shapes are credited as LDraw.org asks, with the licences one tap away
  const credit = await page.$eval('.bcredit', (e) => ({ text: e.innerText, links: [...e.querySelectorAll('a')].map((a) => a.getAttribute('href')), shown: e.getClientRects().length > 0 }));
  assert.ok(credit.shown && /The LDraw Parts Library/.test(credit.text) && /LDraw™ is een handelsmerk/.test(credit.text), credit.text);
  assert.deepStrictEqual(credit.links, ['https://www.ldraw.org/', 'LICENSE-NOTICES.txt']);
  let canvas = await page.$eval('#buildView canvas', (c) => [c.clientWidth, c.clientHeight]);
  assert.ok(canvas[0] > 300 && canvas[1] > 300, 'canvas fills the view: ' + canvas);
  const shot1 = await page.locator('#buildView').screenshot();
  await page.click('#btnBuildNext');
  await page.waitForFunction(() => document.getElementById('buildStep').textContent === 'Stap 2 van 12', null, { timeout: 5000 });
  assert.deepStrictEqual(await chips(), ['2×Brick 2 x 2 · blauw']);
  const shot2 = await page.locator('#buildView').screenshot();
  assert.ok(shot1.length > 3000 && !shot1.equals(shot2), 'the model is drawn and changes per step');
  await page.$eval('#buildRange', (e) => { e.value = '12'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.strictEqual(await stepText(), 'Stap 12 van 12'); assert.strictEqual(await page.$eval('#btnBuildNext', (e) => e.textContent), 'Klaar!');
  assert.deepStrictEqual(await chips(), ['1×Plate 1 x 1 Round · donkergrijs', '1×Plate 1 x 1 Round · doorzichtig rood']);
  await settle(); await page.click('#btnBuildNext');   // Klaar! closes the guide
  await page.waitForFunction(() => !document.getElementById('buildSheet').classList.contains('on'));
  // the Rover: only SPIKE Prime set parts, every part in the brick pack
  await page.click('#btnBuildRover');
  await page.waitForFunction(() => /Stap 1 van 9/.test(document.getElementById('buildStep').textContent), null, { timeout: 30000 });
  assert.strictEqual(await page.$eval('#buildTitle', (e) => e.textContent), 'Rover');
  assert.ok(!/grijs blok/.test(await page.$eval('#buildNote', (e) => e.textContent)), 'no missing parts');
  await settle(); await page.click('#btnBuildNext');
  await page.waitForFunction(() => document.getElementById('buildStep').textContent === 'Stap 2 van 9');
  assert.deepStrictEqual(await chips(), ['2×Technic Pin Long with Friction and Slot · blauw', '1×Electric Powered Up Medium Angular Motor with Medium Azure Back and Hub Pattern · wit']);
  await page.click('#btnBuildClose');
  await page.waitForFunction(() => !document.getElementById('buildSheet').classList.contains('on'));
  assert.strictEqual(await page.$$eval('#buildView canvas', (c) => c.length), 0, 'viewer cleaned up');
  // the Veegbot: all three motors, colour and force sensor; every part in the brick pack
  await page.click('#btnBuildVeegbot');
  await page.waitForFunction(() => /Stap 1 van 12/.test(document.getElementById('buildStep').textContent), null, { timeout: 30000 });
  assert.ok(!/grijs blok/.test(await page.$eval('#buildNote', (e) => e.textContent)), 'no missing parts');
  await settle(); await page.$eval('#buildRange', (e) => { e.value = '12'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.deepStrictEqual(await chips(), ['2×Technic Pin with Friction and Slots · zwart', '1×Electric Powered Up Force Sensor · wit']);
  await page.click('#btnBuildClose');
  await page.waitForFunction(() => !document.getElementById('buildSheet').classList.contains('on'));
  // an own file without steps, with a part that is not in the pack: steps made bottom-up, a grey block
  const at = (file, y, c = 4) => `1 ${c} 0 ${y} 0 1 0 0 0 1 0 0 0 1 ${file}`;
  const tower = ['0 Toren', at('3001.dat', -48), at('3001.dat', 0), at('3001.dat', -24), at('99999.dat', -72, 1), at('45601c01.dat', -200, 16)].join('\n');
  await page.setInputFiles('#ldrFile', { name: 'toren.ldr', mimeType: 'text/plain', buffer: Buffer.from(tower) });
  await page.waitForFunction(() => document.getElementById('btnLdrBuild'));
  await page.click('#btnLdrBuild');
  await page.waitForFunction(() => /Stap 1 van 5/.test(document.getElementById('buildStep').textContent), null, { timeout: 30000 });
  const note = await page.$eval('#buildNote', (e) => e.textContent);
  assert.ok(/geen bouwstappen/.test(note) && /1 soort\(en\) onderdelen/.test(note), note);
  assert.deepStrictEqual(await chips(), ['1×Brick 2 x 4 · rood'], 'lowest brick first');
  for (let k = 0; k < 3; k++) { await settle(); await page.keyboard.press('ArrowRight'); }
  assert.strictEqual(await stepText(), 'Stap 4 van 5');
  assert.ok((await chips())[0].includes('99999.dat'), 'unknown part listed');
  assert.ok(await page.$eval('#buildParts .bpart', (e) => e.classList.contains('miss')));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('buildSheet').classList.contains('on'));
  // make a profile from it: the guide is kept with the profile and opens again after a reload
  await page.click('#btnLdrMake'); await page.waitForTimeout(300);
  assert.ok(!(await page.$eval('#btnBuild', (e) => e.classList.contains('hide2'))), 'guide button for this profile');
  await page.reload(); await page.waitForTimeout(400);
  await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(300);
  await page.click('#btnBuild');
  await page.waitForFunction(() => /Stap 1 van 5/.test(document.getElementById('buildStep').textContent), null, { timeout: 30000 });
  assert.strictEqual(await page.$eval('#buildTitle', (e) => e.textContent), 'Toren');
  // opening a guide stops the robot like any other screen; drive keys do nothing meanwhile
  await page.click('#btnBuildClose');
  await page.context().close();
  console.log('M ok: building guides: example, steps and parts, own file with made-up steps and a grey block, kept with the profile, keys, offline message');
  }
  // ---------- N. animations, blocks as Python, a drawn route, a game controller ----------
  if (RUN('N')) {
  page = await open({ viewport: { width: 1280, height: 860 } }, {}, FILE, () => {
    // A stand-in game controller: the test sets window.__pad.axes/buttons.
    window.__pad = { connected: true, index: 0, id: 'Test pad', mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.__pad];
  });
  await page.click('#btnConnect'); await waitPhase(page, 'ready');
  const pad = (axes, btns) => page.evaluate(([axes, btns]) => { if (axes) window.__pad.axes = axes; window.__pad.buttons.forEach((b, i) => { b.pressed = !!(btns || []).includes(i); b.value = b.pressed ? 1 : 0; }); }, [axes, btns]);
  // 1. animation: frames go to the hub one after another, a view switch stops it
  await page.evaluate(() => document.getElementById('animCard').scrollIntoView());
  let n0 = (await cmds(page)).length;
  await page.click('#btnAnimPlay'); await page.waitForTimeout(800);
  let imgs = (await cmds(page)).slice(n0).filter((x) => /^img \d{25}$/.test(x));
  assert.ok(imgs.length >= 2 && imgs[0] !== imgs[1], 'frames sent in turn: ' + imgs.slice(0, 3).join(' | '));
  await page.click('#btnAnimAdd'); await page.waitForTimeout(100);
  assert.strictEqual(await page.$$eval('#animFrames .framebtn', (b) => b.length), 3, 'frame added');
  // (wide screen: one overview, so the switch to Code is the view switch)
  await page.click('#modeSwitch .tab2[data-view="viewCode"]'); await page.waitForTimeout(600);
  n0 = (await cmds(page)).length; await page.waitForTimeout(700);
  assert.ok(!(await cmds(page)).slice(n0).some((x) => /^img /.test(x)), 'animation stopped by the view switch');
  // 2. blocks as Python: the default program (a square) becomes MicroPython; open it in the Python editor
  await page.click('#btnAsPy'); await page.waitForTimeout(200);
  let py = await page.$eval('#pyView', (e) => e.textContent);
  assert.ok(/import motor/.test(py) && /async def stack1\(\):/.test(py) && /runloop\.run\(stack1\(\)\)/.test(py) && /await drive\(/.test(py), py.slice(0, 300));
  assert.ok(await page.$eval('#pyView', (e) => e.querySelectorAll('.tk').length > 5), 'coloured');
  const nPy = await page.evaluate(() => JSON.parse(localStorage.getItem('hubremote3')).py.length);
  await page.click('#btnPyOpen'); await page.waitForTimeout(300);
  r = await page.evaluate(() => ({ mode: JSON.parse(localStorage.getItem('hubremote3')).codeMode, n: JSON.parse(localStorage.getItem('hubremote3')).py.length,
    src: document.getElementById('pyText').value, asPy: document.getElementById('btnAsPy').classList.contains('hide2') }));
  assert.ok(r.mode === 'python' && r.n === nPy + 1 && r.src.trim() === py.trim() && r.asPy, JSON.stringify(r).slice(0, 200));
  await page.click('#codeKind button[data-kind="blocks"]'); await page.waitForTimeout(300);
  // 3. a drawn route: up, then right; drives on the hub as exact moves
  await page.click('#modeSwitch .tab2[data-view="viewDrive"]'); await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('btnDraw').scrollIntoView());
  await page.click('#btnDraw'); await page.waitForTimeout(200);
  assert.ok(await page.$eval('#btnDrawGo', (e) => e.disabled), 'nothing to drive yet');
  const cv = await rect(page, '#drawCanvas');
  const at = (fx, fy) => [cv.x + cv.w * fx, cv.y + cv.h * fy];
  let [px, py0] = at(0.5, 0.9);
  await ptr(page, '#drawCanvas', 'pointerdown', px, py0, 1);
  for (let i = 1; i <= 20; i++) { const [x, y] = at(0.5 + (i % 2 ? 0.003 : -0.003), 0.9 - i * 0.02); await ptr(page, '#drawCanvas', 'pointermove', x, y, 1); }
  for (let i = 1; i <= 10; i++) { const [x, y] = at(0.5 + i * 0.03, 0.5); await ptr(page, '#drawCanvas', 'pointermove', x, y, 1); }
  await ptr(page, '#drawCanvas', 'pointerup', ...at(0.8, 0.5), 1); await page.waitForTimeout(100);
  assert.strictEqual(await page.$eval('#drawInfo', (e) => e.textContent), '2 stukken, samen 70 cm');
  n0 = (await cmds(page)).length;
  await page.click('#btnDrawGo'); await page.waitForTimeout(1200);
  const moves = (await cmds(page)).slice(n0).filter((x) => /^deg /.test(x));
  assert.ok(moves.length >= 1 && /^deg C:-?\d+:\d+ D:-?\d+:\d+$/.test(moves[0]), 'first stretch as an exact move: ' + moves.join(' | '));
  assert.ok(await page.evaluate(() => document.getElementById('viewDrive').classList.contains('active')), 'runs in the Drive view');
  await page.click('#btnStop'); await page.waitForTimeout(200);
  await page.click('#btnDraw'); await page.click('#btnDrawSave'); await page.waitForTimeout(200);
  r = await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('hubremote3')); const p = g.programs.find((x) => x.id === g.progActive); return { name: p.name, types: JSON.stringify(p.ws).match(/"type":"\w+"/g) }; });
  assert.strictEqual(r.name, 'Getekende route'); assert.ok(r.types.includes('"type":"turn"') && r.types.includes('"type":"moveFor"'), r.types.join());
  // 4. game controller: left stick drives, centre first after STOP (B), A is the horn, no driving in Code
  await page.evaluate(() => window.dispatchEvent(new Event('gamepadconnected'))); await page.waitForTimeout(100);
  assert.ok(/Gamecontroller gevonden/.test(await page.$eval('#toasts', (e) => e.textContent)));
  await pad([0, 0, 0, 0]); await page.waitForTimeout(150);
  await pad([0, -1, 0, 0]); await page.waitForTimeout(700);
  let d = await last(page);
  assert.ok(/^C:-\d+ D:\d+$/.test(d) && +d.split(' ')[1].slice(2) > 30, 'stick forward drives: ' + d);
  await pad([0, -1, 0, 0], [1]); await page.waitForTimeout(400);
  assert.strictEqual(await last(page), 'C:0 D:0', 'B is STOP');
  assert.ok((await cmds(page)).slice(-6).includes('halt'));
  await pad([0, -1, 0, 0], []); await page.waitForTimeout(500);
  assert.strictEqual(await last(page), 'C:0 D:0', 'still held after STOP: stays stopped until the stick is let go');
  await pad([0, 0, 0, 0]); await page.waitForTimeout(150); await pad([0.9, 0, 0, 0]); await page.waitForTimeout(600);
  d = await last(page); assert.ok(/^C:-\d+ D:-\d+$/.test(d), 'stick right turns right: ' + d);
  await pad([0, 0, 0, 0]); await page.waitForTimeout(500);
  n0 = (await cmds(page)).length; await pad([0, 0, 0, 0], [0]); await page.waitForTimeout(200); await pad([0, 0, 0, 0], []);
  assert.ok((await cmds(page)).slice(n0).includes('beep'), 'A is the horn');
  await page.click('#modeSwitch .tab2[data-view="viewCode"]'); await page.waitForTimeout(500);
  await pad([0, -1, 0, 0]); await page.waitForTimeout(500);
  assert.strictEqual(await last(page), 'C:0 D:0', 'no driving in the Code view');
  await pad([0, 0, 0, 0]);
  await page.context().close();
  console.log('N ok: light animation, blocks as Python into the editor, drawn route driven and saved, game controller with STOP and centre lock');
  }
  // ---------- O. more languages: detected from the browser, loaded on demand, switched at runtime, offline fallback ----------
  if (RUN('O')) {
  const L = (c) => require('../src/i18n/' + c + '.json');
  const tabText = (pg) => pg.$eval('.tab[data-view="viewDrive"]', (e) => e.textContent.trim());
  const note = (pg) => pg.$eval('#langNote', (e) => (e.classList.contains('hide2') ? '' : e.textContent));
  page = await open({ viewport: { width: 390, height: 844 }, locale: 'de-DE' }, {}, HTTP);
  await page.waitForTimeout(500);
  let r = await page.evaluate(() => ({ lang: document.documentElement.lang, loaded: Object.keys(I18N).sort().join(), scripts: [...document.scripts].map((s) => s.getAttribute('src')).filter(Boolean) }));
  assert.deepStrictEqual([r.lang, r.loaded], ['de', 'de,en,nl'], JSON.stringify(r));
  assert.ok(r.scripts.includes('lang/de.js'), 'German texts come from their own file');
  assert.strictEqual(await tabText(page), L('de')['tab.drive']);
  assert.ok((await note(page)).startsWith(L('de')['lang.unreviewed'].split('{0}')[0].trim().slice(0, 20)), 'note that the translation is not reviewed yet');
  await page.click('.tab[data-view="viewCode"]'); await page.waitForTimeout(700);
  const cats = await page.$$eval('.blocklyToolboxCategory, .blocklyTreeRow', (n) => n.map((x) => x.textContent.trim()));
  assert.ok(cats.includes(L('de')['cat.move']), 'toolbox in German: ' + cats.join(', '));
  // switch to French at runtime: the file loads, then the page changes
  await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(400);
  await page.selectOption('#selLang', 'fr'); await page.waitForTimeout(800);
  r = await page.evaluate(() => ({ lang: document.documentElement.lang, has: !!I18N.fr }));
  assert.deepStrictEqual(r, { lang: 'fr', has: true });
  assert.strictEqual(await tabText(page), L('fr')['tab.drive']);
  await page.selectOption('#selLang', 'nl'); await page.waitForTimeout(300);
  assert.strictEqual(await note(page), '', 'no note for the owner\'s own language');
  // a stored choice loads before the app starts (no flash of another language)
  await page.selectOption('#selLang', 'ja'); await page.waitForTimeout(800);
  await page.reload(); await page.waitForTimeout(500);
  assert.strictEqual(await page.$eval('html', (e) => e.lang), 'ja');
  assert.strictEqual(await tabText(page), L('ja')['tab.drive']);
  await page.context().close();
  // offline and not cached: English, with a note
  page = await open({ viewport: { width: 390, height: 844 }, locale: 'pl-PL' }, {}, HTTP, null);
  // with the service worker in charge, as in the installed app (its offline answer must not be the page)
  await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready);
  await page.evaluate(() => caches.keys().then((ks) => Promise.all(ks.map((k) => caches.open(k).then((c) => c.keys().then((rs) => Promise.all(rs.filter((r) => /\/lang\//.test(r.url)).map((r) => c.delete(r)))))))));
  await page.reload(); await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
  await page.evaluate(() => caches.keys().then((ks) => Promise.all(ks.map((k) => caches.open(k).then((c) => c.keys().then((rs) => Promise.all(rs.filter((r) => /\/lang\//.test(r.url)).map((r) => c.delete(r)))))))));
  await page.context().route('**/lang/*.js', (rt) => rt.abort());
  await page.reload(); await page.waitForTimeout(500);
  assert.strictEqual(await tabText(page), L('en')['tab.drive']);
  await page.click('.tab[data-view="viewSettings"]'); await page.waitForTimeout(300);
  assert.strictEqual(await note(page), L('en')['lang.loadFail']);
  await page.context().close();
  console.log('O ok: German detected and loaded on demand, French at runtime, Japanese stored, offline falls back to English with a note');
  }
  // ---------- P. keyboard: labels from the real layout (AZERTY), keys by position, choosing keys, swap, reset ----------
  if (RUN('P')) {
  page = await open({ viewport: { width: 1280, height: 860 }, locale: 'fr-FR' }, {}, FILE, () => {
    const az = { KeyQ: 'a', KeyW: 'z', KeyA: 'q', KeyZ: 'w', KeyS: 's', KeyD: 'd', KeyE: 'e', KeyR: 'r', KeyF: 'f', KeyH: 'h', KeyI: 'i', KeyX: 'x', KeyK: 'k' };
    Object.defineProperty(navigator, 'keyboard', { value: { getLayoutMap: async () => new Map(Object.entries(az)) } });
  });
  await page.waitForTimeout(400);
  const F = require('../src/i18n/fr.json');
  let r = await page.evaluate(() => ({ keys: [...document.querySelectorAll('.keys .key')].map((k) => k.textContent).join(''), note: document.getElementById('keyNote').textContent }));
  assert.strictEqual(r.keys, 'ZQSD', 'labels of an AZERTY keyboard');
  assert.ok(r.note.startsWith('ZQSD') && r.note.includes(F['key.shift']) && r.note.includes(F['key.space']), r.note);
  await page.click('#btnConnect'); await waitPhase(page, 'ready');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(400);   // the key labelled Z on AZERTY
  assert.ok(/^C:-\d+ D:\d+$/.test(await last(page)), 'Z (position W) drives forward');
  await page.keyboard.up('KeyW'); await page.waitForTimeout(500);
  // choose a new key for forward: I
  await page.click('.tab2[data-view="viewDrive"]').catch(() => {});
  await page.click('.kbtn[data-act="up"]');
  assert.strictEqual(await page.$eval('.kbtn[data-act="up"]', (b) => b.textContent), F['keys.press']);
  await page.keyboard.press('KeyI'); await page.waitForTimeout(100);
  assert.strictEqual(await page.$eval('.kbtn[data-act="up"]', (b) => b.textContent), 'I');
  assert.ok((await last(page)) === 'C:0 D:0', 'pressing the new key while choosing it does not drive');
  await page.keyboard.down('KeyI'); await page.waitForTimeout(400);
  assert.ok(/^C:-\d+ D:\d+$/.test(await last(page)), 'I drives forward now');
  await page.keyboard.up('KeyI'); await page.waitForTimeout(500);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(400);
  assert.strictEqual(await last(page), 'C:0 D:0', 'the old key does nothing'); await page.keyboard.up('KeyW');
  // a key that is in use: the two swap
  await page.click('.kbtn[data-act="left"]'); await page.keyboard.press('KeyI'); await page.waitForTimeout(100);
  r = await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('hubremote3')).keys; return [g.up, g.left]; });
  assert.deepStrictEqual(r, ['KeyA', 'KeyI'], 'forward got the old left key');
  assert.ok((await page.$eval('#toasts', (e) => e.textContent)).includes('Q'), 'swap message names the key as printed (Q)');
  // Escape cancels; Tab and arrows are refused
  await page.click('.kbtn[data-act="horn"]'); await page.keyboard.press('Tab'); await page.waitForTimeout(100);
  assert.strictEqual(await page.$eval('.kbtn[data-act="horn"]', (b) => b.textContent), F['keys.press'], 'Tab refused, still waiting');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  assert.strictEqual(await page.$eval('.kbtn[data-act="horn"]', (b) => b.textContent), 'H');
  // STOP on another key, kept after a reload
  await page.click('.kbtn[data-act="stop"]'); await page.keyboard.press('KeyX'); await page.waitForTimeout(100);
  assert.strictEqual(await page.$eval('#stopKey', (e) => e.textContent), 'X');
  await page.reload(); await page.waitForTimeout(500);
  await page.click('#btnConnect'); await waitPhase(page, 'ready');
  await page.keyboard.down('KeyA'); await page.waitForTimeout(400);
  assert.ok(/^C:-\d+ D:\d+$/.test(await last(page)), 'kept after reload: Q (position A) drives forward');
  await page.keyboard.press('KeyX'); await page.waitForTimeout(300);
  assert.strictEqual(await last(page), 'C:0 D:0', 'X is STOP'); assert.ok((await cmds(page)).includes('halt'));
  await page.keyboard.up('KeyA');
  await page.click('#btnKeysReset'); await page.waitForTimeout(100);
  assert.strictEqual(await page.evaluate(() => [...document.querySelectorAll('.keys .key')].map((k) => k.textContent).join('')), 'ZQSD');
  assert.strictEqual(await page.$eval('#stopKey', (e) => e.textContent), F['stop.space']);
  await page.context().close();
  console.log('P ok: AZERTY labels, keys by position, choosing a key, swap, refused keys, STOP on another key, kept after reload, reset');
  }
  // ---------- Q. feedback: sent as a Netlify form, details without the hub's name, wait a minute, fallback ----------
  if (RUN('Q')) {
  page = await open({ viewport: { width: 1280, height: 860 }, locale: 'en-GB' }, {}, HTTP);
  const E = require('../src/i18n/en.json');
  let posts = [], answer = 200;
  await page.route('**/*', (rt) => {
    const rq = rt.request();
    if (rq.method() === 'POST') { posts.push({ url: rq.url(), type: rq.headers()['content-type'], body: rq.postData() }); return rt.fulfill({ status: answer, body: 'ok' }); }
    return rt.continue();
  });
  await page.click('#btnConnect'); await waitPhase(page, 'ready');
  const hubName = await page.evaluate(() => document.getElementById('infoName').textContent);
  await page.click('#btnFeedback'); await page.waitForTimeout(200);
  assert.ok(await page.$eval('#fbSheet', (e) => e.classList.contains('on')));
  assert.deepStrictEqual(await page.$$eval('#fbKind option', (o) => o.map((x) => x.value)), ['bug', 'idea', 'lang', 'other']);
  let det = await page.$eval('#fbDiagText', (e) => e.textContent);
  assert.ok(/^BrickHubRemote \d+\.\d+\.\d+/.test(det) && /Hub: ready/.test(det) && /Log:/.test(det), det.slice(0, 200));
  assert.ok(hubName.length > 1 && !det.includes(hubName) && det.includes('[hub]'), 'hub name replaced in the log lines');
  await page.click('#btnFbSend'); await page.waitForTimeout(100);
  assert.strictEqual(await page.$eval('#fbStatus', (e) => e.textContent), E['fb.empty']); assert.strictEqual(posts.length, 0);
  await page.fill('#fbMsg', 'The horn is quiet'); await page.selectOption('#fbKind', 'idea'); await page.fill('#fbContact', 'a@b.c');
  await page.click('#btnFbSend'); await page.waitForTimeout(400);
  assert.strictEqual(posts.length, 1);
  const f = new URLSearchParams(posts[0].body);
  assert.ok(posts[0].url.endsWith('/') && /x-www-form-urlencoded/.test(posts[0].type), posts[0].url);
  assert.deepStrictEqual([f.get('form-name'), f.get('kind'), f.get('message'), f.get('contact'), f.get('lang'), f.get('bot-field')], ['feedback', 'idea', 'The horn is quiet', 'a@b.c', 'en', '']);
  assert.ok(/^\d+\.\d+\.\d+$/.test(f.get('version')) && f.get('details').includes('Browser:') && !f.get('details').includes(hubName));
  assert.ok(!(await page.$eval('#fbSheet', (e) => e.classList.contains('on'))) && (await page.$eval('#toasts', (e) => e.textContent)).includes(E['fb.thanks']));
  // again within a minute: refused
  await page.click('#btnLogReport').catch(() => page.evaluate(() => document.getElementById('btnLogReport').click()));
  await page.waitForTimeout(150);
  await page.fill('#fbMsg', 'Second one'); await page.click('#btnFbSend'); await page.waitForTimeout(200);
  assert.strictEqual(posts.length, 1); assert.strictEqual(await page.$eval('#fbStatus', (e) => e.textContent), E['fb.wait']);
  // without details; no connection: a message, and a GitHub link without the email
  await page.context().close();
  page = await open({ viewport: { width: 1280, height: 860 }, locale: 'en-GB' }, {}, HTTP);
  await page.route('**/*', (rt) => (rt.request().method() === 'POST' ? rt.abort('internetdisconnected') : rt.continue()));
  await page.click('#btnFeedback'); await page.waitForTimeout(150);
  await page.fill('#fbMsg', 'Tilt goes the wrong way\nin landscape'); await page.fill('#fbContact', 'secret@mail.x'); await page.click('label:has(#fbDiag)');
  assert.strictEqual(await page.$eval('#fbDiagText', (e) => e.textContent), '');
  await page.click('#btnFbSend'); await page.waitForTimeout(400);
  assert.strictEqual(await page.$eval('#fbStatus', (e) => e.textContent), E['fb.fail']);
  const gh = new URL(await page.$eval('#fbGithub', (a) => a.href));
  assert.strictEqual(gh.origin + gh.pathname, 'https://github.com/Zylex2902/RemoteHub/issues/new');
  assert.strictEqual(gh.searchParams.get('title'), '[bug] Tilt goes the wrong way');
  assert.ok(gh.searchParams.get('body').startsWith('Tilt goes') && !gh.href.includes('secret') && !gh.searchParams.get('body').includes('Browser:'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  assert.ok(!(await page.$eval('#fbSheet', (e) => e.classList.contains('on'))), 'Escape closes');
  await page.context().close();
  // the form Netlify needs to find at deploy time
  const html = require('fs').readFileSync(path.join(APP, 'index.html'), 'utf8');
  assert.ok(/<form name="feedback" data-netlify="true" netlify-honeypot="bot-field" hidden>/.test(html));
  for (const n of ['bot-field', 'kind', 'message', 'contact', 'details', 'lang', 'version']) assert.ok(html.includes('name="' + n + '"'), n);
  console.log('Q ok: feedback form, details shown and without the hub name, sent as a Netlify form, one per minute, failure falls back to copy and a GitHub link without the email');
  }
  await browser.close(); server.close();
  assert.deepStrictEqual(errors, [], 'page errors: ' + errors.join('\n'));
  console.log('OK all');
})().catch((e) => { console.error('FAIL', e.message || e, (e.stack || '').split('\n').filter((l) => /test_page/.test(l)).slice(0, 2).join(' ')); process.exit(1); });
