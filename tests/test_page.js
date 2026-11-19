// End-to-end test: runs the built page in headless Chrome against a simulated hub.
// ONLY=AB node tests/test_page.js runs just those sections (A-H).
const { chromium } = require('playwright');
const jsQR = require('jsqr');
const assert = require('assert');
const path = require('path');
const { SITE, OUT, serve, launchOptions } = require('./helpers');
const FILE = 'file://' + path.join(SITE, 'index.html');
let HTTP = '';

const fakeHub = (opts) => {
  const H = (window.__hub = { tunnel: [], file: [], announced: null, started: false, events: [], writes: 0, maxWrite: 0, battery: 87, connects: 0, dist: 350, color: 9, force: 40,
    imu: { face: 0, yaw: 0, pitch: 0, roll: 0 }, m: { C: { pos: 0, spd: 0, last: 0, goal: null, rate: 0 }, D: { pos: 0, spd: 0, last: 0, goal: null, rate: 0 } } });
  const le16 = (x) => [x & 255, (x >> 8) & 255], le32 = (x) => [x & 255, (x >> 8) & 255, (x >> 16) & 255, (x >>> 24) & 255];
  const listeners = { tx: new Set(), dev: new Set() };
  let df = null, timer = null, running = 0;
  const notify = (payload) => {
    const frame = Proto.pack(payload);
    for (let i = 0; i < frame.length; i += 20) {
      const part = frame.slice(i, i + 20);
      setTimeout(() => listeners.tx.forEach((f) => f({ target: { value: new DataView(part.buffer) } })), 1 + i / 20);
    }
  };
  const status = (id, ok) => notify(Uint8Array.of(id, ok ? 0 : 1));
  const tun = (t) => notify(Proto.tunnel(new TextEncoder().encode(t)));
  const onMsg = (m) => {
    const v = new DataView(m.buffer, m.byteOffset, m.byteLength);
    switch (m[0]) {
      case 0x00: { const r = new Uint8Array(17); const d = new DataView(r.buffer); r[0] = 1; r[1] = 1; r[2] = 4; d.setUint16(3, 9, true); r[5] = 3; r[6] = 4; d.setUint16(7, 2, true);
        d.setUint16(9, opts.maxPacket, true); d.setUint16(11, 2048, true); d.setUint16(13, 102, true); notify(r);
        if (opts.dropAfterInfo > 0) { opts.dropAfterInfo--; setTimeout(() => H.drop(), 20); }   // seen in Bluefy on iPhone
        break; }
      case 0x1e: if (m[1] === 1) { H.events.push('stop'); status(0x1f, H.started); if (H.started) notify(Uint8Array.of(0x20, 1)); H.started = false; }
        else { H.events.push('start:' + m[2]);
          const all = Uint8Array.from(H.file); H.fileOk = !!H.announced && Proto.crc(all) === H.announced.crc; H.program = new TextDecoder().decode(all);
          status(0x1f, H.fileOk); H.started = H.fileOk; notify(Uint8Array.of(0x20, 0));
          if (H.fileOk) setTimeout(() => tun('rdy 5'), 30); }
        break;
      case 0x46: H.events.push('clear:' + m[1]); status(0x47, false); break;
      case 0x0c: { let e = m.indexOf(0, 1); H.announced = { name: new TextDecoder().decode(m.subarray(1, e)), slot: m[e + 1], crc: v.getUint32(e + 2, true) };
        H.events.push('upload:' + H.announced.name + ':' + H.announced.slot); H.file = []; running = 0; status(0x0d, true); break; }
      case 0x10: { if (m.length < 7) { status(0x11, false); break; }
        const crc = v.getUint32(1, true), size = v.getUint16(5, true), chunk = m.subarray(7, 7 + size);
        const next = Proto.crc(chunk, running); const ok = next === crc && size === m.length - 7 && size <= 102;
        if (ok) { running = next; H.file.push(...chunk); } H.events.push('chunk:' + size + ':' + ok); status(0x11, ok); break; }
      case 0x28: { status(0x29, true); const iv = v.getUint16(1, true); H.events.push('devnot:' + iv);
        clearInterval(timer); timer = setInterval(() => {
          const d = H.dist < 0 ? 0xffff : H.dist;
          // simulated motors C and D: speed, or a move over degrees at its own rate; positions are reported
          const dt = Math.max(50, iv) / 1000;
          for (const k of ['C', 'D']) {
            const mo = H.m[k];
            if (mo.goal !== null) { const step = mo.rate * dt; if (Math.abs(mo.goal - mo.pos) <= step) { mo.pos = mo.goal; mo.goal = null; } else mo.pos += Math.sign(mo.goal - mo.pos) * step; }
            else mo.pos += mo.spd * 10 * dt;
          }
          const mot = (k, i) => [10, i, 48, ...le16(((Math.round(H.m[k].pos) % 360) + 360) % 360), 0, 0, 0, ...le32(Math.round(H.m[k].pos))];
          const imu = [1, H.imu.face, 0, ...le16(H.imu.yaw), ...le16(H.imu.pitch), ...le16(H.imu.roll), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
          const pay = [0, H.battery, ...mot('C', 2), ...mot('D', 3), ...imu];
          if (opts.sensors) pay.push(13, 0, d & 255, d >> 8, 12, 1, H.color, 0, 2, 16, 0, 32, 0, 11, 5, H.force, 1);
          notify(Uint8Array.from([0x3c, pay.length, 0, ...pay])); }, Math.max(50, iv)); break; }
      case 0x32: { const text = new TextDecoder().decode(Proto.parseTunnel(m));
        H.tunnel.push({ t: performance.now(), text });
        const parts = text.split(' ');
        if (parts[0] === 'deg') parts.slice(1).forEach((tok) => { const [p, d, sp] = tok.split(':'); const mo = H.m[p]; if (mo) { mo.last = 0; mo.spd = 0; mo.goal = mo.pos + +d; mo.rate = +sp * 10; } });
        else if (parts[0] === 'halt') Object.values(H.m).forEach((mo) => { mo.spd = 0; mo.last = 0; mo.goal = null; });
        else if (/^[A-F]:-?\d+$/.test(parts[0])) parts.forEach((tok) => { const [p, v] = tok.split(':'); const mo = H.m[p]; if (mo && mo.last !== +v) { mo.last = +v; mo.spd = +v; mo.goal = null; } });
        if (H.started && text === '?') tun('rdy 5'); break; }
    }
  };
  const ch = (name) => ({
    properties: { writeWithoutResponse: true, notify: true }, addEventListener: (n, f) => listeners[name].add(f), removeEventListener: (n, f) => listeners[name].delete(f),
    startNotifications: async () => {},
    writeValueWithoutResponse: async (buf) => {
      let b = new Uint8Array(buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf);
      H.writes++; H.maxWrite = Math.max(H.maxWrite, b.length);
      if (opts.truncate && b.length > opts.truncate) b = b.slice(0, opts.truncate);
      df = df || new Proto.Deframer(); for (const m of df.push(b)) onMsg(m);
    },
  });
  const rx = ch('rx'), tx = ch('tx');
  const device = { name: 'Testhub', addEventListener: (n, f) => listeners.dev.add(f), removeEventListener: (n, f) => listeners.dev.delete(f),
    gatt: { connected: false,
      connect: async () => { if (H.offline) throw new Error('unreachable'); device.gatt.connected = true; H.connects++; df = null;
        return { getPrimaryService: async () => ({ getCharacteristic: async (c) => (c.endsWith('0001-1000-8000-00805f9b34fb') ? rx : tx) }) }; },
      disconnect: () => { if (device.gatt.connected) H.events.push('gatt-disconnect'); device.gatt.connected = false; clearInterval(timer); } } };
  H.drop = () => { device.gatt.connected = false; clearInterval(timer); listeners.dev.forEach((f) => f({})); };
  H.say = (text) => tun(text);
  H.hubStop = () => { H.started = false; notify(Uint8Array.of(0x20, 1)); };
  Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: async () => { H.choosers = (H.choosers || 0) + 1; return device; } }, configurable: true });
};

