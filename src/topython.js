// Blokken -> MicroPython voor de hub (SPIKE App 3-firmware). Zet een programma in het formaat van de
// uitvoerder (Cards.fromBlocks) om in Python dat op de hub zelf draait, zo dicht mogelijk bij wat de
// blokken in de app doen. Wat geen betrouwbare Python-tegenhanger heeft, wordt een duidelijke opmerking.
// Geen DOM: ook in node te testen (tests/test_topython.js voert de uitvoer uit met nagebootste modules).
const ToPython = (() => {
  const COLOR_NAMES = { '-1': 'UNKNOWN', 0: 'BLACK', 1: 'MAGENTA', 2: 'PURPLE', 3: 'BLUE', 4: 'AZURE', 5: 'TURQUOISE', 6: 'GREEN', 7: 'YELLOW', 8: 'ORANGE', 9: 'RED', 10: 'WHITE' };
  const FACES = { ftop: 'TOP', ffront: 'FRONT', fright: 'RIGHT', fbottom: 'BOTTOM', fback: 'BACK', fleft: 'LEFT' };
  const GESTURES = { tap: 0, dtap: 1, shake: 2, fall: 3 };
  const KEYWORDS = new Set(('False None True and as assert async await break class continue def del elif else except finally for from global if import in is ' +
    'lambda nonlocal not or pass raise return try while with yield print len int str max min abs round range').split(' '));

  // ctx: { name, left, right, invL, invR, sensors: { distance, force, color: [] }, freq(note), song(id) -> [[f, ms]], mood(id) -> [[f, ms], face], tr(key, ...) }
  function convert(prog, ctx) {
    const tr = ctx.tr || ((k) => k);
    const out = [], used = new Set(), varNames = {}, notes = [];
    const need = (x) => used.add(x);
    // Variabelen: geldige Python-namen, verder zo leesbaar mogelijk.
    const vname = (v) => {
      if (!(v in varNames)) {
        let n = String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(?=\d)/, 'v_');
        if (!n || /^_+$/.test(n) || KEYWORDS.has(n)) n = 'var' + (Object.keys(varNames).length + 1);
        while (Object.values(varNames).includes(n)) n += '_';
        varNames[v] = n;
      }
      return varNames[v];
    };
    const num = (x) => { const r = Math.round(x * 1000) / 1000; return Number.isInteger(r) ? String(r) : String(r); };
    // Waarden (getallen, variabelen, sensoren, sommen) naar een Python-uitdrukking.
    const val = (v) => {
      if (!v) return '0';
      if (v.k === 'n') return num(+v.v || 0);
      if (v.k === 'v') return vname(v.v);
      if (v.k === 's') return sensor(v.v);
      if (v.k === 'op') {
        const a = val(v.a), b = val(v.b);
        if (v.op === '/') return 'div(' + a + ', ' + b + ')';
        if (v.op === '%') return 'mod(' + a + ', ' + b + ')';
        return '(' + a + ' ' + v.op + ' ' + b + ')';
      }
      if (v.k === 'fn') {
        const a = val(v.a);
        if (v.f === 'abs') return 'abs(' + a + ')';
        if (v.f === 'round') return 'round(' + a + ')';
        need('math');
        return 'math.' + (v.f === 'sqrt' ? 'sqrt(max(0, ' + a + '))' : v.f + '(' + a + ')');
      }
      if (v.k === 'r') { need('random'); return 'rnd(' + val(v.a) + ', ' + val(v.b) + ')'; }
      return '0';
    };
    const sensor = (id) => {
      if (id === 'dist') { need('distance'); return 'distance_cm()'; }
      if (id === 'force') { need('force'); return 'force_pct()'; }
      if (id === 'light') { need('color'); return 'light_pct()'; }
      if (id === 'color') { need('color'); return 'color_now()'; }
      if (id === 'timer') return 'timer()';
      if (id === 'yaw' || id === 'pitch' || id === 'roll') return id + '()';
      if (id.startsWith('pos')) return 'motor.relative_position(port.' + id[3] + ')';
      return '0';
    };
    const cmpOp = (op) => (op === '=' ? '==' : op);
    const cond = (c) => {
      if (!c) return 'False';
      let r;
      switch (c.k) {
        case 'none': return 'False';
        case 'and': return '(' + cond(c.a) + ' and ' + cond(c.b) + ')';
        case 'or': return '(' + cond(c.a) + ' or ' + cond(c.b) + ')';
        case 'not': return '(not ' + cond(c.a) + ')';
        case 'dist': need('distance'); r = 'distance_is(' + JSON.stringify(c.op) + ', ' + val(c.n) + ')'; break;
        case 'color': need('color'); r = 'sees_color(' + (c.p === 'any' ? 'None' : 'port.' + c.p) + ', color.' + COLOR_NAMES[c.col] + ')'; break;
        case 'force': need('force'); r = c.st === 'pressed' ? 'force_pressed()' : c.st === 'released' ? '(not force_pressed())' : '(force_pct() >= 70)'; break;
        case 'tilt': r = { tfw: '(pitch() < -20)', tbw: '(pitch() > 20)', tleft: '(roll() < -20)', tright: '(roll() > 20)' }[c.dir] || '(abs(pitch()) < 10 and abs(roll()) < 10)'; break;
        case 'face': r = '(motion_sensor.up_face() == motion_sensor.' + (FACES[c.f] || 'TOP') + ')'; break;
        case 'btn': need('button'); r = '(button.pressed(button.' + (c.b === 'R' ? 'RIGHT' : 'LEFT') + ') > 0)'; break;
        case 'timer': r = '(timer() ' + cmpOp(c.op) + ' ' + val(c.n) + ')'; break;
        case 'motor': r = '(motor.relative_position(port.' + c.p + ') ' + cmpOp(c.op) + ' ' + val(c.n) + ')'; break;
        case 'cmp': r = '(' + val(c.a) + ' ' + cmpOp(c.op) + ' ' + val(c.b) + ')'; break;
        default: r = 'False';
      }
      return c.not ? '(not ' + r + ')' : r;
    };
    const img = (s) => '"' + s + '"';
    const noteList = (list) => '[' + list.map(([f, ms]) => '(' + Math.round(f) + ', ' + Math.round(ms) + ')').join(', ') + ']';
    const comment = (key, ...a) => '# ' + tr(key, ...a).replace(/\n/g, ' ');

    // Eén kaart (opdracht) naar regels Python, met inspringing.
    function cmd(c, ind, body, elseBody) {
      const p = c.p || {}, v = (k) => val(p[k]), L = (s) => out.push(ind + s), sub = (nodes) => block(nodes, ind + '    ');
      switch (c.t) {
        case 'repeat': L('for _ in range(int(' + v('n') + ')):'); sub(body); L('    await runloop.sleep_ms(0)'); return;
        case 'forever': L('while True:'); sub(body); L('    await runloop.sleep_ms(0)'); return;
        case 'repeatUntil': L('while not ' + cond(p.c) + ':'); sub(body); L('    await runloop.sleep_ms(0)'); return;
        case 'if': L('if ' + cond(p.c) + ':'); sub(body); if (elseBody && elseBody.length) { L('else:'); sub(elseBody); } return;
        case 'moveFor': L('await drive(' + (p.dir === 'bw' ? '-' : '') + 'state["speed"], ' + (p.dir === 'bw' ? '-' : '') + 'state["speed"], ' + v('n') + ', "' + p.unit + '")'); return;
        case 'steerFor': L('l, r = steer(' + v('s') + ')'); L('await drive(l, r, ' + v('n') + ', "' + p.unit + '")'); return;
        case 'tankFor': L('await drive(' + v('l') + ', ' + v('r') + ', ' + v('n') + ', "' + p.unit + '")'); return;
        case 'moveStart': L('run(' + (p.dir === 'bw' ? '-' : '') + 'state["speed"], ' + (p.dir === 'bw' ? '-' : '') + 'state["speed"])'); return;
        case 'steerStart': L('l, r = steer(' + v('s') + ')'); L('run(l, r)'); return;
        case 'tankStart': L('run(' + v('l') + ', ' + v('r') + ')'); return;
        case 'moveStop': L('run(0, 0)'); return;
        case 'moveSpeed': L('state["speed"] = clamp(' + v('n') + ', 0, 100)'); return;
        case 'turn': L('await turn("' + p.side + '", abs(' + v('n') + '))'); return;
        case 'movePorts': L('run(0, 0)'); L('state["left"], state["right"] = port.' + p.l + ', port.' + p.r); return;
        case 'wheel': L('state["wheel"] = max(1, ' + v('n') + ')'); return;
        case 'motorFor': {
          const sg = p.dir === 'ccw' ? '-' : '';
          if (p.unit === 'sec') { L('motor.run(port.' + p.p + ', ' + sg + 'mspeed("' + p.p + '") * 10)'); L('await runloop.sleep_ms(int(' + v('n') + ' * 1000))'); L('motor.stop(port.' + p.p + ')'); return; }
          L('await motor.run_for_degrees(port.' + p.p + ', int(' + sg + (p.unit === 'rot' ? v('n') + ' * 360' : v('n')) + '), mspeed("' + p.p + '") * 10)'); return;
        }
        case 'motorGoto': L('await motor.run_to_absolute_position(port.' + p.p + ', int(' + v('n') + ') % 360, mspeed("' + p.p + '") * 10, direction=motor.' + ({ s: 'SHORTEST_PATH', cw: 'CLOCKWISE', ccw: 'COUNTERCLOCKWISE' }[p.way] || 'SHORTEST_PATH') + ')'); return;
        case 'motorStart': L('motor.run(port.' + p.p + ', ' + (p.dir === 'ccw' ? '-' : '') + 'mspeed("' + p.p + '") * 10)'); return;
        case 'motorStop': L('motor.stop(port.' + p.p + ')'); return;
        case 'motorSpeed': L('state["mspeed"]["' + p.p + '"] = clamp(' + v('n') + ', 0, 100)'); return;
        case 'motorStopMode': L(comment('pyg.stopMode', p.p, p.mode)); return;
        case 'motorReset': L('motor.reset_relative_position(port.' + p.p + ', 0)'); return;
        case 'imgFor': L('show(' + img(p.img) + ')'); L('await runloop.sleep_ms(int(' + v('n') + ' * 1000))'); L('clear()'); return;
        case 'img': L('show(' + img(p.img) + ')'); return;
        case 'anim': {
          const frames = [p.f1, p.f2, p.f3, p.f4].filter((f) => /[1-9]/.test(f));
          L('for _ in range(max(1, int(' + v('times') + '))):');
          L('    for frame in [' + (frames.length ? frames : [p.f1]).map(img).join(', ') + ']:');
          L('        show(frame)'); L('        await runloop.sleep_ms(int(' + v('n') + ' * 1000))'); return;
        }
        case 'write': L('await write(' + JSON.stringify(String(p.t || '')) + ')'); return;
        case 'writeVal': L('await write(str(round(' + v('n') + ', 1)))'); return;
        case 'lightOff': L('clear()'); return;
        case 'pixel': L('pixel(' + v('x') + ', ' + v('y') + ', ' + v('n') + ')'); return;
        case 'bright': L('state["bright"] = clamp(' + v('n') + ', 0, 100)'); return;
        case 'orient': L(comment('pyg.orient')); return;
        case 'btnLight': L(comment('pyg.btnLight')); return;
        case 'eyes': need('distance'); L('eyes(port.' + p.p + ', ' + ['a', 'b', 'c', 'd'].map((k) => v(k)).join(', ') + ')'); return;
        case 'songWait': case 'songStart': {
          const n = 'SONG_' + String(p.song).toUpperCase().replace(/[^A-Z0-9]/g, '_');
          if (!notes.some((x) => x[0] === n)) notes.push([n, ctx.song ? ctx.song(p.song) : []]);
          if (c.t === 'songStart') L(comment('pyg.songStart'));
          L('await tune(' + n + ')'); return;
        }
        case 'beepFor': L('await beep(' + Math.round(ctx.freq ? ctx.freq(p.note) : 440) + ', ' + v('n') + ')'); return;
        case 'beepStart': L('beep_start(' + Math.round(ctx.freq ? ctx.freq(p.note) : 440) + ')'); return;
        case 'soundStop': L('stop_sound()'); return;
        case 'vol': L('state["vol"] = clamp(' + v('n') + ', 0, 100)'); return;
        case 'volBy': L('state["vol"] = clamp(state["vol"] + ' + v('n') + ', 0, 100)'); return;
        case 'pitch': L('state["pitch"] = clamp(' + v('n') + ', -24, 24)'); return;
        case 'mood': {
          const n = 'MOOD_' + String(p.mood).toUpperCase().replace(/[^A-Z0-9]/g, '_'), m = ctx.mood ? ctx.mood(p.mood) : [[], null];
          if (!notes.some((x) => x[0] === n)) notes.push([n, m[0]]);
          if (m[1]) L('show(' + img(m[1]) + ')');
          L('await tune(' + n + ')'); return;
        }
        case 'say': L(comment('pyg.say', p.t)); return;
        case 'wait': L('await runloop.sleep_ms(int(' + v('n') + ' * 1000))'); return;
        case 'waitUntil': L('while not ' + cond(p.c) + ':'); L('    await runloop.sleep_ms(20)'); return;
        case 'stop':
          if (p.w === 'this') { L('return'); return; }
          if (p.w === 'others') { L(comment('pyg.stopOthers')); return; }
          L('stop_all()'); L('raise SystemExit'); return;
        case 'resetTimer': L('state["t0"] = time.ticks_ms()'); return;
        case 'resetYaw': L('motion_sensor.reset_yaw(0)'); return;
        case 'setVar': if (p.v) L(vname(p.v) + ' = ' + v('n')); return;
        case 'changeVar': if (p.v) L(vname(p.v) + ' = ' + vname(p.v) + ' + ' + v('n')); return;
        case 'mathVar': {
          if (!p.v) return;
          const a = v('a'), b = v('b');
          L(vname(p.v) + ' = ' + (p.op === '/' ? 'div(' + a + ', ' + b + ')' : p.op === '%' ? 'mod(' + a + ', ' + b + ')' : a + ' ' + p.op + ' ' + b)); return;
        }
        case 'send': L('send(' + JSON.stringify(p.m) + ')'); return;
        case 'sendWait': L('await send_and_wait(' + JSON.stringify(p.m) + ')'); return;
        default: L(comment('pyg.unknown', c.t));
      }
    }
    // Een lijst kaarten met begin/eind (zoals compile in cards.js) naar een boom en dan naar Python.
    function tree(cards) {
      const root = [], stack = [{ list: root }];
      for (const c of cards) {
        const top = stack[stack.length - 1];
        if (c.t === 'end') { if (stack.length > 1) stack.pop(); continue; }
        if (c.t === 'else') { if (top.node && top.node.c.t === 'if') { top.node.inElse = true; top.list = top.node.elseBody; } continue; }
        const node = { c, body: [], elseBody: [] };
        top.list.push(node);
        if (['repeat', 'forever', 'repeatUntil', 'if'].includes(c.t)) stack.push({ list: node.body, node });
      }
      return root;
    }
    function block(nodes, ind) {
      const before = out.length;
      for (const n of nodes) cmd(n.c, ind, n.body, n.elseBody);
      if (out.length === before) out.push(ind + 'pass');
    }

    // De sporen: elk een eigen async-functie; wanneer/gebaar/bericht-sporen wachten in een lus op hun moment.
    const stacks = prog.stacks || [], runs = [];
    stacks.forEach((s, si) => {
      const hat = s[0], name = 'stack' + (si + 1), nodes = tree(s.slice(1));
      if (hat.t === 'start') {
        out.push('async def ' + name + '():'); block(nodes, '    ');
      } else if (hat.t === 'when') {
        out.push('async def ' + name + '():', '    before = False', '    while True:', '        now = ' + cond(hat.p.c),
          '        if now and not before:'); block(nodes, '            ');
        out.push('        before = now', '        await runloop.sleep_ms(20)');
      } else if (hat.t === 'gesture') {
        out.push('async def ' + name + '():', '    while True:', '        if motion_sensor.gesture() == ' + GESTURES[hat.p.g] + ':'); block(nodes, '            ');
        out.push('        await runloop.sleep_ms(20)');
      } else if (hat.t === 'onMsg') {
        out.push('async def ' + name + '():', '    while True:', '        if messages.get(' + JSON.stringify(hat.p.m) + '):',
          '            messages[' + JSON.stringify(hat.p.m) + '] = False', '            busy[' + JSON.stringify(hat.p.m) + '] = busy.get(' + JSON.stringify(hat.p.m) + ', 0) + 1');
        block(nodes, '            ');
        out.push('            busy[' + JSON.stringify(hat.p.m) + '] -= 1', '        await runloop.sleep_ms(20)');
      } else return;
      out.push('');
      runs.push([name + '()', hat.t]);
    });
    // Variabelen die in een functie veranderen, moeten daar 'global' zijn.
    const allVars = Object.values(varNames);
    const body = out.join('\n');
    const fixed = body.replace(/^async def (stack\d+)\(\):$/gm, (m) => (allVars.length ? m + '\n    global ' + allVars.join(', ') : m));

    // Kop met hulpfuncties; alleen wat gebruikt wordt, zodat het programma leesbaar blijft.
    const S = ctx.sensors || {}, colorPorts = (S.color || []).length ? S.color : ['B'];
    const head = [];
    head.push('# ' + tr('pyg.title', ctx.name || ''), '# ' + tr('pyg.note'), '');
    head.push('from hub import port, motion_sensor');
    if (used.has('button')) head.push('from hub import button');
    head.push('import motor, runloop, time');
    if (used.has('random')) head.push('import random');
    if (used.has('math')) head.push('import math');
    if (used.has('color')) head.push('import color, color_sensor');
    else if (/\bcolor\./.test(fixed)) head.push('import color');
    if (used.has('distance')) head.push('import distance_sensor');
    if (used.has('force')) head.push('import force_sensor');
    head.push('try:', '    from hub import light_matrix', 'except ImportError:', '    light_matrix = None',
      'try:', '    from hub import sound', 'except ImportError:', '    sound = None', '');
    head.push(comment('pyg.ports'));
    head.push('state = {"left": port.' + (ctx.left || 'A') + ', "right": port.' + (ctx.right || 'B') + ', "speed": 50, "wheel": 17.5, "vol": 80, "pitch": 0,',
      '         "bright": 100, "mspeed": {}, "t0": time.ticks_ms()}');
    head.push('FLIP_L, FLIP_R = ' + (ctx.invL === false ? '1' : '-1') + ', ' + (ctx.invR ? '-1' : '1') + '  ' + comment('pyg.flip'));
    if (used.has('distance')) head.push('DISTANCE = port.' + (S.distance || 'C') + '  ' + comment('pyg.sensorPort'));
    if (used.has('force')) head.push('FORCE = port.' + (S.force || 'E') + '  ' + comment('pyg.sensorPort'));
    if (used.has('color')) head.push('COLORS = [' + colorPorts.map((p) => 'port.' + p).join(', ') + ']  ' + comment('pyg.sensorPort'));
    allVars.forEach((n) => head.push(n + ' = 0'));
    head.push('messages, busy = {}, {}');
    notes.forEach(([n, list]) => head.push(n + ' = ' + noteList(list)));
    head.push('', comment('pyg.helpers'),
      'def clamp(x, lo, hi):', '    return max(lo, min(hi, x))',
      'def div(a, b):', '    return a / b if b else 0',
      'def mod(a, b):', '    return a % b if b else 0',
      'def steer(s):', '    s, v = clamp(s, -100, 100), state["speed"]', '    return (v, v * (1 - s / 50)) if s >= 0 else (v * (1 + s / 50), v)',
      'def mspeed(p):', '    return state["mspeed"].get(p, 75)',
      'def run(l, r):', '    for p, v, f in ((state["left"], l, FLIP_L), (state["right"], r, FLIP_R)):',
      '        if v:', '            motor.run(p, int(clamp(v, -100, 100) * 10 * f))', '        else:', '            motor.stop(p)',
      'async def drive(l, r, amount, unit):',
      '    if unit == "sec":', '        run(l, r)', '        await runloop.sleep_ms(int(amount * 1000))', '        run(0, 0)', '        return',
      '    deg = amount * 360 if unit == "rot" else amount / state["wheel"] * 360 if unit == "cm" else amount',
      '    outer = max(abs(l), abs(r))', '    if not outer or not deg:', '        return',
      '    a = motor.run_for_degrees(state["left"], round(deg * l / outer) * FLIP_L, int(abs(l) * 10))',
      '    b = motor.run_for_degrees(state["right"], round(deg * r / outer) * FLIP_R, int(abs(r) * 10))',
      '    await a', '    await b',
      'def yaw():', '    return motion_sensor.tilt_angles()[0] / 10',
      'def pitch():', '    return motion_sensor.tilt_angles()[1] / 10',
      'def roll():', '    return motion_sensor.tilt_angles()[2] / 10',
      'async def turn(side, angle):', '    s = max(15, min(state["speed"], 40))', '    start, t = yaw(), time.ticks_ms()',
      '    run(s, -s) if side == "right" else run(-s, s)',
      '    while abs(yaw() - start) < max(0, angle - 4) and time.ticks_diff(time.ticks_ms(), t) < max(3000, angle * 60):',
      '        await runloop.sleep_ms(20)', '    run(0, 0)',
      'def timer():', '    return time.ticks_diff(time.ticks_ms(), state["t0"]) / 1000');
    if (used.has('random')) head.push('def rnd(a, b):', '    lo, hi = min(a, b), max(a, b)', '    return random.randint(int(lo), int(hi)) if lo == int(lo) and hi == int(hi) else random.uniform(lo, hi)');
    if (used.has('distance')) head.push('def distance_cm():', '    d = distance_sensor.distance(DISTANCE)', '    return -1 if d < 0 else round(d / 10)',
      'def distance_is(op, cm):', '    d = distance_cm()', '    if d < 0:', '        return op == ">"', '    return d < cm if op == "<" else d > cm',
      'def eyes(p, a, b, c, d):', '    try:', '        distance_sensor.show(p, [int(clamp(x, 0, 100)) for x in (a, b, c, d)])', '    except Exception:', '        pass');
    if (used.has('force')) head.push('def force_pct():', '    return force_sensor.force(FORCE)', 'def force_pressed():', '    return force_sensor.pressed(FORCE)');
    if (used.has('color')) head.push('def color_now():', '    return color_sensor.color(COLORS[0])', 'def light_pct():', '    return color_sensor.reflection(COLORS[0])',
      'def sees_color(p, c):', '    return any(color_sensor.color(q) == c for q in ([p] if p is not None else COLORS))');
    head.push('def show(img):', '    if light_matrix:', '        for i in range(25):',
      '            v = int(img[i])', '            light_matrix.set_pixel(i % 5, i // 5, int((100 if v == 9 else v * 11) * state["bright"] / 100))',
      'def clear():', '    if light_matrix:', '        light_matrix.clear()',
      'def pixel(x, y, b):', '    if light_matrix:', '        light_matrix.set_pixel(int(clamp(x, 1, 5)) - 1, int(clamp(y, 1, 5)) - 1, int(clamp(b, 0, 100)))',
      'async def write(text):', '    if light_matrix:', '        await light_matrix.write(text)',
      'def hz(f):', '    return int(clamp(f * 2 ** (state["pitch"] / 12), 100, 10000))',
      'async def beep(f, seconds):', '    if sound:', '        await sound.beep(hz(f), int(max(0.01, seconds) * 1000), int(state["vol"]))',
      'def beep_start(f):', '    if sound:', '        sound.beep(hz(f), 60000, int(state["vol"]))',
      'def stop_sound():', '    if sound:', '        sound.stop()',
      'async def tune(notes):', '    for f, ms in notes:', '        if f and sound:', '            await sound.beep(hz(f), ms, int(state["vol"]))',
      '        else:', '            await runloop.sleep_ms(ms)',
      'def send(m):', '    messages[m] = True',
      'async def send_and_wait(m):', '    send(m)', '    await runloop.sleep_ms(40)', '    while messages.get(m) or busy.get(m, 0) > 0:', '        await runloop.sleep_ms(20)',
      'def stop_all():', '    run(0, 0)', '    stop_sound()', '');
    const tail = [comment('pyg.main')];
    if (!runs.length) tail.push(comment('pyg.empty'));
    else tail.push('runloop.run(' + runs.map((r) => r[0]).join(', ') + ')');
    return head.join('\n') + '\n' + comment('pyg.program') + '\n' + fixed + '\n' + tail.join('\n') + '\n';
  }
  return { convert };
})();
if (typeof module !== 'undefined') module.exports = ToPython;
