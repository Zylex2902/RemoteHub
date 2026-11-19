// Runs the programming-card runner from the built page against a fake io with a simulated clock.
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
const src = html.match(/<script id="cards">([\s\S]*?)<\/script>/)[1];
const ctx = { module: { exports: {} }, Math, Promise, Map, Object, Array, String, Number, JSON, isFinite, setTimeout };
vm.runInNewContext(src, ctx);
const C = ctx.module.exports;
const I18N = require(path.join(__dirname, '..', 'src', 'i18n.js'));

// every card type, option and condition has a text in both languages
for (const lang of ['nl', 'en']) {
  const L = I18N[lang];
  for (const t of Object.keys(C.TYPES)) {
    const tpl = L['card.' + t];
    assert.ok(tpl, lang + ' card.' + t);
    for (const spec of C.TYPES[t].params) assert.ok(tpl.includes('{' + spec.k + '}'), lang + ' card.' + t + ' has {' + spec.k + '}');
    for (const spec of C.TYPES[t].params) if (spec.type === 'choice') for (const o of spec.opts) assert.ok(L['opt.' + o], lang + ' opt.' + o);
  }
  for (const k of Object.keys(C.COND)) {
    assert.ok(L['cond.' + k], lang + ' cond.' + k);
    for (const spec of C.COND[k]) { assert.ok(L['cond.' + k].includes('{' + spec.k + '}'), lang + ' cond.' + k + ' {' + spec.k + '}'); if (spec.type === 'choice') for (const o of spec.opts) assert.ok(L['opt.' + o], lang + ' opt.' + o); }
  }
  for (const s of C.SENSORS) assert.ok(L['src.' + s], lang + ' src.' + s);
  for (const c of C.CATS) assert.ok(L['cat.' + c], lang + ' cat.' + c);
  for (const im of Object.keys(C.IMAGES)) assert.ok(L['imgname.' + im], lang + ' imgname.' + im);
}
for (const im of Object.values(C.IMAGES)) assert.ok(/^[0-9]{25}$/.test(im));
for (const g of Object.values(C.FONT)) assert.ok(g.length === 5 && g.every((r) => r >= 0 && r <= 7));

// cleaning: junk in, a valid program out
let pr = C.cleanProgram({ name: 'x', vars: ['a', '', 5], stacks: [[{ t: 'moveFor', p: { dir: 'zz', n: 'q', unit: 'cm' } }, { t: 'start' }, { t: 'nope' }], 'bad'] });
assert.strictEqual(pr.stacks.length, 2); assert.strictEqual(pr.stacks[0][0].t, 'start'); assert.strictEqual(pr.stacks[0].length, 2);
assert.deepStrictEqual(JSON.parse(JSON.stringify(pr.stacks[0][1].p)), { dir: 'fw', n: { k: 'n', v: 10 }, unit: 'cm' });
assert.deepStrictEqual(pr.vars, ['a']);
pr = C.cleanProgram(null, 'Leeg'); assert.strictEqual(pr.stacks[0][0].t, 'start'); assert.strictEqual(pr.name, 'Leeg');
const cc = C.cleanCond({ k: 'cmp', a: 3, op: '!', b: { k: 'v', v: 'x' }, not: true });
assert.deepStrictEqual(JSON.parse(JSON.stringify(cc)), { k: 'cmp', not: true, a: { k: 'n', v: 3 }, op: '<', b: { k: 'v', v: 'x' } });
// indentation and block structure
const blk = ['start', 'repeat', 'if', 'wait', 'else', 'wait', 'end', 'end', 'wait'].map((t) => C.newCard(t));
assert.deepStrictEqual([...C.depths(blk)], [0, 1, 2, 3, 2, 3, 2, 1, 1]);
const tree = C.compile(blk);
assert.strictEqual(tree.length, 2); assert.strictEqual(tree[0].body[0].body.length, 1); assert.strictEqual(tree[0].body[0].elseBody.length, 1);
assert.strictEqual(C.compile(['start', 'end', 'if', 'wait'].map((t) => C.newCard(t)))[0].body.length, 1, 'stray end ignored, open block closed');
// steering like a robot cart
assert.deepStrictEqual([...C.steer(0, 50)], [50, 50]); assert.deepStrictEqual([...C.steer(50, 50)], [50, 0]);
assert.deepStrictEqual([...C.steer(100, 50)], [50, -50]); assert.deepStrictEqual([...C.steer(-25, 40)], [20, 40]);