(async () => {
  const server = await serve(); HTTP = server.url;
  const browser = await chromium.launch(launchOptions());
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
  await page.selectOption('#selProg', 'old1');
  await page.waitForTimeout(700);   // let pending saves finish first
  await page.evaluate(() => { localStorage.setItem('hubremote3', JSON.stringify({ profiles: [] })); }); await page.reload(); await page.waitForTimeout(300);   // fresh start: the example program
  await page.click('#btnConnect'); await waitPhase(page, 'ready');
  await page.click('.tab[data-view="viewCode"]'); await page.waitForTimeout(800);
  // the example program in blocks: smile, forward 10 cm, a happy sound, back 10 cm, write Hi!
  assert.deepStrictEqual(await blockTypes(), [['start', 'img', 'moveFor', 'mood', 'moveFor', 'write']]);
  assert.strictEqual(await page.$$eval('.blocklyToolboxCategory', (e) => e.length), 9);
  await page.evaluate(() => { const ws = Blockly.getMainWorkspace(), o = ws.highlightBlock.bind(ws); window.__lit = []; ws.highlightBlock = (id, on) => { window.__lit.push([id, on]); return o(id, on); }; });
  let n0 = await count();
  await page.click('#btnRun');
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
  await page.click('#btnRun'); await toastHas(/Programma klaar/, 15000);
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
  await page.click('#btnRun'); await toastHas(/Wanneer-blok/);
  // STOP and leaving the screen stop a program that drives
  await wsLoad({ blocks: { languageVersion: 0, blocks: [{ type: 'start', x: 20, y: 20, next: { block: { type: 'moveStart', fields: { dir: 'fw' }, next: { block: { type: 'wait', inputs: { n: sh(10) } } } } } }] } });
  await page.click('#btnRun'); await page.waitForTimeout(700);
  assert.notStrictEqual(await last(page), 'C:0 D:0', 'program drives');
  assert.strictEqual(await page.$eval('#codeStatus', (e) => e.textContent), 'Programma loopt');
  n0 = await count();
  await page.dispatchEvent('#btnProgStop', 'pointerdown'); await page.waitForTimeout(400);
  assert.ok((await since(n0)).includes('halt')); assert.strictEqual(await last(page), 'C:0 D:0');
  assert.strictEqual(await page.evaluate(() => document.body.classList.contains('running')), false);
  await page.click('#btnRun'); await page.waitForTimeout(500);
  await page.click('.tab[data-view="viewPlay"]'); await page.waitForTimeout(400);
  assert.strictEqual(await last(page), 'C:0 D:0', 'view switch stops the program');
  // events: wait until something is close; when the hub button is pressed (a second stack)
  await page.click('.tab[data-view="viewCode"]'); await page.waitForTimeout(600);
  await wsLoad({ blocks: { languageVersion: 0, blocks: [
    { type: 'start', x: 20, y: 20, next: { block: { type: 'waitUntil', inputs: { c: { block: { type: 'b_dist', fields: { op: '<' }, inputs: { n: sh(10) } } } }, next: { block: { type: 'beepFor', fields: { note: 'C5' }, inputs: { n: sh(0.5) } } } } } },
    { type: 'when', x: 20, y: 300, inputs: { c: { block: { type: 'b_and', inputs: { A: { block: { type: 'b_btn', fields: { b: 'L' } } }, B: { block: { type: 'b_not', inputs: { A: { block: { type: 'b_btn', fields: { b: 'R' } } } } } } } } } }, next: { block: { type: 'mood', fields: { mood: 'happy' } } } }] } });
  n0 = await count();
  await page.click('#btnRun'); await page.waitForTimeout(500);
  assert.strictEqual(await page.$eval('#codeStatus', (e) => e.textContent), 'Wacht op gebeurtenissen');
  assert.ok(!(await since(n0)).some((x) => x.startsWith('tune')), 'nothing yet');
  await page.evaluate(() => { window.__hub.dist = 60; }); await page.waitForTimeout(600);
  assert.ok((await since(n0)).includes('tune 523:500'), 'beep once something is close');
  n0 = await count();
  await page.evaluate(() => window.__hub.say('btn L 1')); await page.waitForTimeout(500);
  assert.ok((await since(n0)).some((x) => x.startsWith('tune ') && x !== 'tune 523:500'), 'mood on the hub button');
  await page.evaluate(() => { window.__hub.dist = 350; });
  await page.dispatchEvent('#btnProgStop', 'pointerdown'); await page.waitForTimeout(300);
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
  await page.click('#btnRun'); await page.waitForTimeout(500);
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
    const b = await rect(page, '#btnProgStop'), e = await rect(page, '#blocklyDiv');
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
  await browser.close(); server.close();
  assert.deepStrictEqual(errors, [], 'page errors: ' + errors.join('\n'));
  console.log('OK all');
})().catch((e) => { console.error('FAIL', e.message || e, (e.stack || '').split('\n').filter((l) => /test_page/.test(l)).slice(0, 2).join(' ')); process.exit(1); });
