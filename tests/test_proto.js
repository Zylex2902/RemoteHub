// Checks the page's protocol code (framing, CRC, messages) against vectors made with the reference implementation.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
const src = html.match(/<script id="proto">([\s\S]*?)<\/script>/)[1];
const ctx = { module: { exports: {} }, TextEncoder, TextDecoder, Uint8Array, Uint32Array, DataView, Math, Error };
vm.runInNewContext(src, ctx);
const P = ctx.module.exports;
const V = JSON.parse(fs.readFileSync(path.join(__dirname, 'vectors.json'), 'utf8'));
const hex = (u) => Buffer.from(u).toString('hex');
const un = (h) => Uint8Array.from(Buffer.from(h, 'hex'));
let n = 0;
for (const [d, packed] of V.pack) {
  assert.strictEqual(hex(P.pack(un(d))), packed, 'pack ' + d.length / 2);
  assert.strictEqual(hex(P.unpack(un(packed))), d, 'unpack ' + d.length / 2);
  // deframer: feed in random-size fragments, with a high-priority frame injected mid-stream
  const df = new P.Deframer(); const f = un(packed); const got = [];
  const hi = P.pack(Uint8Array.of(0x20, 1));
  const mid = Math.floor(f.length / 2);
  const stream = Uint8Array.from([...f.slice(0, mid), 0x01, ...hi, ...f.slice(mid), ...f]);
  for (let i = 0; i < stream.length;) { const k = 1 + ((i * 7) % 23); got.push(...df.push(stream.slice(i, i + k))); i += k; }
  if (d.length) {
    assert.strictEqual(got.length, 3, 'deframe count');
    assert.strictEqual(hex(got[0]), '2001'); assert.strictEqual(hex(got[1]), d); assert.strictEqual(hex(got[2]), d);
  }
  n++;
}
for (const [d, c0, c1] of V.crc) { assert.strictEqual(P.crc(un(d)), c0); assert.strictEqual(P.crc(un(d), 0x12345678), c1); n++; }
for (const c of V.chunks) {
  const prog = un(c.prog); assert.strictEqual(P.crc(prog), c.filecrc);
  let run = 0, i = 0;
  for (let off = 0; off < prog.length; off += c.size, i++) {
    const part = prog.subarray(off, off + c.size); run = P.crc(part, run);
    assert.strictEqual(run, c.steps[i][1]); assert.strictEqual(hex(P.transferChunk(run, part)), c.steps[i][0]); n++;
  }
  assert.strictEqual(i, c.steps.length);
}
const m = V.msgs;
assert.strictEqual(hex(P.infoRequest()), m.info);
assert.strictEqual(hex(P.clearSlot(19)), m.clear19);
assert.strictEqual(hex(P.programFlow(false, 19)), m.start);
assert.strictEqual(hex(P.programFlow(true, 3)), m.stop);
assert.strictEqual(hex(P.startFileUpload('program.py', 19, 0xDEADBEEF)), m.upload);
assert.strictEqual(hex(P.deviceNotificationRequest(1000)), m.devnot);
const info = P.parseInfo(un(m.inforesp));
assert.deepStrictEqual({ ...info }, { rpc: '1.4.300', firmware: '3.4.7', maxPacketSize: 509, maxMessageSize: 2048, maxChunkSize: 500, product: 0 });
const dn = P.parseDeviceNotification(un(m.devnotif));
assert.strictEqual(dn.battery, 87); assert.deepStrictEqual([...dn.motors], ['C', 'D']);
assert.strictEqual(P.parseConsole(un(m.console)), 'Traceback: boom\n');
const t = P.tunnel(new TextEncoder().encode('A:-50 B:50'));
assert.strictEqual(t[0], 0x32); assert.strictEqual(t[1] | (t[2] << 8), 10);
assert.strictEqual(new TextDecoder().decode(P.parseTunnel(t)), 'A:-50 B:50');
// sensors in a device notification: battery, motor C, distance A 350 mm, distance E none, colour B red, force F 40% pressed
const pay = [0, 87, 10, 2, 48, 0, 0, 0, 0, 0, 0, 0, 0, 0, 13, 0, 0x5e, 0x01, 13, 4, 0xff, 0xff, 12, 1, 9, 0x00, 0x02, 0x10, 0x00, 0x20, 0x00, 11, 5, 40, 1];
const r = P.parseDeviceNotification(Uint8Array.from([0x3c, pay.length, 0, ...pay]));
assert.strictEqual(r.battery, 87); assert.deepStrictEqual([...r.motors], ['C']);
assert.deepStrictEqual(JSON.parse(JSON.stringify(r.sensors)), [{ type: 'distance', port: 'A', mm: 350 }, { type: 'distance', port: 'E', mm: -1 },
  { type: 'color', port: 'B', color: 9, r: 512, g: 16, b: 32 }, { type: 'force', port: 'F', value: 40, pressed: true }]);
// motion sensor and motor values: IMU face up 0, yaw -90, pitch 12, roll -5; motor A abs 45, power -300, speed -30, position -1234
const le16 = (x) => [x & 255, (x >> 8) & 255], le32 = (x) => [x & 255, (x >> 8) & 255, (x >> 16) & 255, (x >>> 24) & 255];
const pay2 = [1, 0, 0, ...le16(-90), ...le16(12), ...le16(-5), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 48, ...le16(45), ...le16(-300), 256 - 30, ...le32(-1234)];
const r2 = P.parseDeviceNotification(Uint8Array.from([0x3c, pay2.length, 0, ...pay2]));
assert.deepStrictEqual(JSON.parse(JSON.stringify(r2.imu)), { face: 0, yawFace: 0, yaw: -90, pitch: 12, roll: -5 });
assert.deepStrictEqual(JSON.parse(JSON.stringify(r2.motorData)), [{ port: 'A', type: 48, abs: 45, power: -300, speed: -30, pos: -1234 }]);
console.log('OK', n, 'checks against the reference vectors, plus sensor, motion and motor parsing');
