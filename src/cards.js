// Programmeerkaartjes: de kaartenset, het opschonen van opgeslagen programma's en de uitvoerder.
// Geen DOM en geen hub-code: de pagina geeft een io-object mee (motoren, geluid, lampjes, sensoren),
// zodat dit ook in node te testen is. Teksten staan in i18n.js onder card.*, opt.*, cond.*, src.*.
const Cards = (() => {
  const PORTS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const COLORS = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6'];
  const CATS = ['event', 'move', 'motor', 'light', 'sound', 'control', 'sensor', 'var'];
  const ICONS = { event: '\u{1F6A9}', move: '\u{1F697}', motor: '⚙️', light: '\u{1F4A1}', sound: '\u{1F3B5}', control: '\u{1F501}', sensor: '\u{1F441}️', var: '\u{1F4E6}' };

  // Parameters: num = getal of andere bron (variabele, toeval, sensor), choice = vaste keuzes.
  const num = (k, v, extra) => Object.assign({ k, type: 'num', def: v }, extra || {});
  const choice = (k, opts, extra) => Object.assign({ k, type: 'choice', opts, def: opts[0] }, extra || {});
  const P = {
    port: (k, def) => ({ k, type: 'port', def: def || 'A' }),
    dir: choice('dir', ['fw', 'bw']),
    unit: choice('unit', ['cm', 'rot', 'deg', 'sec']),
    munit: choice('unit', ['rot', 'deg', 'sec']),
    rot: choice('dir', ['cw', 'ccw']),
    cond: { k: 'c', type: 'cond' },
    img: { k: 'img', type: 'img', def: '0000009090000009000909990' },
    text: (k, def) => ({ k, type: 'text', def }),
    v: { k: 'v', type: 'var' },
    msg: { k: 'm', type: 'msg', def: 'go' },
  };
  const T = {};
  const def = (id, cat, kind, params) => { T[id] = { id, cat, kind, params }; };
  // Gebeurtenissen: de eerste kaart van een spoor.
  def('start', 'event', 'hat', []);
  def('when', 'event', 'hat', [P.cond]);
  def('gesture', 'event', 'hat', [choice('g', ['tap', 'dtap', 'shake', 'fall'])]);
  def('onMsg', 'event', 'hat', [P.msg]);
  def('send', 'event', 'cmd', [P.msg]);
  def('sendWait', 'event', 'cmd', [P.msg]);
  // Rijden met twee motoren.
  def('moveFor', 'move', 'cmd', [P.dir, num('n', 10), P.unit]);
  def('steerFor', 'move', 'cmd', [num('s', 30, { min: -100, max: 100 }), num('n', 10), P.unit]);
  def('tankFor', 'move', 'cmd', [num('l', 50, { min: -100, max: 100 }), num('r', 50, { min: -100, max: 100 }), num('n', 10), P.unit]);
  def('moveStart', 'move', 'cmd', [P.dir]);
  def('steerStart', 'move', 'cmd', [num('s', 30, { min: -100, max: 100 })]);
  def('tankStart', 'move', 'cmd', [num('l', 50, { min: -100, max: 100 }), num('r', 50, { min: -100, max: 100 })]);
  def('moveStop', 'move', 'cmd', []);
  def('moveSpeed', 'move', 'cmd', [num('n', 50, { min: 0, max: 100 })]);
  def('turn', 'move', 'cmd', [choice('side', ['right', 'left']), num('n', 90)]);
  def('movePorts', 'move', 'cmd', [P.port('l', 'A'), P.port('r', 'B')]);
  def('wheel', 'move', 'cmd', [num('n', 17.5)]);
  // Losse motoren.
  def('motorFor', 'motor', 'cmd', [P.port('p'), P.rot, num('n', 1), P.munit]);
  def('motorGoto', 'motor', 'cmd', [P.port('p'), num('n', 0), choice('way', ['s', 'cw', 'ccw'])]);
  def('motorStart', 'motor', 'cmd', [P.port('p'), P.rot]);
  def('motorStop', 'motor', 'cmd', [P.port('p')]);
  def('motorSpeed', 'motor', 'cmd', [P.port('p'), num('n', 75, { min: 0, max: 100 })]);
  def('motorStopMode', 'motor', 'cmd', [P.port('p'), choice('mode', ['brake', 'coast', 'hold'])]);
  def('motorReset', 'motor', 'cmd', [P.port('p')]);
  // Lichtscherm en lampjes.
  def('imgFor', 'light', 'cmd', [P.img, num('n', 2)]);
  def('img', 'light', 'cmd', [P.img]);
  def('write', 'light', 'cmd', [P.text('t', 'Hi')]);
  def('writeVal', 'light', 'cmd', [num('n', 42)]);
  def('lightOff', 'light', 'cmd', []);
  def('pixel', 'light', 'cmd', [num('x', 3, { min: 1, max: 5 }), num('y', 3, { min: 1, max: 5 }), num('n', 100, { min: 0, max: 100 })]);
  def('bright', 'light', 'cmd', [num('n', 100, { min: 0, max: 100 })]);
  def('orient', 'light', 'cmd', [choice('o', ['up', 'right', 'down', 'left'])]);
  def('btnLight', 'light', 'cmd', [{ k: 'c', type: 'color', def: 6 }]);
  def('eyes', 'light', 'cmd', [P.port('p'), num('a', 100), num('b', 100), num('c', 100), num('d', 100)]);
  // Geluid.
  def('songWait', 'sound', 'cmd', [{ k: 'song', type: 'song', def: 'birthday' }]);
  def('songStart', 'sound', 'cmd', [{ k: 'song', type: 'song', def: 'birthday' }]);
  def('beepFor', 'sound', 'cmd', [{ k: 'note', type: 'note', def: 'C5' }, num('n', 0.5)]);
  def('beepStart', 'sound', 'cmd', [{ k: 'note', type: 'note', def: 'C5' }]);
  def('soundStop', 'sound', 'cmd', []);
  def('vol', 'sound', 'cmd', [num('n', 80, { min: 0, max: 100 })]);
  def('volBy', 'sound', 'cmd', [num('n', -10)]);
  def('pitch', 'sound', 'cmd', [num('n', 0)]);
  def('mood', 'sound', 'cmd', [{ k: 'mood', type: 'mood', def: 'happy' }]);
  def('say', 'sound', 'cmd', [P.text('t', 'Hallo!')]);
  // Besturing. begin/else/end vormen blokken; de editor laat ze inspringen.
  def('wait', 'control', 'cmd', [num('n', 1)]);
  def('waitUntil', 'control', 'cmd', [P.cond]);
  def('repeat', 'control', 'begin', [num('n', 4)]);
  def('forever', 'control', 'begin', []);
  def('repeatUntil', 'control', 'begin', [P.cond]);
  def('if', 'control', 'begin', [P.cond]);
  def('else', 'control', 'else', []);
  def('end', 'control', 'end', []);
  def('stop', 'control', 'cmd', [choice('w', ['all', 'this', 'others'])]);
  // Sensoren (hun waarden en voorwaarden zitten in de vakjes van andere kaarten).
  def('resetTimer', 'sensor', 'cmd', []);
  def('resetYaw', 'sensor', 'cmd', []);
  // Variabelen.
  def('setVar', 'var', 'cmd', [P.v, num('n', 0)]);
  def('changeVar', 'var', 'cmd', [P.v, num('n', 1)]);
  def('mathVar', 'var', 'cmd', [P.v, num('a', 1), choice('op', ['+', '-', '*', '/', '%']), num('b', 1)]);

  // Waarden die in een getal-vakje kunnen in plaats van een getal.
  const SENSORS = ['dist', 'force', 'light', 'color', 'timer', 'yaw', 'pitch', 'roll'].concat(PORTS.map((p) => 'pos' + p));
  // Voorwaarden voor als/wacht tot/herhaal tot/wanneer.
  const COND = {
    dist: [choice('op', ['<', '>']), num('n', 10)],
    color: [{ k: 'p', type: 'portAny', def: 'any' }, { k: 'col', type: 'color', def: 9 }],
    force: [choice('st', ['pressed', 'released', 'hard'])],
    tilt: [choice('dir', ['tfw', 'tbw', 'tleft', 'tright', 'level'])],
    face: [choice('f', ['ftop', 'ffront', 'fright', 'fbottom', 'fback', 'fleft'])],
    btn: [choice('b', ['L', 'R'])],
    timer: [choice('op', ['>', '<']), num('n', 5)],
    motor: [P.port('p'), choice('op', ['>', '<']), num('n', 360)],
    cmp: [num('a', 0), choice('op', ['<', '=', '>']), num('b', 0)],
  };
  const GESTURES = { tap: 0, dtap: 1, shake: 2, fall: 3 };
  const FACE_UP = ['ftop', 'ffront', 'fright', 'fbottom', 'fback', 'fleft'];

  // Kant-en-klare plaatjes voor het lichtscherm (eigen ontwerpen), 25 helderheden 0-9.
  const IMAGES = {
    smile: '0000009090000009000909990', sad: '0000009090000000999090009', wow: '0909000000009000909000900',
    heart: '0909099999999990999000900', yes: '0000000009000909090000900', no: '9000909090009000909090009',
    up: '0090009990909090090000900', down: '0090000900909090999000900', left: '0090009000999990900000900',
    right: '0090000090999990009000900', square: '9999990009900099000999999', dot: '0000000000009000000000000',
    note: '0099000909009009990099900', ghost: '0999099999909099999990909',
  };

  // Lettertje van 3 bij 5 voor tekst op het lichtscherm: per teken 5 rijen van 3 bits (4 = links).
  const FONT = {
    A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4],
    G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
    M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5],
    S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
    Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7], 0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6],
    4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 6, 5, 2], 7: [7, 1, 2, 2, 2], 8: [2, 5, 2, 5, 2], 9: [2, 5, 3, 1, 6],
    ' ': [0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 2], ',': [0, 0, 0, 2, 4], '!': [2, 2, 2, 0, 2], '?': [6, 1, 2, 0, 2],
    '-': [0, 0, 7, 0, 0], '+': [0, 2, 7, 2, 0], ':': [0, 2, 0, 2, 0], "'": [2, 2, 0, 0, 0], '=': [0, 7, 0, 7, 0],
  };
  // Kolommen (elk 5 helderheden van boven naar beneden) om tekst door het scherm te laten schuiven.
  function textColumns(text) {
    const cols = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    const plain = String(text).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 60);
    for (const ch of plain) {
      const g = FONT[ch] || FONT['?'];
      for (const bit of [4, 2, 1]) cols.push(g.map((row) => (row & bit ? 9 : 0)));
      cols.push([0, 0, 0, 0, 0]);
    }
    for (let i = 0; i < 5; i++) cols.push([0, 0, 0, 0, 0]);
    return cols;
  }

  /* ---------- nieuwe kaarten en opschonen ---------- */
  const isNum = (x) => typeof x === 'number' && isFinite(x);
  function cleanVal(v, spec) {
    if (isNum(v)) return { k: 'n', v };
    if (!v || typeof v !== 'object') return { k: 'n', v: spec.def };
    if (v.k === 'n') return { k: 'n', v: isNum(+v.v) ? +v.v : spec.def };
    if (v.k === 'r') return { k: 'r', a: isNum(+v.a) ? +v.a : 1, b: isNum(+v.b) ? +v.b : 10 };
    if (v.k === 'v') return { k: 'v', v: String(v.v || '').slice(0, 20) };
    if (v.k === 's' && SENSORS.includes(v.v)) return { k: 's', v: v.v };
    return { k: 'n', v: spec.def };
  }
  function cleanParam(spec, v) {
    switch (spec.type) {
      case 'num': return cleanVal(v, spec);
      case 'choice': return spec.opts.includes(v) ? v : spec.def;
      case 'port': return PORTS.includes(v) ? v : spec.def;
      case 'portAny': return v === 'any' || PORTS.includes(v) ? v : 'any';
      case 'color': return COLORS.includes(v) ? v : spec.def;
      case 'img': return typeof v === 'string' && /^[0-9]{25}$/.test(v) ? v : spec.def;
      case 'text': return typeof v === 'string' ? v.slice(0, 60) : spec.def;
      case 'note': return NOTES.includes(v) ? v : spec.def;
      case 'var': return typeof v === 'string' ? v.slice(0, 20) : '';
      case 'msg': return typeof v === 'string' && v.trim() ? v.trim().slice(0, 20) : spec.def;
      case 'cond': return cleanCond(v);
      default: return typeof v === 'string' ? v.slice(0, 30) : spec.def;   // song, mood: de pagina kent de lijst
    }
  }
  function cleanCond(c) {
    c = c && typeof c === 'object' && COND[c.k] ? c : { k: 'dist' };
    const out = { k: c.k, not: c.not === true };
    for (const spec of COND[c.k]) out[spec.k] = cleanParam(spec, c[spec.k]);
    return out;
  }
  function newCard(type, vars) {
    const t = T[type], card = { t: type, p: {} };
    for (const spec of t.params) {
      if (spec.type === 'cond') card.p[spec.k] = cleanCond(null);
      else if (spec.type === 'var') card.p[spec.k] = (vars && vars[0]) || '';
      else card.p[spec.k] = cleanParam(spec, undefined);
    }
    return card;
  }
  function cleanCard(c) {
    if (!c || !T[c.t]) return null;
    const out = { t: c.t, p: {} }, p = c.p && typeof c.p === 'object' ? c.p : {};
    for (const spec of T[c.t].params) out.p[spec.k] = cleanParam(spec, p[spec.k]);
    return out;
  }
  function cleanProgram(raw, fallbackName) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const vars = (Array.isArray(r.vars) ? r.vars : []).filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim().slice(0, 20)).slice(0, 20);
    const stacks = (Array.isArray(r.stacks) ? r.stacks : []).slice(0, 12).map((s) => {
      const cards = (Array.isArray(s) ? s : (s && s.cards) || []).slice(0, 200).map(cleanCard).filter(Boolean);
      if (!cards.length || T[cards[0].t].kind !== 'hat') cards.unshift(newCard('start'));
      return cards.filter((c, i) => i === 0 || T[c.t].kind !== 'hat');
    });
    return { id: typeof r.id === 'string' && r.id ? r.id.slice(0, 12) : Math.random().toString(36).slice(2, 9),
      name: String(r.name || fallbackName || '').slice(0, 30), vars, stacks: stacks.length ? stacks : [[newCard('start')]] };
  }
  // Inspringing per kaart (voor de editor) uit begin/anders/einde.
  function depths(cards) {
    const out = [];
    let d = 0;
    cards.forEach((c, i) => {
      const k = T[c.t].kind;
      if (i === 0) { out.push(0); return; }
      if (k === 'end' || k === 'else') d = Math.max(0, d - 1);
      out.push(d + 1);
      if (k === 'begin' || k === 'else') d++;
    });
    return out;
  }
  // Van een plat spoor een boom maken: begin...anders...einde worden blokken met body en elseBody.
  function compile(cards) {
    const root = { body: [] }, stack = [root];
    cards.forEach((c, i) => {
      if (i === 0) return;
      const k = T[c.t].kind, top = stack[stack.length - 1];
      if (k === 'begin') { const node = { c, i, body: [], elseBody: null, inElse: false }; (top.inElse ? top.elseBody : top.body).push(node); stack.push(node); }
      else if (k === 'else') { if (stack.length > 1 && top.c.t === 'if' && !top.inElse) { top.inElse = true; top.elseBody = []; top.elseAt = i; } }
      else if (k === 'end') { if (stack.length > 1) stack.pop(); }
      else (top.inElse ? top.elseBody : top.body).push({ c, i });
    });
    return root.body;
  }

  /* ---------- uitvoeren ---------- */
  const HALT = { halt: true };
  const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // Sturen zoals op een robotkar: 0 rechtdoor, 50 draaien om het binnenste wiel, 100 ter plekke.
  function steer(s, speed) {
    s = clamp(s, -100, 100);
    return s >= 0 ? [speed, speed * (1 - s / 50)] : [speed * (1 + s / 50), speed];
  }

  class Runner {
    constructor(prog, io) {
      this.prog = prog; this.io = io; this.trees = prog.stacks.map(compile);
      this.threads = new Map(); this.vars = {}; prog.vars.forEach((v) => { this.vars[v] = 0; });
      this.mv = { l: io.ports().l, r: io.ports().r, speed: 50, wheel: 17.5 };
      this.mspeed = {}; this.mrun = {}; this.posZero = {}; this.vol = 80; this.pitch = 0;
      this.fb = new Array(25).fill(0); this.bright = 100; this.orient = 'up';
      this.t0 = io.now(); this.yaw = 0; this.yawRaw = null; this.yaw0 = 0; this.deci = false;
      this.whenPrev = {}; this.running = false;
    }
    start() {
      this.running = true;
      this.prog.stacks.forEach((s, si) => { if (s[0].t === 'start') this.launch(si); });
      this.checkDone();
    }
    stop() {
      if (!this.running) return;
      this.running = false;
      for (const th of this.threads.values()) th.dead = true;
      this.threads.clear();
      this.io.active(-1, -1);
      this.io.stopAll();
      this.io.done();
    }
    // Programma is klaar als er niets meer loopt en geen spoor op een gebeurtenis wacht.
    checkDone() {
      if (!this.running || this.threads.size) return;
      if (this.prog.stacks.some((s) => s[0].t !== 'start')) return;
      this.running = false; this.io.active(-1, -1); this.io.stopAll(); this.io.done();
    }
    launch(si) {
      const old = this.threads.get(si);
      if (old) old.dead = true;
      const th = { si, dead: false };
      this.threads.set(si, th);
      th.promise = this.list(this.trees[si], th).catch((e) => { if (e !== HALT) this.io.warn('error', String(e && e.message || e)); })
        .then(() => { if (this.threads.get(si) === th) { this.threads.delete(si); this.io.active(si, -1); this.checkDone(); } });
      return th.promise;
    }
    // Elke 50 ms door de pagina aangeroepen: gieren bijhouden en 'wanneer'-sporen starten.
    tick() {
      if (!this.running) return;
      const imu = this.io.data().imu;
      if (imu) {
        if (Math.abs(imu.yaw) > 400 || Math.abs(imu.pitch) > 400 || Math.abs(imu.roll) > 400) this.deci = true;
        const raw = this.deci ? imu.yaw / 10 : imu.yaw;
        if (this.yawRaw !== null) this.yaw += wrap180(raw - this.yawRaw);
        this.yawRaw = raw;
      }
      this.prog.stacks.forEach((s, si) => {
        if (s[0].t !== 'when') return;
        const now = this.cond(s[0].p.c);
        if (now && !this.whenPrev[si] && !this.threads.has(si)) this.launch(si);
        this.whenPrev[si] = now;
      });
    }
    fire(kind, arg) {
      if (!this.running) return [];
      const started = [];
      this.prog.stacks.forEach((s, si) => {
        if ((kind === 'gesture' && s[0].t === 'gesture' && GESTURES[s[0].p.g] === arg) || (kind === 'msg' && s[0].t === 'onMsg' && s[0].p.m === arg)) started.push(this.launch(si));
      });
      return started;
    }
    async sleep(th, ms) {
      await this.io.sleep(Math.max(0, ms));
      if (th.dead || !this.running) throw HALT;
    }
    async list(nodes, th) {
      for (const node of nodes || []) {
        if (th.dead) throw HALT;
        await this.node(node, th);
      }
    }
    async node(n, th) {
      const c = n.c, p = c.p;
      this.io.active(th.si, n.i);
      switch (c.t) {
        case 'repeat': { const times = Math.round(this.val(p.n)); for (let k = 0; k < times; k++) { await this.list(n.body, th); await this.sleep(th, 0); } return; }
        case 'forever': for (;;) { await this.list(n.body, th); await this.sleep(th, 0); }
        case 'repeatUntil': while (!this.cond(p.c)) { await this.list(n.body, th); await this.sleep(th, 0); } return;
        case 'if': if (this.cond(p.c)) await this.list(n.body, th); else { if (n.elseAt !== undefined) this.io.active(th.si, n.elseAt); await this.list(n.elseBody, th); } return;
        default: await this.cmd(c, th);
      }
    }
    /* waarden en voorwaarden */
    sensor(id) {
      const d = this.io.data();
      if (id === 'dist') return d.dist === null || d.dist === undefined || d.dist < 0 ? -1 : Math.round(d.dist / 10);
      if (id === 'force') return d.force ? d.force.v : 0;
      if (id === 'light') return d.light === null || d.light === undefined ? 0 : d.light;
      if (id === 'color') return d.color === null || d.color === undefined ? -1 : d.color;
      if (id === 'timer') return Math.round((this.io.now() - this.t0) / 100) / 10;
      if (id === 'yaw') return Math.round(this.yaw - this.yaw0);
      if (id === 'pitch' || id === 'roll') { const v = d.imu ? d.imu[id] : 0; return Math.round(this.deci ? v / 10 : v); }
      if (id.startsWith('pos')) { const port = id[3], m = d.motors[port]; return m ? m.pos - (this.posZero[port] || 0) : 0; }
      return 0;
    }
    val(v) {
      if (!v) return 0;
      if (v.k === 'n') return +v.v || 0;
      if (v.k === 'v') return this.vars[v.v] || 0;
      if (v.k === 's') return this.sensor(v.v);
      if (v.k === 'r') {
        const lo = Math.min(v.a, v.b), hi = Math.max(v.a, v.b);
        return Number.isInteger(lo) && Number.isInteger(hi) ? lo + Math.floor(this.io.random() * (hi - lo + 1)) : lo + this.io.random() * (hi - lo);
      }
      return 0;
    }
    cond(c) {
      const d = this.io.data(), cmp = (a, op, b) => (op === '<' ? a < b : op === '>' ? a > b : Math.abs(a - b) < 1e-9);
      let r = false;
      switch (c.k) {
        case 'dist': { const cm = this.sensor('dist'); r = cm < 0 ? c.op === '>' : cmp(cm, c.op, this.val(c.n)); break; }
        case 'color': r = c.p === 'any' ? Object.values(d.colors).includes(c.col) : d.colors[c.p] === c.col; break;
        case 'force': r = c.st === 'pressed' ? !!(d.force && d.force.pressed) : c.st === 'released' ? !(d.force && d.force.pressed) : !!(d.force && d.force.v >= 70); break;
        case 'tilt': {
          const pt = this.sensor('pitch'), rl = this.sensor('roll');
          r = c.dir === 'tfw' ? pt < -20 : c.dir === 'tbw' ? pt > 20 : c.dir === 'tleft' ? rl < -20 : c.dir === 'tright' ? rl > 20 : Math.abs(pt) < 10 && Math.abs(rl) < 10;
          break;
        }
        case 'face': r = !!d.imu && FACE_UP[d.imu.face] === c.f; break;
        case 'btn': r = !!d.btn[c.b]; break;
        case 'timer': r = cmp(this.sensor('timer'), c.op, this.val(c.n)); break;
        case 'motor': r = cmp(this.sensor('pos' + c.p), c.op, this.val(c.n)); break;
        case 'cmp': r = cmp(this.val(c.a), c.op, this.val(c.b)); break;
      }
      return c.not ? !r : r;
    }
    /* lichtscherm */
    flush() {
      const out = new Array(25).fill(0);
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
        let sx = x, sy = y;
        if (this.orient === 'right') { sx = y; sy = 4 - x; } else if (this.orient === 'down') { sx = 4 - x; sy = 4 - y; } else if (this.orient === 'left') { sx = 4 - y; sy = x; }
        out[y * 5 + x] = this.fb[sy * 5 + sx];
      }
      this.io.img(out.map((v) => Math.round(clamp((v * this.bright) / 100, 0, 100) / 11.12)).join(''));
    }
    setImg(img) { for (let i = 0; i < 25; i++) this.fb[i] = img.charCodeAt(i) - 48 === 9 ? 100 : (img.charCodeAt(i) - 48) * 11; this.flush(); }
    async scroll(text, th) {
      const cols = textColumns(text);
      for (let s = 0; s + 5 <= cols.length; s++) {
        for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) this.fb[y * 5 + x] = cols[s + x][y] === 9 ? 100 : 0;
        this.flush();
        await this.sleep(th, 140);
      }
    }
    /* geluid */
    tone(f) { return Math.round(f * Math.pow(2, this.pitch / 12)); }
    async play(notes, th, wait) {
      const shifted = notes.map(([f, ms]) => [f ? clamp(this.tone(f), 100, 10000) : 0, ms]);
      this.io.tune(shifted);
      if (wait) await this.sleep(th, shifted.reduce((a, n) => a + n[1], 0));
    }
    /* bewegen */
    amountDeg(n, unit) { return unit === 'rot' ? n * 360 : unit === 'cm' ? (n / (this.mv.wheel || 17.5)) * 360 : n; }
    async drivePair(l, r, n, unit, th) {
      if (unit === 'sec') { this.io.drive(l, r); await this.sleep(th, n * 1000); this.io.drive(0, 0); return; }
      const outer = Math.max(Math.abs(l), Math.abs(r)), deg = this.amountDeg(n, unit);
      if (!outer || !deg) return;
      this.io.drive(0, 0);
      await this.io.moveDeg(Math.round((deg * l) / outer), Math.abs(l), Math.round((deg * r) / outer), Math.abs(r));
      if (th.dead || !this.running) throw HALT;
    }
    async turn(side, n, th) {
      if (!this.io.data().imu) { this.io.warn('noImu'); return; }
      const s = Math.max(15, Math.min(this.mv.speed, 40)), start = this.yaw, until = this.io.now() + Math.max(3000, n * 60);
      this.io.drive(side === 'right' ? s : -s, side === 'right' ? -s : s);
      while (Math.abs(this.yaw - start) < Math.max(0, n - 4) && this.io.now() < until) await this.sleep(th, 20);
      this.io.drive(0, 0);
    }
    mspd(port) { return this.mspeed[port] === undefined ? 75 : this.mspeed[port]; }
    async cmd(c, th) {
      const p = c.p, io = this.io, v = (k) => this.val(p[k]);
      switch (c.t) {
        case 'send': this.fire('msg', p.m); return;
        case 'sendWait': await Promise.all(this.fire('msg', p.m)); if (th.dead) throw HALT; return;
        case 'moveFor': { const s = this.mv.speed * (p.dir === 'bw' ? -1 : 1); await this.drivePair(s, s, v('n'), p.unit, th); return; }
        case 'steerFor': { const [l, r] = steer(v('s'), this.mv.speed); await this.drivePair(l, r, v('n'), p.unit, th); return; }
        case 'tankFor': await this.drivePair(clamp(v('l'), -100, 100), clamp(v('r'), -100, 100), v('n'), p.unit, th); return;
        case 'moveStart': { const s = this.mv.speed * (p.dir === 'bw' ? -1 : 1); io.drive(s, s); return; }
        case 'steerStart': { const [l, r] = steer(v('s'), this.mv.speed); io.drive(l, r); return; }
        case 'tankStart': io.drive(clamp(v('l'), -100, 100), clamp(v('r'), -100, 100)); return;
        case 'moveStop': io.drive(0, 0); return;
        case 'moveSpeed': this.mv.speed = clamp(v('n'), 0, 100); return;
        case 'turn': await this.turn(p.side, Math.abs(v('n')), th); return;
        case 'movePorts': io.drive(0, 0); this.mv.l = p.l; this.mv.r = p.r; io.setPorts(p.l, p.r); return;
        case 'wheel': this.mv.wheel = Math.max(1, v('n')); return;
        case 'motorFor': {
          const sgn = p.dir === 'ccw' ? -1 : 1, spd = this.mspd(p.p), n = v('n');
          if (p.unit === 'sec') { io.motor(p.p, sgn * spd); await this.sleep(th, n * 1000); io.motor(p.p, 0); return; }
          const deg = Math.round(sgn * (p.unit === 'rot' ? n * 360 : n));
          if (!deg || !spd) return;
          io.motor(p.p, 0); delete this.mrun[p.p];
          await io.motorDeg(p.p, deg, spd);
          if (th.dead || !this.running) throw HALT;
          return;
        }
        case 'motorGoto': io.motor(p.p, 0); delete this.mrun[p.p]; await io.motorGoto(p.p, Math.round(v('n')), this.mspd(p.p), p.way); if (th.dead || !this.running) throw HALT; return;
        case 'motorStart': this.mrun[p.p] = p.dir === 'ccw' ? -1 : 1; io.motor(p.p, this.mrun[p.p] * this.mspd(p.p)); return;
        case 'motorStop': delete this.mrun[p.p]; io.motor(p.p, 0); return;
        case 'motorSpeed': this.mspeed[p.p] = clamp(v('n'), 0, 100); if (this.mrun[p.p]) io.motor(p.p, this.mrun[p.p] * this.mspd(p.p)); return;
        case 'motorStopMode': io.send('smode ' + p.p + ' ' + { coast: 0, brake: 1, hold: 2 }[p.mode]); return;
        case 'motorReset': { const m = io.data().motors[p.p]; this.posZero[p.p] = m ? m.pos : 0; return; }
        case 'imgFor': this.setImg(p.img); await this.sleep(th, v('n') * 1000); this.fb.fill(0); this.flush(); return;
        case 'img': this.setImg(p.img); return;
        case 'write': await this.scroll(p.t, th); return;
        case 'writeVal': { const x = v('n'); await this.scroll(String(Math.round(x * 10) / 10), th); return; }
        case 'lightOff': this.fb.fill(0); this.flush(); return;
        case 'pixel': { const x = Math.round(clamp(v('x'), 1, 5)) - 1, y = Math.round(clamp(v('y'), 1, 5)) - 1; this.fb[y * 5 + x] = clamp(v('n'), 0, 100); this.flush(); return; }
        case 'bright': this.bright = clamp(v('n'), 0, 100); this.flush(); return;
        case 'orient': this.orient = p.o; this.flush(); return;
        case 'btnLight': io.send('light ' + p.c); return;
        case 'eyes': io.send('eyes ' + p.p + ' ' + ['a', 'b', 'c', 'd'].map((k) => Math.round(clamp(v(k), 0, 100))).join(' ')); return;
        case 'songWait': await this.play(io.song(p.song), th, true); return;
        case 'songStart': await this.play(io.song(p.song), th, false); return;
        case 'beepFor': {
          const f = io.freq(p.note), ms = Math.max(10, Math.round(v('n') * 1000)), notes = [];
          for (let left = ms; left > 0; left -= 3000) notes.push([f, Math.min(3000, left)]);
          await this.play(notes, th, true); return;
        }
        case 'beepStart': { const f = io.freq(p.note); await this.play(new Array(20).fill([f, 3000]), th, false); return; }
        case 'soundStop': io.send('hush'); return;
        case 'vol': this.vol = clamp(v('n'), 0, 100); io.send('vol ' + Math.round(this.vol)); return;
        case 'volBy': this.vol = clamp(this.vol + v('n'), 0, 100); io.send('vol ' + Math.round(this.vol)); return;
        case 'pitch': this.pitch = clamp(v('n'), -24, 24); return;
        case 'mood': await this.sleep(th, io.mood(p.mood)); return;
        case 'say': await this.sleep(th, io.talk(p.t)); return;
        case 'wait': await this.sleep(th, v('n') * 1000); return;
        case 'waitUntil': while (!this.cond(p.c)) await this.sleep(th, 20); return;
        case 'stop':
          if (p.w === 'all') { this.stop(); throw HALT; }
          if (p.w === 'this') throw HALT;
          for (const [si, other] of this.threads) if (other !== th) { other.dead = true; this.threads.delete(si); this.io.active(si, -1); }
          return;
        case 'resetTimer': this.t0 = io.now(); return;
        case 'resetYaw': this.yaw0 = this.yaw; return;
        case 'setVar': if (p.v) this.vars[p.v] = v('n'); return;
        case 'changeVar': if (p.v) this.vars[p.v] = (this.vars[p.v] || 0) + v('n'); return;
        case 'mathVar': {
          if (!p.v) return;
          const a = v('a'), b = v('b');
          this.vars[p.v] = p.op === '+' ? a + b : p.op === '-' ? a - b : p.op === '*' ? a * b : p.op === '/' ? (b ? a / b : 0) : (b ? ((a % b) + b) % b : 0);
          return;
        }
      }
    }
  }

  return { PORTS, COLORS, NOTES, CATS, ICONS, TYPES: T, COND, SENSORS, IMAGES, FONT, newCard, cleanCard, cleanCond, cleanProgram, depths, compile, steer, textColumns, Runner };
})();
if (typeof module !== 'undefined') module.exports = Cards;
