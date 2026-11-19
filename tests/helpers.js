// Shared bits for the browser tests.
const path = require('path'), http = require('http'), fs = require('fs');

const SITE = path.resolve(__dirname, '..', 'site');
const APP = path.join(SITE, 'app');   // the app itself; the landing page is site/index.html
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.css': 'text/css', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };

// Serves site/ on a free localhost port (service workers and share links need http, not file://).
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(SITE, path.normalize(p));
      if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, 'localhost', () => resolve({ url: 'http://localhost:' + srv.address().port + '/', close: () => srv.close() }));
  });
}

// CHROME_PATH picks a specific Chrome; NO_SANDBOX=1 is needed when running as root (containers, CI).
const launchOptions = (extraArgs) => ({
  executablePath: process.env.CHROME_PATH || undefined,
  args: (process.env.NO_SANDBOX || process.env.CI ? ['--no-sandbox'] : []).concat(extraArgs || []),
});

// A simulated hub behind a fake navigator.bluetooth (runs in the page via addInitScript).
// Also used by tools/screenshots.js for the pictures on the landing page.
const fakeHub = (opts) => {
  const H = (window.__hub = { tunnel: [], file: [], announced: null, started: false, events: [], writes: 0, maxWrite: 0, battery: 87, connects: 0, dist: 350, color: 9, force: 40,
    imu: { face: 0, yaw: 0, pitch: 0, roll: 0 }, m: {} });
  // the big hub has its motors on C and D; the small hub (2 ports) on A and B
  const MP = opts.small ? [['A', 0], ['B', 1]] : [['C', 2], ['D', 3]];
  MP.forEach(([k]) => { H.m[k] = { pos: 0, spd: 0, last: 0, goal: null, rate: 0 }; });
  const hwLine = opts.small ? 'hw 0 0 2' : 'hw 1 1 6';
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
        d.setUint16(9, opts.maxPacket, true); d.setUint16(11, 2048, true); d.setUint16(13, 102, true); d.setUint16(15, opts.small ? 1 : 0, true); notify(r);
        if (opts.dropAfterInfo > 0) { opts.dropAfterInfo--; setTimeout(() => H.drop(), 20); }   // seen in Bluefy on iPhone
        break; }
      case 0x1e: if (m[1] === 1) { H.events.push('stop'); status(0x1f, H.started); if (H.started) notify(Uint8Array.of(0x20, 1)); H.started = false; }
        else { H.events.push('start:' + m[2]);
          const all = Uint8Array.from(H.file); H.fileOk = !!H.announced && Proto.crc(all) === H.announced.crc; H.program = new TextDecoder().decode(all);
          status(0x1f, H.fileOk); H.started = H.fileOk; notify(Uint8Array.of(0x20, 0));
          if (H.fileOk) setTimeout(() => { tun('rdy 6'); tun(hwLine); }, 30); }
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
          for (const [k] of MP) {
            const mo = H.m[k];
            if (mo.goal !== null) { const step = mo.rate * dt; if (Math.abs(mo.goal - mo.pos) <= step) { mo.pos = mo.goal; mo.goal = null; } else mo.pos += Math.sign(mo.goal - mo.pos) * step; }
            else mo.pos += mo.spd * 10 * dt;
          }
          const mot = (k, i) => [10, i, 48, ...le16(((Math.round(H.m[k].pos) % 360) + 360) % 360), 0, 0, 0, ...le32(Math.round(H.m[k].pos))];
          const imu = [1, H.imu.face, 0, ...le16(H.imu.yaw), ...le16(H.imu.pitch), ...le16(H.imu.roll), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
          const pay = [0, H.battery, ...MP.flatMap(([k, i]) => mot(k, i)), ...imu];
          if (opts.sensors) pay.push(13, 0, d & 255, d >> 8, 12, 1, H.color, 0, 2, 16, 0, 32, 0, 11, 5, H.force, 1);
          notify(Uint8Array.from([0x3c, pay.length, 0, ...pay])); }, Math.max(50, iv)); break; }
      case 0x32: { const text = new TextDecoder().decode(Proto.parseTunnel(m));
        H.tunnel.push({ t: performance.now(), text });
        const parts = text.split(' ');
        if (parts[0] === 'deg') parts.slice(1).forEach((tok) => { const [p, d, sp] = tok.split(':'); const mo = H.m[p]; if (mo) { mo.last = 0; mo.spd = 0; mo.goal = mo.pos + +d; mo.rate = +sp * 10; } });
        else if (parts[0] === 'halt') Object.values(H.m).forEach((mo) => { mo.spd = 0; mo.last = 0; mo.goal = null; });
        else if (/^[A-F]:-?\d+$/.test(parts[0])) parts.forEach((tok) => { const [p, v] = tok.split(':'); const mo = H.m[p]; if (mo && mo.last !== +v) { mo.last = +v; mo.spd = +v; mo.goal = null; } });
        if (H.started && text === '?') { tun('rdy 6'); tun(hwLine); } break; }
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

module.exports = { SITE, APP, OUT, serve, launchOptions, fakeHub };
