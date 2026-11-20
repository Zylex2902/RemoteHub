// Blocks -> Python: the generated MicroPython must be valid, use no undefined names, and move the right
// motors by the right amounts. It runs in CPython with stand-ins for the hub's modules that log each call.
const assert = require('assert'), path = require('path'), fs = require('fs'), os = require('os');
const { execFileSync } = require('child_process');
const Cards = require('../src/cards.js'), ToPython = require('../src/topython.js'), I18N = require('../src/i18n.js');

const tr = (k, ...a) => (I18N.en[k] || k).replace(/\{(\d)\}/g, (_, i) => (a[i] !== undefined ? a[i] : ''));
const ctx = (name) => ({ name, left: 'C', right: 'D', invL: true, invR: false, sensors: { distance: 'A', force: 'E', color: ['B'] }, tr,
  freq: () => 523, song: () => [[262, 200], [0, 50], [330, 200]], mood: () => [[[500, 80]], '0000009090000009000909990'] });
const n = (v) => ({ k: 'n', v }), card = (t, p) => { const c = Cards.newCard(t); if (p) Object.assign(c.p, p); return c; };
let checks = 0;

// Stand-ins for the SPIKE App 3 modules; every call is logged.
const STUBS = String.raw`
import asyncio, sys, types, json, time as _realtime
LOG = []
class _Port: pass
port = _Port()
for _p in "ABCDEF": setattr(port, _p, _p)
def _mod(name, **kw):
    m = types.ModuleType(name); m.__dict__.update(kw); sys.modules[name] = m; return m
def _log(name):
    def f(*a, **k):
        LOG.append([name] + [str(x) for x in a] + [k2 + "=" + str(v) for k2, v in k.items()])
        async def done(): return 0
        return done()
    return f
_ticks = [0]
async def _sleep_ms(ms):
    _ticks[0] += max(1, ms)
    if _ticks[0] > 60000: raise SystemExit
    await asyncio.sleep(0)
def _run(*coros):
    async def main(): await asyncio.gather(*coros)
    try: asyncio.run(main())
    except SystemExit: pass
_mod("runloop", run=_run, sleep_ms=_sleep_ms)
_time = types.ModuleType("time"); _time.__dict__.update(_realtime.__dict__)
_time.ticks_ms = lambda: _ticks[0]; _time.ticks_diff = lambda a, b: a - b
sys.modules["time"] = _time
ms = _mod("motion_sensor", tilt_angles=lambda: (0, 0, 0), up_face=lambda: 0, gesture=lambda: -1, reset_yaw=_log("reset_yaw"),
          TOP=0, FRONT=1, RIGHT=2, BOTTOM=3, BACK=4, LEFT=5)
lm = _mod("light_matrix", set_pixel=lambda x, y, b: LOG.append(["pixel", str(x), str(y), str(b)]), clear=_log("clear"), write=_log("write"))
snd = _mod("sound", beep=_log("beep"), stop=_log("sound.stop"))
btn = _mod("button", pressed=lambda b: 0, LEFT="L", RIGHT="R")
_mod("hub", port=port, motion_sensor=ms, light_matrix=lm, sound=snd, button=btn)
_mod("motor", run=_log("run"), stop=_log("stop"), run_for_degrees=_log("deg"), run_to_absolute_position=_log("goto"),
     relative_position=lambda p: 0, reset_relative_position=_log("reset"), SHORTEST_PATH=0, CLOCKWISE=1, COUNTERCLOCKWISE=2)
_mod("color", **{c: i for i, c in enumerate("BLACK MAGENTA PURPLE BLUE AZURE TURQUOISE GREEN YELLOW ORANGE RED WHITE".split())}, UNKNOWN=-1)
_mod("color_sensor", color=lambda p: 9, reflection=lambda p: 40)
_mod("distance_sensor", distance=lambda p: 150, show=_log("eyes"))
_mod("force_sensor", force=lambda p: 30, pressed=lambda p: False)
`;

function runPy(code) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'topy-'));
  fs.writeFileSync(path.join(dir, 'prog.py'), code);
  fs.writeFileSync(path.join(dir, 'harness.py'), STUBS + `
import builtins
src = open(sys.argv[1]).read()
compile(src, "prog.py", "exec")
try:
    exec(compile(src, "prog.py", "exec"), {"__name__": "__main__"})
except SystemExit:
    pass
print(json.dumps(LOG))
`);
  const out = execFileSync('python3', ['-I', '-W', 'ignore', path.join(dir, 'harness.py'), path.join(dir, 'prog.py')], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] });
  fs.rmSync(dir, { recursive: true, force: true });
  return JSON.parse(out.trim().split('\n').pop());
}