// ---- runner with a fake hub and a simulated clock ----
const flush = () => new Promise((r) => setImmediate(r));
function harness(stacks, vars, data) {
  let now = 0, rnd = 0.5;
  const timers = [], log = [];
  const D = Object.assign({ dist: 500, force: { v: 0, pressed: false }, light: 40, color: 9, colors: { B: 9 }, imu: { yaw: 0, pitch: 0, roll: 0, face: 0 }, motors: { A: { pos: 100 } }, btn: { L: 0, R: 0 } }, data || {});
  const drive = { l: 0, r: 0 };
  const io = {
    now: () => now, random: () => rnd, data: () => D, ports: () => ({ l: 'C', r: 'D' }),
    sleep: (ms) => new Promise((r) => timers.push({ at: now + ms, r })),
    drive: (l, r) => { drive.l = l; drive.r = r; log.push(['drive', Math.round(l), Math.round(r)]); },
    setPorts: (l, r) => log.push(['ports', l, r]),
    motor: (p, pct) => log.push(['motor', p, pct]),
    moveDeg: (dl, sl, dr, sr) => { log.push(['moveDeg', dl, sl, dr, sr]); return io.sleep(Math.abs(dl || dr) / (Math.max(sl, sr) * 10) * 1000); },
    motorDeg: (p, deg, s) => { log.push(['motorDeg', p, deg, s]); return io.sleep(Math.abs(deg) / (s * 10) * 1000); },
    motorGoto: (p, pos, s, way) => { log.push(['goto', p, pos, s, way]); return io.sleep(300); },
    send: (t) => log.push(['send', t]), tune: (n) => log.push(['tune', n.map((x) => x.slice())]), img: (s) => log.push(['img', s]),
    song: () => [[440, 200], [0, 50], [494, 200]], freq: (n) => ({ C5: 523, A4: 440 }[n] || 262), mood: () => (log.push(['mood']), 300), talk: () => (log.push(['talk']), 400),
    active: (si, i) => log.push(['active', si, i]), warn: (k) => log.push(['warn', k]), stopAll: () => log.push(['stopAll']), done: () => log.push(['done']),
  };
  const prog = C.cleanProgram({ vars: vars || [], stacks: stacks.map((s) => s.map((x) => (typeof x === 'string' ? C.newCard(x) : Object.assign(C.newCard(x.t), { p: Object.assign(C.newCard(x.t).p, x.p) })))) });
  const run = new C.Runner(prog, io);
  const advance = async (ms) => {
    const end = now + ms;
    while (now < end) {
      now += 10;
      if (now % 50 === 0) {
        // the simulated hub turns while the wheels turn opposite ways (yaw goes down turning right)
        if (drive.l > 0 && drive.r < 0) D.imu = Object.assign({}, D.imu, { yaw: ((D.imu.yaw - 6 + 540) % 360) - 180 });
        run.tick();
      }
      for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= now) { const t = timers.splice(i, 1)[0]; t.r(); }
      await flush();
    }
  };
  return { run, log, D, advance, setRnd: (v) => { rnd = v; }, now: () => now, kinds: (k) => log.filter((x) => x[0] === k) };
}
const n = (v) => ({ k: 'n', v }), V = (v) => ({ k: 'v', v });
(async () => {
  // movement: centimetres, rotations, seconds, steering, tank
  let h = harness([['start', { t: 'moveFor', p: { n: n(10), unit: 'cm' } }, { t: 'steerFor', p: { s: n(100), n: n(1), unit: 'rot' } },
    { t: 'moveSpeed', p: { n: n(40) } }, { t: 'moveFor', p: { dir: 'bw', n: n(1), unit: 'sec' } }, { t: 'tankFor', p: { l: n(-30), r: n(60), n: n(90), unit: 'deg' } },
    { t: 'wheel', p: { n: n(20) } }, { t: 'moveFor', p: { n: n(20), unit: 'cm' } }]]);
  h.run.start(); await h.advance(5000);
  assert.deepStrictEqual(h.kinds('moveDeg'), [['moveDeg', 206, 50, 206, 50], ['moveDeg', 360, 50, -360, 50], ['moveDeg', -45, 30, 90, 60], ['moveDeg', 360, 40, 360, 40]]);
  const dr = h.kinds('drive').map((x) => x.slice(1).join(','));
  assert.ok(dr.includes('-40,-40') && dr[dr.indexOf('-40,-40') + 1] === '0,0', dr.join(' '));
  assert.ok(h.log.some((x) => x[0] === 'done'), 'program ends by itself');
  // motors: degrees, rotations, start, speed while running, stop mode, position
  h = harness([['start', { t: 'motorSpeed', p: { p: 'A', n: n(40) } }, { t: 'motorFor', p: { p: 'A', dir: 'ccw', n: n(2), unit: 'rot' } }, { t: 'motorStart', p: { p: 'B', dir: 'cw' } },
    { t: 'motorSpeed', p: { p: 'B', n: n(20) } }, { t: 'motorStop', p: { p: 'B' } }, { t: 'motorGoto', p: { p: 'E', n: n(90), way: 'cw' } }, { t: 'motorStopMode', p: { p: 'A', mode: 'hold' } },
    { t: 'motorReset', p: { p: 'A' } }, { t: 'setVar', p: { v: 'x', n: { k: 's', v: 'posA' } } }]], ['x'], { motors: { A: { pos: 100 } } });
  h.run.start(); await h.advance(4000);
  assert.deepStrictEqual(h.kinds('motorDeg'), [['motorDeg', 'A', -720, 40]]);
  assert.deepStrictEqual(h.kinds('motor').filter((x) => x[1] === 'B'), [['motor', 'B', 75], ['motor', 'B', 20], ['motor', 'B', 0]]);
  assert.deepStrictEqual(h.kinds('goto'), [['goto', 'E', 90, 75, 'cw']]);
  assert.ok(h.kinds('send').some((x) => x[1] === 'smode A 2'));
  assert.strictEqual(h.run.vars.x, 0, 'position relative to the reset');
  // control flow and variables
  h = harness([['start', { t: 'repeat', p: { n: n(3) } }, { t: 'changeVar', p: { v: 'a', n: n(2) } }, 'end',
    { t: 'if', p: { c: { k: 'cmp', a: V('a'), op: '=', b: n(6) } } }, { t: 'setVar', p: { v: 'b', n: n(1) } }, 'else', { t: 'setVar', p: { v: 'b', n: n(2) } }, 'end',
    { t: 'repeatUntil', p: { c: { k: 'cmp', a: V('a'), op: '>', b: n(9) } } }, { t: 'changeVar', p: { v: 'a', n: n(1) } }, 'end',
    { t: 'mathVar', p: { v: 'c', a: V('a'), op: '%', b: n(4) } }, { t: 'mathVar', p: { v: 'd', a: n(-7), op: '%', b: n(4) } }, { t: 'mathVar', p: { v: 'e', a: n(1), op: '/', b: n(0) } },
    { t: 'setVar', p: { v: 'r', n: { k: 'r', a: 1, b: 6 } } }]], ['a', 'b', 'c', 'd', 'e', 'r']);
  h.setRnd(0.999); h.run.start(); await h.advance(1500);
  assert.deepStrictEqual({ ...h.run.vars }, { a: 10, b: 1, c: 2, d: 1, e: 0, r: 6 });
  // wait until, when-hat edges, gesture, messages with wait, stop others
  h = harness([['start', { t: 'waitUntil', p: { c: { k: 'dist', op: '<', n: n(10) } } }, { t: 'setVar', p: { v: 'w', n: n(1) } }, { t: 'sendWait', p: { m: 'go' } }, { t: 'setVar', p: { v: 'w', n: n(2) } }],
    [{ t: 'when', p: { c: { k: 'force', st: 'pressed' } } }, { t: 'changeVar', p: { v: 'f', n: n(1) } }],
    [{ t: 'gesture', p: { g: 'shake' } }, { t: 'setVar', p: { v: 'g', n: n(1) } }],
    [{ t: 'onMsg', p: { m: 'go' } }, { t: 'wait', p: { n: n(1) } }, { t: 'setVar', p: { v: 'm', n: n(1) } }]], ['w', 'f', 'g', 'm']);
  h.run.start(); await h.advance(300);
  assert.strictEqual(h.run.vars.w, 0);
  h.D.dist = 80; await h.advance(200); assert.strictEqual(h.run.vars.w, 1); assert.strictEqual(h.run.vars.m, 0, 'still waiting for the message stack');
  await h.advance(1200); assert.strictEqual(h.run.vars.m, 1); assert.strictEqual(h.run.vars.w, 2);
  h.D.force = { v: 50, pressed: true }; await h.advance(200); h.D.force = { v: 50, pressed: true }; await h.advance(200);
  assert.strictEqual(h.run.vars.f, 1, 'only on the change to pressed');
  h.D.force = { v: 0, pressed: false }; await h.advance(100); h.D.force = { v: 50, pressed: true }; await h.advance(100);
  assert.strictEqual(h.run.vars.f, 2);
  h.run.fire('gesture', 2); await h.advance(100); assert.strictEqual(h.run.vars.g, 1);
  assert.strictEqual(h.log.some((x) => x[0] === 'done'), false, 'event stacks keep the program listening');
  h.run.stop(); assert.ok(h.log.some((x) => x[0] === 'stopAll') && h.log.some((x) => x[0] === 'done'));
  // forever with stop all, and stop others
  h = harness([['start', 'forever', { t: 'changeVar', p: { v: 'k', n: n(1) } }, { t: 'if', p: { c: { k: 'cmp', a: V('k'), op: '>', b: n(4) } } }, { t: 'stop', p: { w: 'all' } }, 'end', 'end']], ['k']);
  h.run.start(); await h.advance(2000);
  assert.strictEqual(h.run.vars.k, 5); assert.strictEqual(h.run.running, false);
  h = harness([['start', { t: 'wait', p: { n: n(0.2) } }, { t: 'stop', p: { w: 'others' } }, { t: 'setVar', p: { v: 'z', n: n(1) } }],
    ['start', 'forever', { t: 'changeVar', p: { v: 'k', n: n(1) } }, { t: 'wait', p: { n: n(0.1) } }, 'end']], ['k', 'z']);
  h.run.start(); await h.advance(1000);
  const k = h.run.vars.k; await h.advance(500);
  assert.strictEqual(h.run.vars.k, k, 'the other stack stopped'); assert.strictEqual(h.run.vars.z, 1);
  // timer and gyro turn
  h = harness([['start', { t: 'wait', p: { n: n(0.5) } }, { t: 'setVar', p: { v: 't', n: { k: 's', v: 'timer' } } }, 'resetTimer', { t: 'setVar', p: { v: 'u', n: { k: 's', v: 'timer' } } },
    'resetYaw', { t: 'turn', p: { side: 'right', n: n(90) } }, { t: 'setVar', p: { v: 'y', n: { k: 's', v: 'yaw' } } }]], ['t', 'u', 'y']);
  h.run.start(); await h.advance(6000);
  assert.ok(h.run.vars.t >= 0.5 && h.run.vars.t < 0.7, 'timer ' + h.run.vars.t); assert.strictEqual(h.run.vars.u, 0);
  assert.ok(h.run.vars.y <= -84 && h.run.vars.y >= -96, 'turned about 90 degrees: ' + h.run.vars.y);
  assert.ok(h.kinds('drive').some((x) => x[1] > 0 && x[2] < 0) && h.kinds('drive').slice(-1)[0].join() === 'drive,0,0');
  // no motion data: the turn is skipped with a warning
  h = harness([['start', { t: 'turn', p: { side: 'left', n: n(90) } }]], [], { imu: null });
  h.run.start(); await h.advance(200); assert.ok(h.kinds('warn').some((x) => x[1] === 'noImu'));
  // lights: image, rotation, brightness, pixel, scrolling text, off
  h = harness([['start', { t: 'img', p: { img: C.IMAGES.up } }, { t: 'orient', p: { o: 'right' } }, { t: 'bright', p: { n: n(50) } }, 'lightOff',
    { t: 'pixel', p: { x: n(1), y: n(5), n: n(100) } }, { t: 'writeVal', p: { n: n(7) } }]]);
  h.run.start(); await h.advance(3000);
  const imgs = h.kinds('img').map((x) => x[1]);
  assert.strictEqual(imgs[0], C.IMAGES.up); assert.strictEqual(imgs[1], C.IMAGES.right, 'rotated right');
  assert.strictEqual(imgs[2], C.IMAGES.right.replace(/9/g, '4'), 'half brightness');
  assert.strictEqual(imgs[4].split('').filter((c) => c !== '0').length, 1, 'one pixel');
  const cols = C.textColumns('7');
  assert.strictEqual(imgs.length, 5 + cols.length - 4, 'one frame per scroll step');
  assert.ok(imgs.some((im) => im.includes('9')), 'digit shown');
  // sound: song, long beep split in notes up to 3 s, pitch, volume, mood, robot language, hub light, eyes
  h = harness([['start', { t: 'pitch', p: { n: n(12) } }, { t: 'songWait', p: {} }, { t: 'pitch', p: { n: n(0) } }, { t: 'beepFor', p: { note: 'A4', n: n(4) } }, { t: 'vol', p: { n: n(30) } }, { t: 'volBy', p: { n: n(-50) } },
    'mood', 'say', { t: 'btnLight', p: { c: 9 } }, { t: 'eyes', p: { p: 'A', a: n(100), b: n(0), c: n(200), d: n(50) } }, 'soundStop']]);
  h.run.start(); await h.advance(7000);
  const tunes = JSON.parse(JSON.stringify(h.kinds('tune').map((x) => x[1])));
  assert.deepStrictEqual(tunes[0], [[880, 200], [0, 50], [988, 200]], 'an octave up');
  assert.deepStrictEqual(tunes[1], [[440, 3000], [440, 1000]]);
  assert.deepStrictEqual(h.kinds('send').map((x) => x[1]), ['vol 30', 'vol 0', 'light 9', 'eyes A 100 0 100 50', 'hush']);
  assert.ok(h.kinds('mood').length === 1 && h.kinds('talk').length === 1 && h.log.some((x) => x[0] === 'done'));
  // conditions: colour, tilt, face, button, motor position, not
  h = harness([['start']], [], { colors: { B: 3, E: 9 }, imu: { yaw: 0, pitch: -30, roll: 2, face: 1 }, btn: { L: 1, R: 0 }, motors: { A: { pos: 400 } }, dist: -1 });
  const cond = (c) => h.run.cond(C.cleanCond(c));
  assert.strictEqual(cond({ k: 'color', p: 'any', col: 9 }), true); assert.strictEqual(cond({ k: 'color', p: 'B', col: 9 }), false);
  assert.strictEqual(cond({ k: 'tilt', dir: 'tfw' }), true); assert.strictEqual(cond({ k: 'tilt', dir: 'level' }), false);
  assert.strictEqual(cond({ k: 'face', f: 'ffront' }), true); assert.strictEqual(cond({ k: 'btn', b: 'L' }), true); assert.strictEqual(cond({ k: 'btn', b: 'R', not: true }), true);
  assert.strictEqual(cond({ k: 'motor', p: 'A', op: '>', n: n(360) }), true);
  assert.strictEqual(cond({ k: 'dist', op: '<', n: n(10) }), false, 'nothing in sight is far away'); assert.strictEqual(cond({ k: 'dist', op: '>', n: n(10) }), true);
  // decidegrees from the hub are recognised
  h = harness([['start', { t: 'wait', p: { n: n(0.3) } }, { t: 'setVar', p: { v: 'p', n: { k: 's', v: 'pitch' } } }]], ['p'], { imu: { yaw: 0, pitch: 450, roll: 0, face: 0 } });
  h.run.start(); await h.advance(500); assert.strictEqual(h.run.vars.p, 45);
  // highlighting: the active card is reported, and cleared at the end
  h = harness([['start', { t: 'wait', p: { n: n(0.1) } }, { t: 'wait', p: { n: n(0.1) } }]]);
  h.run.start(); await h.advance(500);
  assert.deepStrictEqual(h.kinds('active').map((x) => x[2]), [1, 2, -1, -1]);
  console.log('OK cards:', Object.keys(C.TYPES).length, 'card types,', Object.keys(C.COND).length, 'conditions, runner checks passed');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