// 1. A straight program: the moves land on the right ports with the right amounts.
let prog = Cards.cleanProgram({ stacks: [[card('start'), card('moveFor', { n: n(10) }), card('turn', { side: 'right', n: n(90) }),
  card('motorFor', { p: 'E', n: n(2), unit: 'rot' }), card('img', { img: Cards.IMAGES.heart }), card('beepFor', { n: n(0.5) }), card('write', { t: 'Hi' })]] });
let py = ToPython.convert(prog, ctx('Test'));
let log = runPy(py);
const degs = log.filter((x) => x[0] === 'deg');
assert.deepStrictEqual(degs.slice(0, 2), [['deg', 'C', '-206', '500'], ['deg', 'D', '206', '500']], 'drive 10 cm: 206 degrees, left motor reversed'); checks++;
assert.deepStrictEqual(degs[2], ['deg', 'E', '720', '750'], 'two rotations of motor E at 75%'); checks++;
assert.ok(log.some((x) => x[0] === 'run' && x[1] === 'C') && log.some((x) => x[0] === 'stop' && x[1] === 'C'), 'turn runs and stops the wheels'); checks++;
assert.ok(log.filter((x) => x[0] === 'pixel').length >= 25, 'picture drawn pixel by pixel'); checks++;
assert.deepStrictEqual(log.find((x) => x[0] === 'beep'), ['beep', '523', '500', '80'], 'beep C5 for half a second'); checks++;
assert.deepStrictEqual(log.find((x) => x[0] === 'write'), ['write', 'Hi'], 'text on the light matrix'); checks++;
assert.ok(/runloop\.run\(stack1\(\)\)/.test(py) && /^# /.test(py), 'one stack, with a heading'); checks++;

// 2. Every card type and every kind of value/condition: valid Python that runs without errors.
const cond = { k: 'and', a: { k: 'dist', op: '<', n: n(20) }, b: { k: 'or', a: { k: 'color', p: 'any', col: 9 }, b: { k: 'not', a: { k: 'btn', b: 'L' } } } };
const val = { k: 'op', op: '+', a: { k: 'r', a: n(1), b: n(6) }, b: { k: 'fn', f: 'sqrt', a: { k: 's', v: 'dist' } } };
const all = [card('start'), card('setVar', { v: 'tel ler', n: val }), card('changeVar', { v: 'tel ler', n: n(1) }), card('mathVar', { v: 'tel ler', a: { k: 'v', v: 'tel ler' }, op: '%', b: n(3) })];
for (const t of Object.keys(Cards.TYPES)) {
  const T = Cards.TYPES[t];
  if (T.kind === 'hat' || ['else', 'end', 'forever', 'stop'].includes(t)) continue;
  const c = card(t);
  for (const s of T.params) if (s.type === 'cond') c.p[s.k] = cond; else if (s.type === 'var') c.p[s.k] = 'tel ler';
  all.push(c);
  if (T.kind === 'begin') { all.push(card('wait', { n: n(0.1) })); if (t === 'if') all.push(card('else'), card('beepFor')); all.push(card('end')); }
}
all.push(card('send', { m: 'go' }), card('sendWait', { m: 'go' }), card('stop', { w: 'all' }));
prog = Cards.cleanProgram({ vars: ['tel ler'], stacks: [all, [card('onMsg', { m: 'go' }), card('moveFor', { n: n(1) })],
  [card('when', { c: { k: 'timer', op: '>', n: n(1) } }), card('lightOff')], [card('gesture', { g: 'shake' }), card('soundStop')]] });
py = ToPython.convert(prog, ctx('Alles'));
log = runPy(py);
assert.ok(log.length > 50, 'the long program ran (' + log.length + ' calls)'); checks++;
assert.ok(/^tel_ler = 0$/m.test(py) && /global tel_ler/.test(py), 'variable name made valid and declared global'); checks++;
assert.ok(/import distance_sensor/.test(py) && /import color, color_sensor/.test(py) && /import random/.test(py) && /import math/.test(py), 'needed modules imported'); checks++;
assert.ok(log.some((x) => x[0] === 'deg' && x[1] === 'C' && x[2] === '-21'), 'the message stack drove (1 cm)'); checks++;
assert.ok(/runloop\.run\(stack1\(\), stack2\(\), stack3\(\), stack4\(\)\)/.test(py), 'all four stacks run together'); checks++;

// 3. An empty program still gives valid Python; only what is used is imported.
py = ToPython.convert({ stacks: [], vars: [] }, ctx('Leeg'));
runPy(py); checks++;
assert.ok(!/distance_sensor|force_sensor|color_sensor/.test(py), 'no sensor imports when unused'); checks++;

console.log('OK topython: ' + checks + ' checks (every card type runs as Python against simulated hub modules)');
