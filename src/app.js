(() => {
  const $ = (id) => document.getElementById(id);
  const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const PORTS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const HUB_VERSION = '5';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ---------- opslag: algemene instellingen + profielen per robot ---------- */
  const KEY = 'hubremote3';
  const uid = () => Math.random().toString(36).slice(2, 9);
  const newAux = () => ({ port: '-', name: '', speed: 60, mode: 'hold', travel: 90 });
  const newProfile = (name) => ({ id: uid(), name, left: 'A', right: 'B', invL: true, invR: false, speed: 60, turn: 60, trim: 0, userPorts: false,
    aux: [newAux(), newAux()], guard: false, guardCm: 20 });
  const G = { lang: 'auto', theme: 'light', sound: true, haptic: true, slot: 19, mode: 'joy', active: '', profiles: [],
    hubVol: 60, voice: 'normal', react: true, song: [], path: [], programs: [], progActive: '' };
  const curLang = () => (G.lang === 'nl' || G.lang === 'en') ? G.lang : ((navigator.language || 'en').toLowerCase().startsWith('nl') ? 'nl' : 'en');
  const t = (k, ...a) => {
    let s = (I18N[curLang()] || I18N.en)[k];
    if (s === undefined) s = I18N.en[k] !== undefined ? I18N.en[k] : k;
    return s.replace(/\{(\d)\}/g, (_, i) => (a[i] !== undefined ? a[i] : ''));
  };
  const isPort = (p) => PORTS.includes(p);
  const num = (v, lo, hi, def) => (typeof v === 'number' && isFinite(v) ? clamp(Math.round(v), lo, hi) : def);
  // Maakt van willekeurige (opgeslagen of gedeelde) gegevens een geldig profiel.
  function cleanProfile(p) {
    const d = newProfile('');
    p = p && typeof p === 'object' ? p : {};
    const aux = Array.isArray(p.aux) ? p.aux : [];
    return {
      id: typeof p.id === 'string' && p.id ? p.id : d.id,
      name: String(p.name || '').slice(0, 30).trim() || t('profile.default'),
      left: isPort(p.left) ? p.left : 'A', right: isPort(p.right) ? p.right : 'B', invL: p.invL !== false, invR: p.invR === true,
      speed: num(p.speed, 10, 100, 60), turn: num(p.turn, 20, 100, 60), trim: num(p.trim, -20, 20, 0), userPorts: p.userPorts === true,
      guard: p.guard === true, guardCm: num(p.guardCm, 5, 60, 20),
      aux: [0, 1].map((i) => { const a = aux[i] && typeof aux[i] === 'object' ? aux[i] : {};
        return { port: isPort(a.port) ? a.port : '-', name: String(a.name || '').slice(0, 20), speed: num(a.speed, 10, 100, 60), mode: ['grip', 'toggle'].includes(a.mode) ? a.mode : 'hold', travel: num(a.travel, -720, 720, 90) }; }),
    };
  }
  // Lijst van getallenparen (noten of routestappen) uit opslag controleren.
  const MAX_PATH = 2400; // 2 minuten in stappen van 50 ms
  function cleanPairs(v, max, fa, fb) {
    return (Array.isArray(v) ? v : []).slice(0, max).filter((x) => Array.isArray(x) && x.length === 2).map((x) => [fa(x[0]), fb(x[1])]);
  }
  (function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (raw && typeof raw === 'object') {
      if (raw.lang === 'nl' || raw.lang === 'en') G.lang = raw.lang;
      if (raw.theme === 'dark') G.theme = 'dark';
      G.sound = raw.sound !== false; G.haptic = raw.haptic !== false; G.slot = num(raw.slot, 0, 19, 19);
      G.mode = ['joy', 'tank', 'tilt'].includes(raw.mode) ? raw.mode : 'joy';
      G.hubVol = num(raw.hubVol, 0, 100, 60); G.voice = ['high', 'low'].includes(raw.voice) ? raw.voice : 'normal'; G.react = raw.react !== false;
      G.song = cleanPairs(raw.song, 200, (f) => (f === 0 ? 0 : num(f, 100, 10000, 0)), (ms) => num(ms, 50, 2000, 300));
      G.path = cleanPairs(raw.path, MAX_PATH, (v) => num(v, -100, 100, 0), (v) => num(v, -100, 100, 0));
      // Programma's zijn werkbladen met blokken; programma's van kaartjes (versie 5.0) worden omgezet.
      G.programs = (Array.isArray(raw.programs) ? raw.programs : []).slice(0, 30).filter((x) => x && typeof x === 'object').map((x) => ({
        id: typeof x.id === 'string' && x.id ? x.id.slice(0, 12) : Math.random().toString(36).slice(2, 9), name: String(x.name || t('code.default')).slice(0, 30),
        ws: x.ws && typeof x.ws === 'object' ? x.ws : Cards.toBlocks(Cards.cleanProgram(x)) }));
      G.progActive = typeof raw.progActive === 'string' ? raw.progActive : '';
      G.profiles = (Array.isArray(raw.profiles) ? raw.profiles : []).map(cleanProfile);
      G.active = raw.active;
    } else {
      // Overnemen uit versie 2 (één platte set instellingen).
      let old = null;
      try { old = JSON.parse(localStorage.getItem('hubremote') || 'null'); } catch (e) {}
      if (old && typeof old === 'object') {
        G.sound = old.sound !== false; G.haptic = old.haptic !== false; G.slot = num(old.slot, 0, 19, 19);
        const p = cleanProfile(old);
        p.aux[0].port = isPort(old.aux1) ? old.aux1 : '-'; p.aux[1].port = isPort(old.aux2) ? old.aux2 : '-';
        p.aux[0].speed = p.aux[1].speed = p.speed;
        G.profiles = [p];
      }
    }
    if (!G.profiles.length) G.profiles = [newProfile(t('profile.default'))];
    if (!G.profiles.some((p) => p.id === G.active)) G.active = G.profiles[0].id;
    if (!G.programs.length) {
      // Voorbeeldprogramma om mee te beginnen.
      const n = (v) => ({ k: 'n', v }), card = (tp, p) => Object.assign(Cards.newCard(tp), p ? { p: Object.assign(Cards.newCard(tp).p, p) } : {});
      const ex = Cards.cleanProgram({ stacks: [[card('start'), card('img', { img: Cards.IMAGES.smile }), card('moveFor', { n: n(10) }),
        card('mood', { mood: 'happy' }), card('moveFor', { dir: 'bw', n: n(10) }), card('write', { t: 'Hi!' })]] });
      G.programs = [{ id: Math.random().toString(36).slice(2, 9), name: t('code.default'), ws: Cards.toBlocks(ex) }];
    }
    if (!G.programs.some((p) => p.id === G.progActive)) G.progActive = G.programs[0].id;
  })();
  let S = G.profiles.find((p) => p.id === G.active);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) {} };

  /* ---------- geluid, trillen, scherm aan ---------- */
  let actx = null;
  function tone(freq, ms, type = 'sine', vol = 0.05, delay = 0) {
    if (!G.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
      o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + ms / 1000 + 0.02);
    } catch (e) {}
  }
  const sfx = {
    tick: () => tone(720, 45, 'triangle', 0.035),
    grab: () => tone(420, 60, 'triangle', 0.04),
    tab: () => tone(560, 50, 'triangle', 0.03),
    link: () => { tone(523, 110); tone(784, 140, 'sine', 0.05, 0.1); },
    ready: () => { tone(784, 100); tone(1047, 180, 'sine', 0.05, 0.1); },
    lost: () => { tone(392, 120); tone(262, 200, 'sine', 0.05, 0.11); },
    stop: () => tone(196, 140, 'square', 0.03),
    err: () => tone(150, 220, 'sawtooth', 0.035),
    low: () => { tone(330, 120, 'triangle'); tone(247, 220, 'triangle', 0.05, 0.14); },
    open: () => { tone(440, 70, 'triangle', 0.04); tone(660, 90, 'triangle', 0.04, 0.06); },
  };
  const buzz = (ms) => { if (G.haptic && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } };
  let wake = null;
  async function keepAwake(on) {
    try {
      if (on) {
        if (!wake && navigator.wakeLock && !document.hidden) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
      } else if (wake) { const w = wake; wake = null; await w.release(); }
    } catch (e) {}
  }

  /* ---------- kleine UI-hulpjes ---------- */
  function setText(node, text) {
    if (node.dataset.t === text) return;
    node.dataset.t = text;
    node.classList.add('out');
    setTimeout(() => { node.textContent = text; node.classList.remove('out'); }, 120);
  }
  function toast(text, cls) {
    const n = el('div', 'toast ' + (cls || ''));
    n.textContent = text;
    $('toasts').appendChild(n);
    requestAnimationFrame(() => requestAnimationFrame(() => n.classList.add('on')));
    setTimeout(() => { n.classList.remove('on'); setTimeout(() => n.remove(), 300); }, 3400);
  }
  const logEl = $('log');
  function log(text, cls) {
    const row = el('div', cls || '');
    row.textContent = new Date().toTimeString().slice(0, 8) + '  ' + text;
    logEl.appendChild(row);
    while (logEl.childElementCount > 300) logEl.firstElementChild.remove();
    logEl.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });
    if ((cls === 'err' || cls === 'warn') && st.view !== 'viewLog') $('logDot').classList.add('on');
  }

  /* ---------- verbinding met de hub ---------- */
  class HubLink {
    constructor() {
      this.device = null; this.rx = null; this.tx = null;
      this.deframer = new Proto.Deframer(); this.waiters = new Map();
      this.queue = Promise.resolve(); this.packet = 20; this.chunk = 64;
      this.onMessage = null; this.onLost = null;
      // Stappenlog voor het logboek (helpt bij problemen in een bepaalde browser), en de stap waar we zijn.
      this.trace = null; this.step = '';
      this._data = (ev) => {
        const v = ev.target.value;
        const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
        for (const msg of this.deframer.push(bytes)) {
          const q = this.waiters.get(msg[0]);
          if (q && q.length) q.shift().resolve(msg);
          if (this.onMessage) { try { this.onMessage(msg); } catch (e) { console.error(e); } }
        }
      };
      this._lost = () => { this.lostStep = this.step; this.cleanup(); if (this.onLost) this.onLost(); };
    }
    get connected() { return !!(this.device && this.device.gatt && this.device.gatt.connected); }
    async open() {
      this.step = 'choose';
      try { this.device = await navigator.bluetooth.requestDevice({ filters: [{ services: [Proto.SERVICE] }] }); }
      catch (e) { e.step = e.step || this.step; throw e; }
      this.device.addEventListener('gattserverdisconnected', this._lost);
      await this.attach();
    }
    note(step, extra) { this.step = step; if (this.trace) this.trace(step, extra); }
    // Verbindt (opnieuw) met het al gekozen apparaat, zonder keuzevenster.
    async attach() {
      if (!this.device) throw new Error(t('err.notConnected'));
      try {
        this.note('gatt');
        const server = await this.device.gatt.connect();
        this.note('service');
        const service = await server.getPrimaryService(Proto.SERVICE);
        this.note('chars');
        const rx = await service.getCharacteristic(Proto.RX), tx = await service.getCharacteristic(Proto.TX);
        const pr = rx.properties || {};
        this.note('notify', (pr.writeWithoutResponse ? 'wwr ' : '') + (pr.write ? 'w ' : '') + (rx.writeValueWithoutResponse ? 'api-wwr' : 'api-w'));
        tx.addEventListener('characteristicvaluechanged', this._data);
        await tx.startNotifications();
        this.rx = rx; this.tx = tx;
        this.note('linked');
      } catch (e) { e.step = e.step || this.step; throw e; }
      this.deframer = new Proto.Deframer(); this.queue = Promise.resolve();
    }
    cleanup() {
      for (const q of this.waiters.values()) for (const w of q) w.reject(new Error(t('err.closed')));
      this.waiters.clear();
      if (this.tx) this.tx.removeEventListener('characteristicvaluechanged', this._data);
      this.rx = null; this.tx = null;
    }
    close() {
      const d = this.device;
      if (d) { d.removeEventListener('gattserverdisconnected', this._lost); try { d.gatt.disconnect(); } catch (e) {} }
      this.cleanup(); this.device = null;
    }
    async write(part) {
      if (this.rx.writeValueWithoutResponse) await this.rx.writeValueWithoutResponse(part);
      else await this.rx.writeValue(part);
    }
    send(payload) { return this.raw(Proto.pack(payload)); }
    text(s) { return this.send(Proto.tunnel(enc.encode(s))); }
    raw(frame) {
      const job = this.queue.then(async () => {
        if (!this.rx) { const e = new Error(t('err.notConnected')); if (this.lostStep) e.step = 'dropped'; throw e; }
        for (let i = 0; i < frame.length; i += this.packet) await this.write(frame.slice(i, i + this.packet));
      });
      this.queue = job.catch(() => {});
      return job;
    }
    waitFor(id, timeout) {
      let entry;
      const promise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const q = this.waiters.get(id) || [];
          const i = q.indexOf(entry); if (i >= 0) q.splice(i, 1);
          reject(new Error(t('err.noReply') + ' (0x' + id.toString(16) + ')'));
        }, timeout);
        entry = { resolve: (m) => { clearTimeout(timer); resolve(m); }, reject: (e) => { clearTimeout(timer); reject(e); } };
        if (!this.waiters.has(id)) this.waiters.set(id, []);
        this.waiters.get(id).push(entry);
      });
      promise.catch(() => {});
      return promise;
    }
    async request(payload, respId, timeout = 4000) {
      const wait = this.waitFor(respId, timeout);
      await this.send(payload);
      return wait;
    }
  }

  const hub = new HubLink();
  const stick = () => ({ v: 0, on: false, id: null });
  const st = {
    phase: 'idle', view: 'viewDrive', session: 0, keys: new Set(), codes: new Set(), joy: { x: 0, y: 0, on: false, id: null },
    tank: { l: stick(), r: stick() }, tilt: { on: false, have: false, beta: 0, gamma: 0, p0: 0, r0: 0, reach: 60 },
    aux: [0, 0], jog: [0, 0], cur: { l: 0, r: 0 }, turbo: false, test: null,
    lastSent: {}, lastText: '', lastAt: 0, sending: false, motors: [], gotMotors: false, readyWait: null, closing: false,
    battery: null, battWarned: 100, lastBeep: 0, sensors: [], sensKey: '', dist: null, blocked: false, blockedAt: -1e9, hint: ['hint.start'],
  };

  function setHint(key, ...args) { st.hint = [key, ...args]; setText($('hint'), t(key, ...args)); }
  function phaseTexts() {
    const p = st.phase, busy = p === 'connecting' || p === 'uploading' || p === 'reconnecting';
    setText($('pillText'), t('phase.' + p));
    setText($('btnConnectText'), t(p === 'stopped' ? 'btn.start' : p === 'ready' ? 'btn.connected' : busy ? 'btn.busy' : 'btn.connect'));
    return busy;
  }
  function setPhase(p) {
    st.phase = p;
    $('pill').dataset.phase = p; document.body.dataset.phase = p;
    const busy = phaseTexts();
    $('btnConnect').disabled = busy || p === 'ready' || !navigator.bluetooth;
    $('btnDisconnect').classList.toggle('hide', p === 'idle' || p === 'connecting');
    $('bar').classList.toggle('on', p === 'uploading');
    $('drive').classList.toggle('idle', p !== 'ready');
    keepAwake(p === 'ready');
    if (p !== 'ready' && st.rec) finishRec();
    if (p !== 'ready' && st.run) st.run.stop();
    $('playWhere').textContent = t(p === 'ready' ? 'play.hub' : 'play.phone');
    if (p === 'idle') {
      showBattery(null); st.motors = []; st.gotMotors = false; showChips(); showSensors([]);
      $('infoName').textContent = '-'; $('infoFw').textContent = '-';
    }
  }

  /* ---------- batterij ---------- */
  function showBattery(pct) {
    const b = $('batt');
    st.battery = pct;
    if (pct === null) {
      b.classList.remove('on', 'mid', 'low'); $('battFill').style.width = '0%'; setText($('battPct'), '--%'); $('infoBatt').textContent = '-'; st.battWarned = 100;
      return;
    }
    b.classList.add('on'); b.classList.toggle('mid', pct <= 40 && pct > 20); b.classList.toggle('low', pct <= 20);
    $('battFill').style.width = Math.max(6, pct) + '%';
    setText($('battPct'), pct + '%');
    $('infoBatt').textContent = pct + '%';
    for (const lim of [10, 20]) {
      if (pct <= lim && st.battWarned > lim) {
        st.battWarned = lim;
        const msg = t('msg.battLow', pct);
        toast(msg, lim === 10 ? 'err' : 'warn'); log(msg, 'warn'); sfx.low(); buzz(120); react('sad');
        break;
      }
    }
    if (pct > 25) st.battWarned = 100;
  }

  /* ---------- sensoren ---------- */
  const SWATCH = { '-1': 'transparent', 0: '#111418', 1: '#e3008c', 2: '#8a2be2', 3: '#1e6fff', 4: '#3fa9f5', 5: '#20c9b0', 6: '#22b14c', 7: '#ffd400', 8: '#ff8a00', 9: '#e53935', 10: '#ffffff' };
  const guardHit = () => S.guard && st.dist !== null && st.dist >= 0 && st.dist < S.guardCm * 10;
  function sensorText(s) {
    if (s.type === 'distance') return s.mm < 0 ? t('sens.noObject') : Math.round(s.mm / 10) + ' cm';
    if (s.type === 'force') return s.value + '%';
    return t('color.' + (s.color >= 0 && s.color <= 10 ? s.color : -1));
  }
  function showSensors(list) {
    st.sensors = list;
    const d = list.find((s) => s.type === 'distance');
    st.dist = d ? d.mm : null;
    const box = $('sensors'), key = list.map((s) => s.type + s.port).join(',');
    if (key !== st.sensKey) {
      st.sensKey = key; box.textContent = '';
      for (const s of list) {
        const chip = el('span', 'schip'); chip.dataset.id = s.type + s.port;
        if (s.type === 'color') chip.appendChild(el('i'));
        const b = el('b'); b.textContent = s.port; chip.appendChild(b);
        chip.appendChild(el('span'));
        box.appendChild(chip);
      }
      box.classList.toggle('on', list.length > 0);
      if (list.length) log(t('msg.sensors', list.map((s) => t('sens.' + s.type) + ' ' + s.port).join(', ')));
    }
    for (const s of list) {
      const chip = box.querySelector('[data-id="' + s.type + s.port + '"]');
      if (!chip) continue;
      const txt = sensorText(s), span = chip.lastElementChild;
      if (span.textContent !== txt) span.textContent = txt;
      if (s.type === 'color') chip.firstElementChild.style.background = SWATCH[s.color >= 0 && s.color <= 10 ? s.color : -1];
      if (s.type === 'distance') chip.classList.toggle('alert', s === d && guardHit());
    }
  }

  function showChips() {
    const chips = $('chips');
    chips.textContent = '';
    if (!st.gotMotors) { chips.textContent = t('set.notConnected'); return; }
    if (!st.motors.length) chips.textContent = t('set.noMotors');
    for (const p of st.motors) { const c = el('span', 'chip'); c.textContent = p; chips.appendChild(c); }
  }
  function showMotors(list) {
    if (st.gotMotors && list.join('') === st.motors.join('')) return;
    const first = !st.gotMotors;
    st.motors = list; st.gotMotors = true; showChips();
    if (first) {
      // Eerste keer: kies automatisch de eerste twee motorpoorten als de huidige keuze niet klopt.
      if (!S.userPorts && list.length >= 2 && !(list.includes(S.left) && list.includes(S.right))) {
        S.left = list[0]; S.right = list[1]; save(); syncSettings();
        log(t('msg.motorsAuto', list.join(', '), S.left, S.right), 'ok');
      } else if (list.length) log(t('msg.motors', list.join(', ')));
    }
  }

  function onHubMessage(msg) {
    const id = msg[0];
    if (id === 0x32 || id === 0x33) {
      const text = dec.decode(Proto.parseTunnel(msg)).trim();
      if (text.startsWith('rdy')) { if (st.readyWait) { const r = st.readyWait; st.readyWait = null; r(text); } return; }
      // Hubknoppen en gebaren (voor de programmeerkaartjes).
      if (/^btn [LR] [01]$/.test(text)) { st.btn[text[4]] = +text[6]; return; }
      if (/^ges \d$/.test(text)) { if (st.run) st.run.fire('gesture', +text[4]); return; }
      if (text.startsWith('err ')) {
        const port = text.slice(4, 5), why = text.slice(6), m = t('msg.portErr', port);
        log(m + (why ? ' (' + why + ')' : ''), 'err'); toast(m, 'err'); sfx.err();
        return;
      }
      if (text) log(t('msg.hub', text), 'hub');
    } else if (id === 0x21) {
      const text = Proto.parseConsole(msg).replace(/\s+$/, '');
      if (text) log(t('msg.hub', text), /Error|Traceback/.test(text) ? 'err' : 'hub');
    } else if (id === 0x20) {
      if (msg[1] === 1 && st.phase === 'ready' && !st.closing) {
        halt(); setPhase('stopped'); setHint('hint.stopped');
        log(t('msg.progStopped') + '.', 'warn'); toast(t('msg.progStopped'), 'warn'); sfx.lost();
      }
    } else if (id === 0x3c) {
      const info = Proto.parseDeviceNotification(msg);
      if (info.battery !== null) {
        if (st.battery === null) log(t('msg.batt', info.battery));
        if (info.battery !== st.battery) showBattery(info.battery);
      }
      showMotors(info.motors);
      showSensors(info.sensors);
      if (info.imu) st.imu = info.imu;
      const md = {};
      info.motorData.forEach((m) => { md[m.port] = m; });
      st.motorData = md;
    }
  }

  function waitReady(ms) {
    return new Promise((resolve) => {
      st.readyWait = resolve;
      setTimeout(() => { if (st.readyWait === resolve) st.readyWait = null; resolve(null); }, ms);
    });
  }
  // Vraagt het hubprogramma of het (in de juiste versie) al draait.
  async function ping(ms) {
    const w = waitReady(ms);
    await hub.text('?');
    return (await w) === 'rdy ' + HUB_VERSION;
  }
  function resetDrive() { st.lastSent = {}; st.lastText = ''; st.cur.l = 0; st.cur.r = 0; }

  async function startProgram() {
    const w = waitReady(5000);
    const r = await hub.request(Proto.programFlow(false, G.slot), 0x1f);
    if (r[1] !== 0) throw new Error(t('err.noStart'));
    if (!(await w)) log(t('msg.noAck'), 'warn');
    resetDrive();
  }

  async function upload() {
    const src = enc.encode($('hub-program').textContent.replace(/^\s*\n/, ''));
    $('barFill').style.width = '0%';
    await hub.request(Proto.programFlow(true, G.slot), 0x1f, 1500).catch(() => {});
    await hub.request(Proto.clearSlot(G.slot), 0x47, 3000).catch(() => {});
    let r = await hub.request(Proto.startFileUpload('program.py', G.slot, Proto.crc(src)), 0x0d);
    if (r[1] !== 0) throw new Error(t('err.refuse'));
    let running = 0;
    for (let off = 0; off < src.length; off += hub.chunk) {
      const part = src.subarray(off, off + hub.chunk);
      running = Proto.crc(part, running);
      r = await hub.request(Proto.transferChunk(running, part), 0x11);
      if (r[1] !== 0) throw new Error(t('err.upload', off));
      $('barFill').style.width = Math.round(((off + part.length) / src.length) * 100) + '%';
    }
    log(t('msg.loaded', src.length, G.slot));
  }

  // Upload met terugval: lukt het niet met grote BLE-pakketten (telefoons staan vaak minder toe), dan opnieuw met 20 bytes.
  async function install() {
    setPhase('uploading'); setHint('hint.upload', G.slot);
    const sizes = hub.packet > 20 ? [hub.packet, 20] : [20];
    for (let i = 0; i < sizes.length; i++) {
      hub.packet = sizes[i];
      try { await upload(); break; }
      catch (e) {
        if (i === sizes.length - 1 || !hub.connected) throw e;
        log(t('msg.retry20', sizes[i]), 'warn');
        await hub.raw(Uint8Array.of(0x02)).catch(() => {}); // half ontvangen bericht op de hub afsluiten
        await sleep(400);
      }
    }
    await startProgram();
  }

  // Kennismaken na (her)verbinden: limieten opvragen, programma controleren of laden, batterij/poorten/sensoren volgen.
  async function handshake() {
    const reply = await hub.request(Proto.infoRequest(), 0x01);
    let info;
    try { info = Proto.parseInfo(reply); } catch (e) { throw new Error(t('err.badReply')); }
    hub.packet = Math.max(20, Math.min(info.maxPacketSize || 20, 180));
    hub.chunk = Math.max(4, Math.floor((info.maxChunkSize || 64) / 4) * 4);
    $('infoName').textContent = hub.device.name || 'hub'; $('infoFw').textContent = info.firmware;
    log(t('msg.fw', info.firmware, hub.packet, hub.chunk));
    if (await ping(700)) { log(t('msg.running')); resetDrive(); }
    else await install();
    await hub.request(Proto.deviceNotificationRequest(200), 0x29, 2000).catch(() => log(t('msg.noStatus'), 'warn'));
  }

  function goReady(noteKey) {
    setPhase('ready'); setHint('hint.ready'); sfx.ready(); buzz(30);
    hub.text('vol ' + G.hubVol).catch(() => {}); react('hello');
    if (noteKey) { toast(t(noteKey), 'ok'); log(t(noteKey) + '.', 'ok'); }
  }

  // Foutmelding met de naam van de fout en de stap waarin het misging.
  function describe(e) {
    if (!e) return '?';
    const name = e.name && e.name !== 'Error' ? e.name + ': ' : '';
    return name + (e.message || String(e)) + (e.step ? ' (' + t('dbg.at', t('dbg.' + e.step)) + ')' : '');
  }
  hub.trace = (step, extra) => { if (st.phase !== 'ready' && st.phase !== 'idle') log(t('dbg.step', t('dbg.' + step)) + (extra ? ' [' + extra + ']' : '')); };
  async function connect() {
    if (!navigator.bluetooth) return;
    const my = ++st.session;
    try {
      setPhase('connecting'); setHint('hint.choose');
      await hub.open();
      sfx.link();
      log(t('msg.connected', hub.device.name || 'hub'), 'ok');
      // Valt de verbinding weg tijdens het kennismaken (gebeurt op iPhone), dan zelf nog twee keer proberen.
      for (let attempt = 1; ; attempt++) {
        hub.lostStep = '';
        try { await handshake(); break; }
        catch (e) {
          if (my !== st.session) return;
          if (hub.connected || !hub.device || attempt > 2) throw e;
          log(t('dbg.retry', attempt), 'warn');
          hub.cleanup(); await sleep(800 * attempt);
          if (my !== st.session) return;
          await hub.attach();
        }
      }
      if (my !== st.session) return;
      goReady();
    } catch (e) {
      if (my !== st.session) return;
      const cancelled = e && e.name === 'NotFoundError';
      hub.close(); setPhase('idle');
      setHint(cancelled ? 'hint.nochoice' : 'hint.fail');
      if (!cancelled) { log(t('msg.err', describe(e)), 'err'); toast(t('msg.connectFail'), 'err'); sfx.err(); }
    }
  }

  async function restart() {
    const my = ++st.session;
    try {
      setPhase('uploading'); $('barFill').style.width = '100%';
      await startProgram();
      if (my !== st.session) return;
      goReady();
    } catch (e) { if (my !== st.session) return; log(t('msg.err', e.message), 'err'); sfx.err(); setPhase('stopped'); }
  }

  // Valt de verbinding onverwacht weg, dan zelf een paar keer opnieuw proberen (zonder keuzevenster).
  async function reconnect() {
    const my = ++st.session;
    setPhase('reconnecting'); setHint('hint.lost');
    log(t('msg.lostRetry') + '.', 'warn'); toast(t('msg.lostRetry'), 'warn'); sfx.lost(); buzz(80);
    for (const wait of [600, 1200, 2000, 3000, 4000]) {
      await sleep(wait);
      if (my !== st.session) return;
      try {
        await hub.attach();
        await handshake();
        if (my !== st.session) return;
        goReady('msg.reconnected');
        return;
      } catch (e) { if (my !== st.session) return; hub.cleanup(); }
    }
    hub.close(); setPhase('idle'); setHint('hint.reconnectFail');
    log(t('msg.reconnectFail') + '.', 'err'); toast(t('msg.reconnectFail'), 'err'); sfx.err();
  }

  async function disconnect() {
    const was = st.phase;
    st.session++; st.closing = true;
    halt();
    try {
      if (hub.connected && was === 'ready') {
        await hub.text(zeroText()).catch(() => {});
        await hub.request(Proto.programFlow(true, G.slot), 0x1f, 1000).catch(() => {});
      }
    } finally {
      hub.close(); st.closing = false; setPhase('idle'); setHint('hint.disconnected'); log(t('msg.disconnected')); sfx.lost();
    }
  }

  hub.onMessage = onHubMessage;
  hub.onLost = () => {
    halt();
    if (st.closing) return;
    if (st.phase === 'connecting' || st.phase === 'uploading') log(t('dbg.lost', t('dbg.' + (hub.lostStep || 'linked'))), 'warn');
    if (st.phase === 'ready' || st.phase === 'stopped') reconnect();
    // Tijdens verbinden of herstellen vangt de lopende poging de fout zelf af.
  };

  /* ---------- besturing ---------- */
  const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  const AUXKEYS = { KeyQ: [0, -1], KeyE: [0, 1], KeyF: [1, -1], KeyR: [1, 1] };
  const STEP = 20; // maximale verandering per tik van 50 ms: zachte aanloop
  const TILT_FULL = 25; // graden kantelen voor volle uitslag
  const needReady = () => { if (st.phase === 'ready') return true; toast(t('msg.needConnect'), 'warn'); sfx.err(); return false; };

  function setTurbo(on) { st.turbo = on; $('turbo').classList.toggle('on', on); }
  function halt() {
    st.keys.clear(); st.codes.clear(); st.joy.x = 0; st.joy.y = 0; st.joy.on = false; st.joy.id = null;
    st.tank.l = stick(); st.tank.r = stick(); st.tilt.on = false; st.aux = [0, 0]; st.jog = [0, 0]; st.cur.l = 0; st.cur.r = 0; st.test = null;
    if (st.macro) endMacro(false);
    if (st.run) st.run.stop();
    setTurbo(false);
    $('knob').style.transform = ''; $('pad').classList.remove('grab');
    qsa('.vstick').forEach((v) => { v.classList.remove('grab'); v.querySelector('.vknob').style.transform = ''; });
    qsa('.key.on,.hold.on,.horn.on,.jog.on').forEach((n) => n.classList.remove('on'));
  }
  function emergencyStop() {
    halt(); sfx.stop(); buzz(40);
    // Ook bewegingen over graden en grijperstanden op de hub stoppen.
    if (st.phase === 'ready') hub.text('halt').catch(() => {});
    const b = $('btnStop'); b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 220);
  }
  function beep() {
    const now = performance.now();
    if (st.phase !== 'ready' || now - st.lastBeep < 300) return;
    st.lastBeep = now; buzz(15);
    hub.text('beep').catch(() => {});
  }

  function auxPorts() {
    const used = new Set([S.left, S.right]);
    return S.aux.map((a) => { if (a.port === '-' || used.has(a.port)) return null; used.add(a.port); return a.port; });
  }
  const auxName = (i) => S.aux[i].name || t('aux.n', i + 1);
  // Grijper: naar open (+1) of dicht (-1), gerekend vanaf het nulpunt op de hub.
  function gripMove(i, dir) {
    const port = auxPorts()[i];
    if (!port || !needReady()) return;
    const a = S.aux[i];
    hub.text('pos ' + port + ' ' + (dir > 0 ? a.travel : 0) + ' ' + a.speed).catch(() => {});
    sfx.open(); buzz(15);
  }
  function outputs() {
    const out = {};
    if (st.run) {
      const pp = progPorts();
      for (const p in st.prog.ports) out[p] = st.prog.ports[p];
      out[pp.l] = Math.round(st.cur.l) * (S.invL ? -1 : 1) || 0;
      if (pp.r !== pp.l) out[pp.r] = Math.round(st.cur.r) * (S.invR ? -1 : 1) || 0;
      return out;
    }
    out[S.left] = Math.round(st.cur.l) * (S.invL ? -1 : 1) || 0;
    if (S.right !== S.left) out[S.right] = Math.round(st.cur.r) * (S.invR ? -1 : 1) || 0;
    auxPorts().forEach((port, i) => {
      if (!port) return;
      const a = S.aux[i];
      if (a.mode !== 'grip') out[port] = (st.aux[i] || st.jog[i]) * a.speed;
      else if (st.jog[i]) out[port] = st.jog[i] * 30; // grijper langzaam bijstellen
    });
    return out;
  }
  const textOf = (out) => Object.keys(out).sort().map((p) => p + ':' + out[p]).join(' ');
  function zeroText() {
    const out = outputs();
    for (const p in st.lastSent) out[p] = 0;
    for (const p in out) out[p] = 0;
    return textOf(out);
  }
  const approach = (cur, target) => cur + Math.max(-STEP, Math.min(STEP, target - cur));

  function meter(fill, outEl, v) {
    const w = Math.abs(v) / 2;
    fill.style.width = w + '%';
    fill.style.left = v < 0 ? 50 - w + '%' : '50%';
    fill.classList.toggle('neg', v < 0);
    outEl.textContent = String(Math.round(v));
  }

  // Kantelhoeken (vooruit/achteruit, links/rechts), gecorrigeerd voor de stand van het scherm.
  function tiltAxes() {
    const a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
    const b = st.tilt.beta, g = st.tilt.gamma;
    if (a === 90) return [-g, b];
    if (a === 270 || a === -90) return [g, -b];
    if (a === 180) return [-b, -g];
    return [b, g];
  }
  const dead = (v, d) => (Math.abs(v) < d ? 0 : v);

  // Gewenste snelheid per kant in procenten, op basis van de actieve besturingsvorm.
  function targets() {
    const now = performance.now();
    st.blocked = false;
    if (st.test) {
      if (now < st.test.until) return st.test.side === 'l' ? [40, 0] : [0, 40];
      st.test = null;
    }
    const speed = st.turbo ? 100 : S.speed, hit = guardHit();
    // Dans of opgenomen route: vaste snelheden per tik, tot je zelf stuurt.
    if (st.macro) {
      const m = st.macro, own = st.joy.on || st.tilt.on || st.keys.size || st.tank.l.on || st.tank.r.on;
      if (own || st.phase !== 'ready' || m.i >= m.steps.length) endMacro(!own && st.phase === 'ready');
      else {
        let [ml, mr] = m.steps[m.i++];
        if (hit && ml + mr > 5) { ml = 0; mr = 0; st.blocked = true; }
        return [ml, mr];
      }
    }
    // Programma van kaartjes: zijn eigen rijsnelheden, tot je zelf stuurt.
    if (st.run) {
      if (st.joy.on || st.tilt.on || st.keys.size || st.tank.l.on || st.tank.r.on) st.run.stop();
      else return [st.prog.l, st.prog.r];
    }
    // Rechtuit-correctie: negatief remt de linkermotor iets af, positief de rechter.
    const tl = S.trim < 0 ? 1 + S.trim / 100 : 1, tr = S.trim > 0 ? 1 - S.trim / 100 : 1;
    let l, r;
    if (G.mode === 'tank' && (st.tank.l.on || st.tank.r.on)) {
      l = st.tank.l.v; r = st.tank.r.v;
      if (hit && l + r > 0.05) { l = 0; r = 0; st.blocked = true; }
    } else {
      let x = 0, y = 0;
      if (G.mode === 'tilt' && st.tilt.on) {
        const [p, q] = tiltAxes();
        y = dead(clamp(-(p - st.tilt.p0) / TILT_FULL, -1, 1), 0.12); x = dead(clamp((q - st.tilt.r0) / TILT_FULL, -1, 1), 0.12);
        $('knob').style.transform = 'translate(' + x * st.tilt.reach + 'px,' + -y * st.tilt.reach + 'px)';
      } else if (st.joy.on) { x = st.joy.x; y = st.joy.y; }
      else {
        if (st.keys.has('up')) y += 1;
        if (st.keys.has('down')) y -= 1;
        if (st.keys.has('right')) x += 1;
        if (st.keys.has('left')) x -= 1;
      }
      if (hit && y > 0) { y = 0; st.blocked = true; }
      l = y + x * (S.turn / 100); r = y - x * (S.turn / 100);
      const m = Math.max(1, Math.abs(l), Math.abs(r));
      l /= m; r /= m;
    }
    return [l * speed * tl, r * speed * tr];
  }

  function tick() {
    if (st.run) st.run.tick();
    const [tl, tr] = targets();
    if (st.rec && st.phase === 'ready') {
      // Route opnemen: begint bij de eerste beweging.
      if (st.rec.length || tl || tr) st.rec.push([Math.round(tl), Math.round(tr)]);
      if (st.rec.length >= MAX_PATH) finishRec();
    }
    if (st.blocked) {
      // Obstakel: direct afremmen in plaats van uitlopen.
      st.cur.l = Math.min(st.cur.l, tl); st.cur.r = Math.min(st.cur.r, tr);
      const now = performance.now();
      if (now - st.blockedAt > 3000) { toast(t('sens.obstacle', Math.round(st.dist / 10)), 'warn'); sfx.stop(); buzz(60); react('oops'); }
      st.blockedAt = now;
    }
    st.cur.l = approach(st.cur.l, tl);
    st.cur.r = approach(st.cur.r, tr);
    meter($('fillL'), $('outL'), st.cur.l);
    meter($('fillR'), $('outR'), st.cur.r);

    if (st.phase !== 'ready' || st.sending) return;
    const out = outputs();
    for (const p in st.lastSent) if (!(p in out) && st.lastSent[p] !== 0) out[p] = 0;
    const text = textOf(out), now = performance.now();
    if (text === st.lastText && now - st.lastAt < 250) return;
    st.sending = true;
    hub.text(text)
      .then(() => { st.lastSent = out; st.lastText = text; st.lastAt = performance.now(); })
      .catch(() => {})
      .then(() => { st.sending = false; });
  }
  setInterval(tick, 50);

  const typing = (e) => e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox';
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { closeShare(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) emergencyStop(); return; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { if (!st.turbo) setTurbo(true); return; }
    if (e.code === 'KeyH') { if (!e.repeat) { $('btnHorn').classList.add('on'); beep(); } return; }
    const k = KEYMAP[e.code], a = AUXKEYS[e.code];
    if (k) {
      e.preventDefault();
      st.codes.add(e.code);
      if (!st.keys.has(k)) { st.keys.add(k); sfx.tick(); qsa('.key[data-k="' + k + '"]').forEach((n) => n.classList.add('on')); }
    } else if (a && auxPorts()[a[0]]) {
      e.preventDefault();
      if (S.aux[a[0]].mode === 'grip') { if (!e.repeat) { holdBtn(a[0], a[1], true); gripMove(a[0], a[1]); } }
      else if (S.aux[a[0]].mode === 'toggle') { if (!e.repeat) toggleAux(a[0], a[1]); }
      else if (st.aux[a[0]] !== a[1]) { st.aux[a[0]] = a[1]; sfx.tick(); holdBtn(a[0], a[1], true); }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { setTurbo(false); return; }
    if (e.code === 'KeyH') { $('btnHorn').classList.remove('on'); return; }
    const k = KEYMAP[e.code], a = AUXKEYS[e.code];
    if (k) {
      // Laat de richting pas los als geen van beide toetsen (letter of pijl) nog ingedrukt is.
      st.codes.delete(e.code);
      for (const c of st.codes) if (KEYMAP[c] === k) return;
      st.keys.delete(k); qsa('.key[data-k="' + k + '"]').forEach((n) => n.classList.remove('on'));
    } else if (a) { if (S.aux[a[0]].mode === 'toggle') return; if (st.aux[a[0]] === a[1]) st.aux[a[0]] = 0; holdBtn(a[0], a[1], false); }
  });
  window.addEventListener('blur', halt);
  document.addEventListener('visibilitychange', () => { if (document.hidden) halt(); else keepAwake(st.phase === 'ready'); });

  // Aan/uit-stand: één tik start de motor (of keert hem om), nog een tik in dezelfde richting stopt hem.
  // STOP, wegklikken, een ander scherm en een verbroken verbinding zetten hem via halt() ook uit.
  function toggleAux(i, dir) {
    if (!needReady()) return;
    st.aux[i] = st.aux[i] === dir ? 0 : dir;
    qsa('.hold[data-aux="' + i + '"]').forEach((b) => b.classList.toggle('on', +b.dataset.dir === st.aux[i]));
    sfx.tick(); buzz(10);
  }
  function holdBtn(i, dir, on) {
    const n = document.querySelector('.hold[data-aux="' + i + '"][data-dir="' + dir + '"]');
    if (n) n.classList.toggle('on', on);
  }
  // Knop die een extra motor laat draaien zolang hij ingedrukt is (of de grijper een stand laat kiezen).
  function bindHold(btn, i, dir, slot) {
    const toggles = () => slot === 'aux' && S.aux[i].mode === 'toggle';
    const up = () => { if (toggles()) return; if (st[slot][i] === dir) st[slot][i] = 0; btn.classList.remove('on'); };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (toggles()) { toggleAux(i, dir); return; }
      if (slot === 'aux' && S.aux[i].mode === 'grip') { btn.classList.add('on'); setTimeout(() => btn.classList.remove('on'), 220); gripMove(i, dir); return; }
      if (slot === 'jog' && !needReady()) return;
      try { btn.setPointerCapture(e.pointerId); } catch (x) {}
      st[slot][i] = dir; btn.classList.add('on'); sfx.tick(); buzz(10);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((n) => btn.addEventListener(n, up));
  }
  function renderAux() {
    const box = $('aux');
    box.textContent = '';
    let any = false;
    auxPorts().forEach((port, i) => {
      if (!port) return;
      any = true;
      const a = S.aux[i], row = el('div', 'auxrow on'), label = el('span'), b = el('b'), keys = i === 0 ? ['Q', 'E'] : ['F', 'R'];
      label.textContent = auxName(i) + ' '; b.textContent = '(' + port + ')'; label.appendChild(b); row.appendChild(label);
      [-1, 1].forEach((dir, j) => {
        const btn = el('button', 'btn hold'), k = el('kbd');
        btn.dataset.aux = i; btn.dataset.dir = dir; k.textContent = keys[j]; btn.appendChild(k);
        btn.appendChild(document.createTextNode(' ' + t(a.mode === 'grip' ? (dir < 0 ? 'aux.close' : 'aux.open') : (dir < 0 ? 'aux.minus' : 'aux.plus'))));
        if (a.mode === 'toggle' && st.aux[i] === dir) btn.classList.add('on');
        bindHold(btn, i, dir, 'aux'); row.appendChild(btn);
      });
      box.appendChild(row);
    });
    box.classList.toggle('on', any);
  }

  const horn = $('btnHorn');
  horn.addEventListener('pointerdown', (e) => { e.preventDefault(); horn.classList.add('on'); beep(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => horn.addEventListener(n, () => horn.classList.remove('on')));
  // STOP reageert al bij aanraken, niet pas bij loslaten.
  $('btnStop').addEventListener('pointerdown', (e) => { e.preventDefault(); emergencyStop(); });
  $('btnStop').addEventListener('click', (e) => { if (e.detail === 0) emergencyStop(); }); // toetsenbordbediening van de knop

  /* joystick en kantelen (delen dezelfde cirkel) */
  const pad = $('pad'), knob = $('knob');
  function joyMove(e) {
    const rct = pad.getBoundingClientRect(), R = rct.width / 2, reach = R * 0.64;
    let dx = e.clientX - (rct.left + R), dy = e.clientY - (rct.top + R);
    const d = Math.hypot(dx, dy);
    if (d > reach) { dx = (dx / d) * reach; dy = (dy / d) * reach; }
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    st.joy.x = dead(dx / reach, 0.08); st.joy.y = dead(-dy / reach, 0.08);
  }
  pad.addEventListener('pointerdown', (e) => {
    if (st.joy.on || st.tilt.on) return;
    e.preventDefault();
    if (G.mode === 'tilt') {
      if (!st.tilt.have) { toast(t('tilt.none'), 'warn'); sfx.err(); return; }
      try { pad.setPointerCapture(e.pointerId); } catch (x) {}
      const [p, q] = tiltAxes();
      st.tilt.p0 = p; st.tilt.r0 = q; st.tilt.reach = pad.getBoundingClientRect().width * 0.32; st.tilt.on = true; st.joy.id = e.pointerId;
      pad.classList.add('grab'); sfx.grab(); buzz(10);
      return;
    }
    try { pad.setPointerCapture(e.pointerId); } catch (x) {}
    st.joy.on = true; st.joy.id = e.pointerId; pad.classList.add('grab'); sfx.grab(); buzz(10); joyMove(e);
  });
  pad.addEventListener('pointermove', (e) => { if (st.joy.on && e.pointerId === st.joy.id) joyMove(e); });
  const joyEnd = (e) => {
    if ((!st.joy.on && !st.tilt.on) || (e && e.pointerId !== st.joy.id)) return;
    st.joy.on = false; st.tilt.on = false; st.joy.id = null; st.joy.x = 0; st.joy.y = 0; pad.classList.remove('grab'); knob.style.transform = '';
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((n) => pad.addEventListener(n, joyEnd));
  window.addEventListener('deviceorientation', (e) => {
    if (e.beta === null || e.gamma === null) return;
    st.tilt.have = true; st.tilt.beta = e.beta; st.tilt.gamma = e.gamma;
  });

  /* tank: twee schuiven, één per motor */
  qsa('.vstick').forEach((v) => {
    const side = v.dataset.side, vk = v.querySelector('.vknob');
    const move = (e) => {
      const rct = v.getBoundingClientRect(), reach = Math.max(10, rct.height / 2 - rct.width * 0.38 - 4);
      const dy = clamp(e.clientY - (rct.top + rct.height / 2), -reach, reach);
      vk.style.transform = 'translateY(' + dy + 'px)';
      st.tank[side].v = dead(-dy / reach, 0.08);
    };
    v.addEventListener('pointerdown', (e) => {
      if (st.tank[side].on) return;
      e.preventDefault(); try { v.setPointerCapture(e.pointerId); } catch (x) {}
      st.tank[side].on = true; st.tank[side].id = e.pointerId; v.classList.add('grab'); sfx.grab(); buzz(10); move(e);
    });
    v.addEventListener('pointermove', (e) => { if (st.tank[side].on && e.pointerId === st.tank[side].id) move(e); });
    const end = (e) => {
      if (!st.tank[side].on || (e && e.pointerId !== st.tank[side].id)) return;
      st.tank[side] = stick(); v.classList.remove('grab'); vk.style.transform = '';
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((n) => v.addEventListener(n, end));
  });

  const tiltAvailable = 'DeviceOrientationEvent' in window && window.matchMedia && matchMedia('(pointer:coarse)').matches;
  function setMode(m, byUser) {
    if (m === 'tilt' && !tiltAvailable) m = 'joy';
    G.mode = m; save(); halt();
    qsa('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    pad.classList.toggle('on', m !== 'tank'); pad.classList.toggle('tilt', m === 'tilt'); $('tank').classList.toggle('on', m === 'tank');
    if (m === 'tilt' && byUser && typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS vraagt apart toestemming voor de bewegingssensor.
      DeviceOrientationEvent.requestPermission().then((r) => { if (r !== 'granted') { toast(t('tilt.denied'), 'warn'); setMode('joy'); } })
        .catch(() => { toast(t('tilt.denied'), 'warn'); setMode('joy'); });
    }
  }
  qsa('#modes button').forEach((b) => {
    if (b.dataset.mode === 'tilt' && !tiltAvailable) b.classList.add('gone');
    b.addEventListener('click', () => { sfx.tab(); buzz(8); setMode(b.dataset.mode, true); });
  });

  /* ---------- spelen: liedjes, robotpraat, praten, piano, dansen ---------- */
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freqOf(name) {
    const m = /^([A-G])([#b]?)(\d)$/.exec(name);
    if (!m) return 0;
    const midi = 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return Math.round(440 * Math.pow(2, (midi - 69) / 12));
  }
  // Melodie als "noot:lengte" (lengte in achtsten, R is een rust) naar [frequentie, ms], met een kort gaatje tussen noten.
  function melody(src, eighth) {
    const out = [];
    for (const tok of src.trim().split(/\s+/)) {
      const [n, len] = tok.split(':'), ms = Math.round((+len || 1) * eighth), f = n === 'R' ? 0 : freqOf(n);
      if (!f) { out.push([0, ms]); continue; }
      const gap = Math.min(40, Math.round(ms / 6));
      out.push([f, ms - gap], [0, gap]);
    }
    return out;
  }
  // Alleen bekende internationale melodieën zonder auteursrecht (klassiek, traditioneel, Happy Birthday)
  // en eigen deuntjes. Geen hedendaagse popliedjes: daar rust auteursrecht op, ook op de melodie alleen.
  const faster = (src, f) => src.replace(/:(\d+(?:\.\d+)?)/g, (_, n) => ':' + Math.round(+n * f * 100) / 100);
  const MOUNTAIN = 'B4:1 C#5:1 D5:1 E5:1 F#5:1 D5:1 F#5:2 F5:1 C#5:1 F5:2 E5:1 C5:1 E5:2 B4:1 C#5:1 D5:1 E5:1 F#5:1 D5:1 F#5:1 B5:1 A5:1 F#5:1 D5:1 F#5:1 A5:4';
  const SONGS = [
    ['birthday', '\u{1F382}', 180, 'G4:1.5 G4:0.5 A4:2 G4:2 C5:2 B4:4 G4:1.5 G4:0.5 A4:2 G4:2 D5:2 C5:4 G4:1.5 G4:0.5 G5:2 E5:2 C5:2 B4:2 A4:4 F5:1.5 F5:0.5 E5:2 C5:2 D5:2 C5:4'],
    ['jingle', '\u{1F514}', 150, 'E5:1 E5:1 E5:2 E5:1 E5:1 E5:2 E5:1 G5:1 C5:1.5 D5:0.5 E5:4 F5:1 F5:1 F5:1.5 F5:0.5 F5:1 E5:1 E5:1 E5:0.5 E5:0.5 E5:1 D5:1 D5:1 E5:1 D5:2 G5:2 ' +
      'E5:1 E5:1 E5:2 E5:1 E5:1 E5:2 E5:1 G5:1 C5:1.5 D5:0.5 E5:4 F5:1 F5:1 F5:1.5 F5:0.5 F5:1 E5:1 E5:1 E5:0.5 E5:0.5 G5:1 G5:1 F5:1 D5:1 C5:4'],
    ['entertainer', '\u{1F3A9}', 120, 'D4:1 D#4:1 E4:1 C5:2 E4:1 C5:2 E4:1 C5:6 C5:1 D5:1 D#5:1 E5:1 C5:1 D5:1 E5:2 B4:1 D5:2 C5:6'],
    ['mountain', '\u{1F9CC}', 110, faster(MOUNTAIN, 1.6) + ' R:2 ' + MOUNTAIN],
    ['mozart', '\u{1F3BB}', 140, 'G4:2 R:1 D4:1 G4:2 R:1 D4:1 G4:1 D4:1 G4:1 B4:1 D5:4 C5:2 R:1 A4:1 C5:2 R:1 A4:1 C5:1 A4:1 F#4:1 A4:1 D4:4'],
    ['ode', '\u{1F3BA}', 220, 'E4:2 E4:2 F4:2 G4:2 G4:2 F4:2 E4:2 D4:2 C4:2 C4:2 D4:2 E4:2 E4:3 D4:1 D4:4 E4:2 E4:2 F4:2 G4:2 G4:2 F4:2 E4:2 D4:2 C4:2 C4:2 D4:2 E4:2 D4:3 C4:1 C4:4'],
    ['elise', '\u{1F3B9}', 150, 'E5:1 D#5:1 E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 A4:2 R:1 C4:1 E4:1 A4:1 B4:2 R:1 E4:1 G#4:1 B4:1 C5:2 R:1 E4:1 E5:1 D#5:1 E5:1 D#5:1 E5:1 B4:1 D5:1 C5:1 A4:2 R:1 C4:1 E4:1 A4:1 B4:2 R:1 E4:1 C5:1 B4:1 A4:4'],
    ['fanfare', '\u{1F389}', 120, 'G4:1 C5:1 E5:1 G5:3 E5:1 G5:6'],
  ];
  // Gezichten voor het 5x5-lichtscherm: 25 helderheden 0-9, rij voor rij van boven naar beneden.
  const FACES = {
    smile: '00000' + '09090' + '00000' + '90009' + '09990',
    wink: '00000' + '09099' + '00000' + '90009' + '09990',
    sad: '00000' + '09090' + '00000' + '09990' + '90009',
    wow: '09090' + '00000' + '00900' + '09090' + '00900',
    oops: '09090' + '00000' + '99999' + '90909' + '99999',
    angry: '90009' + '09090' + '00000' + '09990' + '90009',
    sleep: '00000' + '99099' + '00000' + '00900' + '00000',
    love: '09090' + '99999' + '99999' + '09990' + '00900',
    note: '00990' + '00909' + '00900' + '99900' + '99900',
    mOpen: '09090' + '00000' + '09990' + '90009' + '09990',
    mHalf: '09090' + '00000' + '00000' + '99999' + '00000',
    mShut: '09090' + '00000' + '00000' + '09990' + '00000',
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  function glide(f0, f1, ms, steps) {
    const out = [];
    for (let i = 0; i < steps; i++) out.push([Math.round(f0 + ((f1 - f0) * i) / Math.max(1, steps - 1)), Math.round(ms / steps)]);
    return out;
  }
  // Robotgeluidjes per stemming: piepjes en glijtonen, elke keer een beetje anders.
  const MOODS = [
    ['hello', '\u{1F44B}', 'wink', () => glide(500, 1100, 160, 5).concat([[0, 60], [1300, 70], [0, 40], [1500, 90]])],
    ['happy', '\u{1F600}', 'smile', () => { const o = []; for (let i = 0; i < 7; i++) o.push([Math.round(rnd(900, 1700)), Math.round(rnd(50, 90))], [0, 25]); return o.concat(glide(1000, 1900, 150, 5)); }],
    ['sad', '\u{1F622}', 'sad', () => glide(700, 520, 300, 6).concat([[0, 80]], glide(560, 260, 700, 10))],
    ['wow', '\u{1F62E}', 'wow', () => glide(350, 1900, 380, 10).concat([[0, 60], [1900, 120]])],
    ['oops', '\u{1F62C}', 'oops', () => [[740, 180], [0, 60], [494, 320]]],
    ['angry', '\u{1F620}', 'angry', () => { const o = []; for (let i = 0; i < 8; i++) o.push([i % 2 ? 180 : 240, 70]); return o; }],
    ['sleep', '\u{1F634}', 'sleep', () => glide(220, 160, 700, 8).concat([[0, 300]], glide(160, 220, 600, 6), [[0, 200]], glide(220, 150, 800, 8))],
    ['love', '❤️', 'love', () => melody('G4:1 C5:1 E5:2 R:1 C5:1 E5:1 G5:4', 120)],
  ];
  const linked = () => st.phase === 'ready';
  const totalMs = (notes) => notes.reduce((a, n) => a + n[1], 0);
  function showFace(name) { if (linked() && FACES[name]) hub.text('img ' + FACES[name]).catch(() => {}); }
  // Naar de hub in berichten van hooguit 24 noten: "tune" begint opnieuw, "tune+" sluit aan.
  function sendNotes(notes) {
    const toks = notes.map(([f, ms]) => Math.round(f) + ':' + Math.max(10, Math.round(ms)));
    for (let i = 0; i < toks.length; i += 24) hub.text((i ? 'tune+ ' : 'tune ') + toks.slice(i, i + 24).join(' ')).catch(() => {});
  }
  // Zonder hub klinkt het op dit toestel, met dezelfde piepstem.
  let musicOut = null;
  function stopLocal() { if (musicOut) { try { musicOut.disconnect(); } catch (e) {} musicOut = null; } }
  function playLocal(notes) {
    stopLocal();
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const out = actx.createGain();
      out.gain.value = 0.06 * Math.max(0.15, G.hubVol / 100); out.connect(actx.destination); musicOut = out;
      let t0 = actx.currentTime + 0.03;
      for (const [f, ms] of notes) {
        const d = ms / 1000;
        if (f > 0) {
          const o = actx.createOscillator(), e = actx.createGain();
          o.type = 'square'; o.frequency.value = f;
          e.gain.setValueAtTime(0, t0); e.gain.linearRampToValueAtTime(1, t0 + 0.005);
          e.gain.setValueAtTime(1, Math.max(t0 + 0.006, t0 + d - 0.012)); e.gain.linearRampToValueAtTime(0, t0 + d);
          o.connect(e).connect(out); o.start(t0); o.stop(t0 + d + 0.01);
        }
        t0 += d;
      }
    } catch (e) {}
  }
  function play(notes, face) {
    if (linked()) { sendNotes(notes); if (face) showFace(face); } else playLocal(notes);
    return totalMs(notes);
  }
  function quiet() {
    stopLocal(); endMouth();
    if (linked()) hub.text('hush').catch(() => {});
  }
  const moodNotes = (id) => { const m = MOODS.find((x) => x[0] === id); return m ? [m[3](), m[2]] : [[], null]; };
  function mood(id) { const [n, face] = moodNotes(id); play(n, face); }
  // Vanzelf reageren (verbinden, obstakel, batterij), alleen op de hub.
  function react(id) { if (G.react && linked()) setTimeout(() => { if (linked()) mood(id); }, 250); }

  function funBtn(box, id, emo, key, onClick) {
    const b = el('button', 'btn fun'), e = el('span', 'emo'), l = el('span');
    b.id = id; e.textContent = emo; e.setAttribute('aria-hidden', 'true'); l.dataset.i18n = key;
    b.append(e, l); box.appendChild(b);
    b.addEventListener('click', () => { buzz(10); onClick(b); });
    return b;
  }
  SONGS.forEach(([id, emo, eighth, src]) => funBtn($('songBtns'), 'song-' + id, emo, 'song.' + id, () => play(melody(src, eighth), 'note')));
  funBtn($('songBtns'), 'song-quiet', '\u{1F92B}', 'music.stop', () => { quiet(); sfx.tick(); });
  MOODS.forEach(([id, emo]) => funBtn($('moodBtns'), 'mood-' + id, emo, 'mood.' + id, () => mood(id)));

  /* robottaal: de hub zegt je zin zelf in piepjes, één piepje per lettergreep, met bewegende mond */
  const VOWEL_PITCH = { i: 1.35, y: 1.25, e: 1.18, a: 1, o: 0.84, u: 0.74 };
  function robotWords(text) {
    const base = G.voice === 'high' ? 1050 : G.voice === 'low' ? 330 : 620, pace = G.voice === 'high' ? 0.85 : G.voice === 'low' ? 1.25 : 1;
    const plain = String(text || '').slice(0, 160).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const out = [];
    for (const word of plain.split(/\s+/)) {
      const end = (/[.,!?;:]+$/.exec(word) || [''])[0], letters = word.replace(/[^a-z0-9]/g, '');
      if (!letters) continue;
      // Lettergrepen ruwweg: een groep klinkers met de medeklinkers erna. Klinker bepaalt de toon.
      const groups = letters.match(/[aeiouy]+[^aeiouy]*/g) || [letters];
      groups.forEach((g, i) => {
        let h = 0;
        for (const c of g) h = (h * 31 + c.charCodeAt(0)) % 997;   // zelfde zin klinkt altijd hetzelfde
        let f = base * (VOWEL_PITCH[g[0]] || 0.95) * (0.92 + (h % 17) / 100);
        const ms = (70 + 10 * Math.min(3, g.length - 1)) * pace, last = i === groups.length - 1;
        if (last && end.includes('!')) f *= 1.15;
        if (last && end.includes('?')) out.push([f, ms * 0.5], [f * 1.15, ms * 0.4], [f * 1.35, ms * 0.6]);   // vraag: toon omhoog
        else out.push([f * 0.9, ms * 0.35], [f, ms * 0.65]);
        out.push([0, 25]);
      });
      out.push([0, !end ? 80 : end.includes(',') ? 200 : 300]);
      if (out.length > 280) break;
    }
    while (out.length && !out[out.length - 1][0]) out.pop();
    return out.map(([f, ms]) => [f ? Math.round(clamp(f, 120, 4000)) : 0, Math.max(10, Math.round(ms))]);
  }
  let mouth = null;
  function endMouth() { if (!mouth) return; clearInterval(mouth); mouth = null; showFace('smile'); }
  function talk(text) {
    const notes = robotWords(text);
    if (!notes.length) return 0;
    endMouth();
    const ms = play(notes);
    if (!linked()) return ms;
    const frames = ['mOpen', 'mHalf', 'mShut', 'mHalf'], until = performance.now() + ms;
    let i = 0;
    showFace(frames[i++]);
    mouth = setInterval(() => {
      if (performance.now() > until || !linked()) { endMouth(); return; }
      showFace(frames[i++ % 4]);
    }, 160);
    return ms;
  }
  $('btnSay').addEventListener('click', () => { buzz(10); talk($('inpSay').value); });
  $('inpSay').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); talk($('inpSay').value); } });
  [1, 2, 3, 4].forEach((i) => {
    const b = el('button', 'btn sm');
    b.dataset.i18n = 'phrase.' + i; $('phrases').appendChild(b);
    b.addEventListener('click', () => { buzz(10); talk(t('phrase.' + i)); });
  });

  /* piano: één octaaf, opnemen en terugspelen */
  const KEYS = ['C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5'];
  (function renderPiano() {
    const box = $('piano');
    let white = 0;
    for (const k of KEYS) {
      const black = k.includes('#'), b = el('div', black ? 'bkey' : 'wkey');
      b.dataset.note = k;
      if (black) b.style.left = 'calc((100% + 4px) / 8 * ' + white + ' - 2px)';
      else { b.textContent = k[0]; white++; }
      box.appendChild(b);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const f = freqOf(k);
        play([[f, 320]]); buzz(8);
        b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 160);
        if (st.songRec) st.songRec.push([f, performance.now()]);
      });
    }
  })();
  function songNotes(song) {
    const out = [];
    for (const [f, ms] of song) { const on = Math.min(ms - 30, 450); out.push([f, on], [0, ms - on]); }
    return out;
  }
  $('btnSongRec').addEventListener('click', () => {
    buzz(10);
    if (!st.songRec) {
      st.songRec = []; $('btnSongRec').textContent = t('piano.stopRec'); $('btnSongRec').classList.add('rec');
      toast(t('piano.recording'), 'ok'); sfx.tick();
      return;
    }
    const r = st.songRec;
    st.songRec = null; $('btnSongRec').textContent = t('piano.rec'); $('btnSongRec').classList.remove('rec');
    if (!r.length) { toast(t('piano.empty'), 'warn'); return; }
    G.song = r.slice(0, 200).map(([f, at], i) => [f, clamp(Math.round(i + 1 < r.length ? r[i + 1][1] - at : 500), 120, 1500)]);
    save(); syncSettings(); toast(t('piano.saved', G.song.length), 'ok'); sfx.open();
  });
  $('btnSongPlay').addEventListener('click', () => { buzz(10); if (!G.song.length) { toast(t('piano.empty'), 'warn'); return; } play(songNotes(G.song), 'note'); });
  $('btnQuiet').addEventListener('click', () => { quiet(); sfx.tick(); });

  /* bewegen: dansjes en een opgenomen route, gereden in het scherm Rijden */
  function banner(text, btnText, rec) {
    const b = $('banner');
    if (!text) { b.classList.remove('on', 'rec'); return; }
    $('bannerText').textContent = text; $('bannerBtn').textContent = btnText;
    b.classList.toggle('rec', !!rec); b.classList.add('on');
  }
  $('bannerBtn').addEventListener('click', () => { if (st.rec) finishRec(); else emergencyStop(); });
  // Danspassen als [links, rechts, ms] (-1..1 van de dans-snelheid), omgezet naar één stap per 50 ms.
  const DANCES = {
    dance1: { song: 'C5:1 R:1 G4:1 R:1 C5:1 E5:1 G5:2 R:1 G4:1 C5:1 E5:1 D5:2 R:2', eighth: 140,
      moves: [[-1, 1, 350], [1, -1, 350], [-1, 1, 350], [1, -1, 350], [1, 1, 600], [-1, -1, 600], [-1, 1, 250], [1, -1, 250], [-1, 1, 250], [1, -1, 250], [0, 0, 200]] },
    dance2: { song: 'G4:1 B4:1 D5:1 G5:1 R:1 D5:1 G5:2 R:2 E5:1 C5:1 A4:1 C5:1 D5:4 R:2', eighth: 130,
      moves: [[1, -1, 1500], [0, 0, 200], [-1, 1, 1500], [0, 0, 200], [1, 1, 400], [-1, -1, 400], [1, 0.2, 1200], [0, 0, 200]] },
  };
  function danceSteps(moves) {
    const a = Math.max(30, Math.round(S.speed * 0.8)), steps = [];
    for (const [l, r, ms] of moves) for (let i = 0; i < Math.round(ms / 50); i++) steps.push([Math.round(l * a), Math.round(r * a)]);
    return steps;
  }
  function startMacro(name, steps, notes) {
    if (!needReady()) return;
    if (st.rec) finishRec();
    showView('viewDrive'); halt();
    st.macro = { name, steps, i: 0, music: !!notes };
    // Het deuntje herhalen zolang de dans duurt, maar hooguit 96 noten (vier korte berichten).
    if (notes) { const n = []; while (totalMs(n) < steps.length * 50 && n.length + notes.length <= 96) n.push(...notes); play(n.length ? n : notes, 'note'); }
    banner(t('move.playing', name), t('move.stop')); sfx.open();
  }
  function endMacro(done) {
    const m = st.macro;
    st.macro = null; banner(null);
    if (m.music && linked()) hub.text('hush').catch(() => {});
    if (done) { toast(t('move.end', m.name), 'ok'); sfx.ready(); }
  }
  [['btnDance1', 'dance1', 'move.dance1'], ['btnDance2', 'dance2', 'move.dance2']].forEach(([id, key, label]) => $(id).addEventListener('click', () => {
    buzz(10);
    const d = DANCES[key];
    startMacro(t(label), danceSteps(d.moves), melody(d.song, d.eighth));
  }));
  $('btnRoute').addEventListener('click', () => {
    buzz(10);
    if (!G.path.length) { toast(t('move.empty'), 'warn'); return; }
    startMacro(t('move.route'), G.path.map((x) => x.slice()), null);
  });
  $('btnRec').addEventListener('click', () => {
    buzz(10);
    if (!needReady()) return;
    showView('viewDrive'); halt();
    st.rec = []; banner(t('move.recording'), t('move.done'), true); sfx.tick();
  });
  function finishRec() {
    const r = st.rec;
    st.rec = null; banner(null);
    if (!r) return;
    while (r.length && !r[r.length - 1][0] && !r[r.length - 1][1]) r.pop();
    if (r.length < 4) { toast(t('move.short'), 'warn'); return; }
    r.push([0, 0]);
    G.path = r; save(); syncSettings();
    toast(t('move.saved', Math.round(r.length / 2) / 10), 'ok'); sfx.open();
  }

  /* ---------- code: programmeerblokken (Blockly) ---------- */
  const prog = () => G.programs.find((p) => p.id === G.progActive) || G.programs[0];
  let saveTimer = null;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); };
  const code = { ws: null, img: null, imgSet: null, loading: false, lit: {}, themes: {} };
  const CAT_COL = { event: '#1fa855', move: '#6a4cf5', motor: '#2f7cf6', light: '#d99a00', sound: '#d9408f', control: '#f2711c', sensor: '#0aa1bd', op: '#5aa832', var: '#d6336c' };
  function mixHex(a, b, f) {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const x = p(a), y = p(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * f).toString(16).padStart(2, '0')).join('');
  }
  const swatch = (c) => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="9" cy="9" r="7.5" fill="'
    + (c < 0 ? 'none' : SWATCH[c]) + '" stroke="#8a93a6" stroke-width="1.5"' + (c < 0 ? ' stroke-dasharray="2 2"' : '') + '/></svg>');
  function editorTheme() {
    const dark = G.theme === 'dark', name = 'hubremote-' + G.theme;
    if (code.themes[name]) return code.themes[name];
    const blockStyles = {}, categoryStyles = {};
    for (const [c, col] of Object.entries(CAT_COL)) {
      blockStyles['cat_' + c] = { colourPrimary: col, colourSecondary: mixHex(col, '#ffffff', 0.4), colourTertiary: mixHex(col, '#000000', 0.22) };
      blockStyles['cat_' + c + '_hat'] = Object.assign({ hat: 'cap' }, blockStyles['cat_' + c]);
      categoryStyles['cat_' + c] = { colour: col };
    }
    const comp = dark
      ? { workspaceBackgroundColour: '#11151b', toolboxBackgroundColour: '#191e26', toolboxForegroundColour: '#e8ecf3', flyoutBackgroundColour: '#202631', flyoutForegroundColour: '#e8ecf3', flyoutOpacity: 0.97, scrollbarColour: '#465063', insertionMarkerColour: '#ffffff', cursorColour: '#ffffff' }
      : { workspaceBackgroundColour: '#f6f8ff', toolboxBackgroundColour: '#ffffff', toolboxForegroundColour: '#1d2433', flyoutBackgroundColour: '#eef1fb', flyoutForegroundColour: '#1d2433', flyoutOpacity: 0.97, scrollbarColour: '#c3cbe0' };
    code.themes[name] = Blockly.Theme.defineTheme(name, { base: Blockly.Themes.Classic, blockStyles, categoryStyles, componentStyles: comp,
      fontStyle: { family: 'Fredoka, Nunito, sans-serif', weight: '600', size: 12 }, startHats: true });
    return code.themes[name];
  }
  // Veld met een 5x5-plaatje in het blok; tikken opent de plaatjeskiezer.
  class FieldPicture extends Blockly.Field {
    constructor(value, validator, config) { super(value || Cards.IMAGES.smile, validator, config); this.SERIALIZABLE = true; this.CURSOR = 'pointer'; }
    static fromJson(o) { return new FieldPicture(o.value); }
    doClassValidation_(v) { return typeof v === 'string' && /^[0-9]{25}$/.test(v) ? v : null; }
    initView() {
      this.size_ = new Blockly.utils.Size(34, 34);
      // In een eigen groep: Blockly kleurt rechthoeken die direct in een veld zitten wit.
      const g = Blockly.utils.dom.createSvgElement('g', {}, this.fieldGroup_);
      Blockly.utils.dom.createSvgElement('rect', { x: 0, y: 0, width: 34, height: 34, rx: 7, fill: '#14161c' }, g);
      this.px = [];
      for (let i = 0; i < 25; i++) this.px.push(Blockly.utils.dom.createSvgElement('rect', { x: 3.2 + (i % 5) * 5.7, y: 3.2 + Math.floor(i / 5) * 5.7, width: 4.5, height: 4.5, rx: 1.2, fill: '#ffd84d' }, g));
    }
    render_() {
      const v = this.getValue() || '';
      (this.px || []).forEach((r, i) => r.setAttribute('fill-opacity', String(0.13 + (0.87 * Math.max(0, v.charCodeAt(i) - 48)) / 9)));
      this.size_ = new Blockly.utils.Size(34, 34);
    }
    showEditor_() { openImg(this.getValue(), (img) => this.setValue(img)); }
    getText() { return '▦'; }
  }
  Blockly.fieldRegistry.register('field_picture', FieldPicture);
  function defineBlocks() {
    Blockly.setLocale(BlocklyMsg[curLang()] || BlocklyMsg.en);
    const defs = Cards.blockDefs(t, { song: SONGS.map((s) => [t('song.' + s[0]), s[0]]), mood: MOODS.map((m) => [t('mood.' + m[0]), m[0]]), swatch });
    defs.forEach((d) => { Blockly.Blocks[d.type] = { init() { this.jsonInit(d); } }; });
  }
  const varMap = () => code.ws.getVariableMap();
  function ensureEditor() {
    const div = $('blocklyDiv');
    if (code.ws) { resizeEditor(); return; }
    if (!div.getClientRects().length) return;   // nog niet in beeld: later
    defineBlocks();
    resizeEditor(true);
    const small = innerWidth < 600;
    code.ws = Blockly.inject(div, {
      // Geluidjes van de editor alleen via http(s); als los bestand blokkeert de browser ze.
      toolbox: Cards.toolbox(t), renderer: 'zelos', theme: editorTheme(), media: 'blockly-media/', trashcan: true, sounds: G.sound && location.protocol !== 'file:',
      zoom: { controls: true, wheel: false, pinch: true, startScale: small ? 0.72 : 0.85, maxScale: 2, minScale: 0.3, scaleSpeed: 1.15 },
      move: { scrollbars: true, drag: true, wheel: true },
    });
    code.ws.registerToolboxCategoryCallback('HR_VARS', () => [{ kind: 'button', text: t('code.makeVar'), callbackkey: 'HR_MAKE_VAR' }]
      .concat(Cards.varBlocks(varMap().getAllVariables().map((v) => ({ id: v.getId(), name: v.getName() })))));
    code.ws.registerButtonCallback('HR_MAKE_VAR', () => {
      const name = (window.prompt(t('code.varPrompt')) || '').trim().slice(0, 20);
      if (name && !varMap().getVariable(name)) varMap().createVariable(name);
      code.ws.refreshToolboxSelection();
    });
    code.ws.addChangeListener((e) => {
      if (code.loading || e.isUiEvent) return;
      prog().ws = Blockly.serialization.workspaces.save(code.ws); saveSoon();
    });
    loadWorkspace();
  }
  function loadWorkspace() {
    if (!code.ws) return;
    code.loading = true; code.lit = {};
    try { code.ws.clear(); Blockly.serialization.workspaces.load(prog().ws || {}, code.ws); }
    catch (e) { log(t('code.error', e.message), 'warn'); code.ws.clear(); }
    code.loading = false;
    // Pas centreren als de indeling klaar is (lettertypes, kolombreedte).
    setTimeout(showStart, 250);
  }
  // Het begin van het programma linksboven in beeld.
  function showStart() {
    if (!code.ws) return;
    Blockly.svgResize(code.ws);
    const b = code.ws.getTopBlocks(true)[0];
    if (!b) { code.ws.scrollCenter(); return; }
    const xy = b.getRelativeToSurfaceXY(), s = code.ws.scale;
    code.ws.scroll(24 - xy.x * s, 36 - xy.y * s);
  }
  // De editor vult op de telefoon het scherm onder de startbalk; op brede schermen een vaste hoogte.
  function resizeEditor(only) {
    const div = $('blocklyDiv'), wide = !$('tabbar').getClientRects().length || getComputedStyle($('tabbar')).display === 'none';
    const gap = parseFloat(getComputedStyle($('viewCode')).rowGap) || 12;
    const h = wide ? Math.max(380, Math.round(innerHeight * 0.62)) : Math.max(260, $('main').clientHeight - $('codebar').offsetHeight - gap * 3);
    div.style.height = h + 'px';
    if (!only && code.ws) Blockly.svgResize(code.ws);
  }
  function rebuildEditor() {
    if (!code.ws) return;
    prog().ws = Blockly.serialization.workspaces.save(code.ws);
    code.ws.dispose(); code.ws = null; $('blocklyDiv').textContent = '';
    ensureEditor();
  }
  window.addEventListener('resize', () => { if (code.ws) resizeEditor(); });
  // Verandert het vak van de editor (kolom, draaien van het scherm), dan tekent Blockly opnieuw.
  if (window.ResizeObserver) new ResizeObserver(() => { if (code.ws) Blockly.svgResize(code.ws); }).observe($('blocklyDiv'));
  function renderProgs() {
    const sel = $('selProg');
    sel.textContent = '';
    for (const p of G.programs) { const o = el('option'); o.value = p.id; o.textContent = p.name; sel.appendChild(o); }
    sel.value = prog().id;
  }
  function miniImg(img) {
    const g = el('span', 'mini');
    for (let i = 0; i < 25; i++) { const d = el('i'); d.style.opacity = String(0.12 + (0.88 * (img.charCodeAt(i) - 48)) / 9); g.appendChild(d); }
    return g;
  }

  /* plaatje kiezen of tekenen */
  function openImg(img, onDone) {
    code.img = img.split('').map((c) => (c === '0' ? 0 : 9)); code.imgSet = onDone;
    const pre = $('imgPresets'); pre.textContent = '';
    Object.keys(Cards.IMAGES).forEach((k) => {
      const b = el('button', 'imgbtn'); b.type = 'button'; b.appendChild(miniImg(Cards.IMAGES[k])); b.title = t('imgname.' + k); b.setAttribute('aria-label', t('imgname.' + k));
      b.addEventListener('click', () => { code.img = Cards.IMAGES[k].split('').map((c) => (c === '0' ? 0 : 9)); drawGrid(); sfx.tick(); });
      pre.appendChild(b);
    });
    drawGrid();
    $('imgSheet').classList.add('on'); $('imgSheet').setAttribute('aria-hidden', 'false'); sfx.open();
  }
  function drawGrid() {
    const g = $('imgGrid'); g.textContent = '';
    code.img.forEach((v, i) => {
      const b = el('button', 'px' + (v ? ' on' : '')); b.type = 'button'; b.dataset.i = i;
      b.addEventListener('click', () => { code.img[i] = code.img[i] ? 0 : 9; b.classList.toggle('on', !!code.img[i]); sfx.tick(); });
      g.appendChild(b);
    });
  }
  function closeImg(apply) {
    if (apply && code.imgSet) code.imgSet(code.img.join(''));
    $('imgSheet').classList.remove('on'); $('imgSheet').setAttribute('aria-hidden', 'true'); code.imgSet = null;
  }
  $('imgDone').addEventListener('click', () => closeImg(true));
  $('imgClear').addEventListener('click', () => { code.img.fill(0); drawGrid(); });
  $('imgSheet').addEventListener('click', (e) => { if (e.target === $('imgSheet')) closeImg(false); });

  /* programma's: nieuw, naam, weg */
  const emptyProgram = (name) => ({ id: Math.random().toString(36).slice(2, 9), name, ws: Cards.toBlocks(Cards.cleanProgram(null)) });
  $('selProg').addEventListener('change', (e) => { if (st.run) st.run.stop(); G.progActive = e.target.value; save(); loadWorkspace(); e.target.blur(); });
  $('btnProgNew').addEventListener('click', () => {
    if (st.run) st.run.stop();
    const names = new Set(G.programs.map((p) => p.name));
    let name = t('code.default'), n = 2;
    while (names.has(name)) name = t('code.default') + ' ' + n++;
    const p = emptyProgram(name);
    G.programs.push(p); G.progActive = p.id; save(); renderProgs(); loadWorkspace(); sfx.open();
  });
  $('btnProgRename').addEventListener('click', () => {
    const name = (window.prompt(t('code.renamePrompt'), prog().name) || '').trim().slice(0, 30);
    if (name) { prog().name = name; save(); renderProgs(); }
  });
  $('btnProgDel').addEventListener('click', () => {
    const b = $('btnProgDel');
    if (!b.classList.contains('sure')) { b.classList.add('sure'); b.textContent = t('code.deleteSure'); setTimeout(() => { b.classList.remove('sure'); b.textContent = t('code.delete'); }, 3000); return; }
    b.classList.remove('sure'); b.textContent = t('code.delete');
    if (st.run) st.run.stop();
    G.programs = G.programs.filter((p) => p.id !== prog().id);
    if (!G.programs.length) G.programs.push(emptyProgram(t('code.default')));
    G.progActive = G.programs[0].id; save(); renderProgs(); loadWorkspace(); sfx.stop();
  });

  /* uitvoeren: de blokken sturen de hub aan via de rijlus en losse hubopdrachten */
  st.prog = { l: 0, r: 0, ports: {}, lp: null, rp: null };
  st.btn = { L: 0, R: 0 }; st.imu = null; st.motorData = {};
  const progPorts = () => ({ l: st.prog.lp || S.left, r: st.prog.rp || S.right });
  // Nul-snelheden meteen versturen, zodat ze vóór een beweging over graden op de hub aankomen.
  function syncOut() {
    const out = outputs();
    for (const p in st.lastSent) if (!(p in out) && st.lastSent[p] !== 0) out[p] = 0;
    const text = textOf(out);
    st.lastSent = out; st.lastText = text; st.lastAt = performance.now();
    return hub.text(text).catch(() => {});
  }
  // Wachten tot een beweging over graden klaar is: op de motorpositie als de hub die meldt, anders op de verwachte tijd.
  function waitMove(moves, est) {
    const t0 = performance.now(), known = moves.every((m) => st.motorData[m.port]);
    const goals = moves.map((m) => ({ port: m.port, goal: known ? st.motorData[m.port].pos + m.deg : 0 }));
    return new Promise((resolve) => {
      const check = () => {
        const dt = performance.now() - t0;
        const there = known && dt > 150 && goals.every((g) => st.motorData[g.port] && Math.abs(st.motorData[g.port].pos - g.goal) <= 6);
        if (!st.run || there || dt > (known ? est * 2.5 + 800 : est + 150)) resolve();
        else setTimeout(check, 30);
      };
      setTimeout(check, 30);
    });
  }
  let imgPending = null, imgTimer = null;
  const io = {
    now: () => performance.now(), random: Math.random, sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    data: () => {
      const s = st.sensors || [], dist = s.find((x) => x.type === 'distance'), cols = s.filter((x) => x.type === 'color'), f = s.find((x) => x.type === 'force');
      const colors = {};
      cols.forEach((c) => { colors[c.port] = c.color; });
      return { dist: dist ? dist.mm : null, force: f ? { v: f.value, pressed: f.pressed } : null, light: cols[0] ? Math.min(100, Math.round((cols[0].r + cols[0].g + cols[0].b) / 30.72)) : null,
        color: cols[0] ? cols[0].color : null, colors, imu: st.imu, motors: st.motorData, btn: st.btn };
    },
    ports: () => ({ l: S.left, r: S.right }),
    setPorts: (l, r) => { st.prog.lp = l; st.prog.rp = r; },
    drive: (l, r) => { st.prog.l = l; st.prog.r = r; },
    motor: (p, pct) => { st.prog.ports[p] = Math.round(pct); },
    moveDeg: async (dl, sl, dr, sr) => {
      st.prog.l = st.prog.r = 0; st.cur.l = st.cur.r = 0;
      const pp = progPorts(), moves = [];
      if (dl) moves.push({ port: pp.l, deg: dl * (S.invL ? -1 : 1), pct: Math.round(sl) });
      if (dr && pp.r !== pp.l) moves.push({ port: pp.r, deg: dr * (S.invR ? -1 : 1), pct: Math.round(sr) });
      if (!moves.length) return;
      await syncOut();
      hub.text('deg ' + moves.map((m) => m.port + ':' + m.deg + ':' + m.pct).join(' ')).catch(() => {});
      await waitMove(moves, Math.max(...moves.map((m) => (Math.abs(m.deg) * 100) / Math.max(5, m.pct))));
    },
    motorDeg: async (p, deg, pct) => {
      st.prog.ports[p] = 0;
      await syncOut();
      hub.text('deg ' + p + ':' + deg + ':' + Math.round(pct)).catch(() => {});
      await waitMove([{ port: p, deg }], (Math.abs(deg) * 100) / Math.max(5, pct));
    },
    motorGoto: async (p, pos, pct, way) => {
      st.prog.ports[p] = 0;
      await syncOut();
      hub.text('goto ' + p + ' ' + pos + ' ' + Math.round(pct) + ' ' + way).catch(() => {});
      const t0 = performance.now(), est = 36000 / Math.max(5, pct);
      await new Promise((resolve) => {
        const check = () => {
          const m = st.motorData[p], d = m ? Math.abs((((m.abs - pos) % 360) + 540) % 360 - 180) : 999;
          if (!st.run || (performance.now() - t0 > 150 && d <= 5) || performance.now() - t0 > est + 800) resolve(); else setTimeout(check, 30);
        };
        setTimeout(check, 30);
      });
    },
    send: (text) => { if (linked()) hub.text(text).catch(() => {}); },
    tune: (notes) => { if (linked()) sendNotes(notes); else playLocal(notes); },
    img: (s) => {
      imgPending = s;
      if (imgTimer) return;
      const flush = () => { imgTimer = null; if (imgPending && linked()) hub.text('img ' + imgPending).catch(() => {}); imgPending = null; };
      flush(); imgTimer = setTimeout(() => { imgTimer = null; if (imgPending) io.img(imgPending); }, 60);
    },
    song: (id) => { const s = SONGS.find((x) => x[0] === id) || SONGS[0]; return melody(s[3], s[2]); },
    freq: (n) => freqOf(n),
    mood: (id) => { const [n, face] = moodNotes(id); return play(n, face); },
    talk: (text) => talk(text),
    // Het blok dat nu bezig is laten oplichten (één per spoor).
    active: (si, i) => {
      if (!code.ws) return;
      const lit = (id, on) => { try { code.ws.highlightBlock(id, on); } catch (e) {} };
      if (si < 0) { Object.values(code.lit).forEach((id) => lit(id, false)); code.lit = {}; return; }
      if (code.lit[si]) { lit(code.lit[si], false); delete code.lit[si]; }
      const c = st.runProg && st.runProg.stacks[si] && st.runProg.stacks[si][i];
      if (i >= 0 && c && c.id) { lit(c.id, true); code.lit[si] = c.id; }
    },
    warn: (k, detail) => { const m = k === 'noImu' ? t('code.noImu') : t('code.error', detail || k); toast(m, 'warn'); log(m, 'warn'); },
    stopAll: () => {
      st.prog = { l: 0, r: 0, ports: {}, lp: null, rp: null }; st.cur.l = st.cur.r = 0;
      endMouth();
      if (linked()) { syncOut(); hub.text('halt').catch(() => {}); hub.request(Proto.deviceNotificationRequest(200), 0x29, 2000).catch(() => {}); }
    },
    done: () => {
      const r = st.run; st.run = null;
      document.body.classList.remove('running'); $('codeStatus').textContent = '';
      if (r && r.stopped) { log(t('code.stopped')); } else { toast(t('code.done'), 'ok'); log(t('code.done'), 'ok'); sfx.ready(); }
    },
  };
  function runProgram() {
    if (st.run || !needReady()) return;
    const p = Cards.fromBlocks(code.ws ? Blockly.serialization.workspaces.save(code.ws) : prog().ws, prog().name);
    if (p.empty) { toast(t('code.noHat'), 'warn'); sfx.err(); return; }
    halt();
    st.runProg = p;
    st.prog = { l: 0, r: 0, ports: {}, lp: null, rp: null };
    const r = new Cards.Runner(p, io);
    st.run = r;
    const stop = r.stop.bind(r);
    r.stop = () => { r.stopped = true; stop(); };
    document.body.classList.add('running');
    $('codeStatus').textContent = t(p.stacks.some((s) => s[0].t !== 'start') ? 'code.listening' : 'code.running');
    hub.request(Proto.deviceNotificationRequest(50), 0x29, 2000).catch(() => {});
    sfx.ready(); buzz(15);
    r.start();
  }
  $('btnRun').addEventListener('click', runProgram);
  $('btnProgStop').addEventListener('pointerdown', (e) => { e.preventDefault(); emergencyStop(); });

  /* ---------- tabs ---------- */
  const tabs = qsa('.tab');
  function showView(id) {
    if (st.view === id) return;
    const old = $(st.view), nw = $(id);
    if (st.rec && id !== 'viewDrive') finishRec();
    st.view = id; halt();
    tabs.forEach((tb, i) => { const on = tb.dataset.view === id; tb.classList.toggle('on', on); if (on) $('tabbar').style.setProperty('--i', i); });
    if (id === 'viewLog') $('logDot').classList.remove('on');
    old.classList.add('leave');
    setTimeout(() => {
      old.classList.remove('active', 'leave'); nw.classList.add('active', 'enter'); $('main').scrollTop = 0;
      setTimeout(() => nw.classList.remove('enter'), 260);
      if (id === 'viewLog') logEl.scrollTop = logEl.scrollHeight;
      if (id === 'viewCode') ensureEditor();
    }, 110);
  }
  tabs.forEach((tb) => tb.addEventListener('click', () => { sfx.tab(); buzz(8); showView(tb.dataset.view); }));

  /* ---------- profielen ---------- */
  function uniqueName(base) {
    const names = new Set(G.profiles.map((p) => p.name));
    if (!names.has(base)) return base;
    for (let i = 2; ; i++) if (!names.has(base + ' ' + i)) return base + ' ' + i;
  }
  function fillProfiles() {
    const sel = $('selProfile');
    sel.textContent = '';
    for (const p of G.profiles) { const o = el('option'); o.value = p.id; o.textContent = p.name; sel.appendChild(o); }
    sel.value = S.id;
  }
  function switchProfile(id) {
    const p = G.profiles.find((x) => x.id === id);
    if (!p) return;
    halt(); S = p; G.active = p.id; save();
    fillProfiles(); renderAuxSettings(); syncSettings();
  }
  // Compacte code van een profiel voor in een link of QR.
  function encodeProfile(p) {
    const arr = [1, p.name, p.left, p.right, +p.invL, +p.invR, p.speed, p.turn, p.trim, +p.guard, p.guardCm];
    for (const a of p.aux) arr.push(a.port, a.name, a.speed, a.mode === 'grip' ? 1 : a.mode === 'toggle' ? 2 : 0, a.travel);
    let bin = '';
    enc.encode(JSON.stringify(arr)).forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeProfile(code) {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const a = JSON.parse(dec.decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    if (!Array.isArray(a) || a[0] !== 1 || a.length < 21) throw new Error('bad');
    const aux = [0, 1].map((i) => { const o = 11 + i * 5; return { port: a[o], name: a[o + 1], speed: a[o + 2], mode: a[o + 3] === 1 ? 'grip' : a[o + 3] === 2 ? 'toggle' : 'hold', travel: a[o + 4] }; });
    return cleanProfile({ name: a[1], left: a[2], right: a[3], invL: a[4] === 1, invR: a[5] === 1, speed: a[6], turn: a[7], trim: a[8], guard: a[9] === 1, guardCm: a[10], aux, userPorts: true });
  }
  function importFromHash() {
    const m = /^#p=([\w-]+)$/.exec(location.hash);
    if (!m) return null;
    let note;
    try {
      const p = decodeProfile(m[1]);
      const same = G.profiles.find((x) => encodeProfile(x) === encodeProfile(p));
      if (same) { S = same; G.active = same.id; }
      else { p.name = uniqueName(p.name); G.profiles.push(p); S = p; G.active = p.id; }
      save(); note = [t('share.added', S.name), 'ok'];
    } catch (e) { note = [t('share.bad'), 'err']; }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    return note;
  }
  function shareUrl() { return location.href.split('#')[0] + '#p=' + encodeProfile(S); }
  function openShare() {
    const url = shareUrl(), local = location.protocol === 'file:';
    $('shareTitle').textContent = t('share.title', S.name);
    $('shareLink').value = url;
    $('shareNote').textContent = t(local ? 'share.offline' : 'share.note');
    const box = $('qr');
    box.textContent = ''; box.classList.toggle('off', local);
    if (!local) {
      try {
        const q = qrcode(0, 'M'); q.addData(url); q.make();
        const n = q.getModuleCount();
        let d = '';
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        svg.setAttribute('viewBox', '0 0 ' + n + ' ' + n); svg.setAttribute('shape-rendering', 'crispEdges'); svg.dataset.modules = n;
        path.setAttribute('d', d); path.setAttribute('fill', '#0d1014'); svg.appendChild(path); box.appendChild(svg);
      } catch (e) { box.classList.add('off'); }
    }
    $('btnNativeShare').style.display = navigator.share ? '' : 'none';
    $('sheet').classList.add('on'); $('sheet').setAttribute('aria-hidden', 'false'); sfx.open();
  }
  function closeShare() {
    if (!$('sheet').classList.contains('on')) return;
    $('sheet').classList.remove('on'); $('sheet').setAttribute('aria-hidden', 'true'); sfx.tick();
  }
  $('btnShare').addEventListener('click', () => { buzz(10); openShare(); });
  $('btnCloseShare').addEventListener('click', closeShare);
  $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeShare(); });
  $('btnCopy').addEventListener('click', () => {
    const done = () => { toast(t('share.copied'), 'ok'); sfx.tick(); buzz(10); };
    const fallback = () => { const i = $('shareLink'); i.focus(); i.select(); try { if (document.execCommand('copy')) done(); } catch (e) {} };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText($('shareLink').value).then(done).catch(fallback);
    else fallback();
  });
  $('btnNativeShare').addEventListener('click', () => { navigator.share({ title: 'Hub Remote', text: S.name, url: $('shareLink').value }).catch(() => {}); });
  $('selProfile').addEventListener('change', (e) => { sfx.tick(); switchProfile(e.target.value); e.target.blur(); });
  $('inpName').addEventListener('input', (e) => {
    S.name = e.target.value.slice(0, 30).trim() || t('profile.default'); save();
    const o = $('selProfile').selectedOptions[0]; if (o) o.textContent = S.name;
  });
  $('btnNew').addEventListener('click', () => {
    const p = newProfile(uniqueName(t('profile.default')));
    G.profiles.push(p); sfx.open(); buzz(10); switchProfile(p.id);
  });
  let delTimer = null;
  $('btnDelete').addEventListener('click', () => {
    const b = $('btnDelete');
    if (!b.classList.contains('sure')) {
      // Eerste tik vraagt om bevestiging, tweede tik verwijdert.
      b.classList.add('sure'); setText(b, t('set.deleteSure')); sfx.tick();
      delTimer = setTimeout(() => { b.classList.remove('sure'); setText(b, t('set.delete')); }, 3000);
      return;
    }
    clearTimeout(delTimer); b.classList.remove('sure'); setText(b, t('set.delete'));
    G.profiles = G.profiles.filter((p) => p.id !== S.id);
    if (!G.profiles.length) G.profiles = [newProfile(t('profile.default'))];
    sfx.stop(); buzz(20); switchProfile(G.profiles[0].id);
  });

  /* ---------- instellingen-UI ---------- */
  function fill(sel, items) { const v = sel.value; sel.textContent = ''; for (const [val, txt] of items) { const o = el('option'); o.value = val; o.textContent = txt; sel.appendChild(o); } if (v) sel.value = v; }
  const portItems = () => PORTS.map((p) => [p, t('port', p)]);
  function fillStatic() {
    fill($('selLeft'), portItems()); fill($('selRight'), portItems());
    fill($('selSlot'), Array.from({ length: 20 }, (_, i) => [String(i), t('slot', i)]));
    fill($('selLang'), [['auto', t('lang.auto')], ['nl', 'Nederlands'], ['en', 'English']]);
    fill($('selTheme'), [['light', t('theme.light')], ['dark', t('theme.dark')]]);
    fill($('selVoice'), [['normal', t('voice.normal')], ['high', t('voice.high')], ['low', t('voice.low')]]);
  }

  function renderAuxSettings() {
    const box = $('auxSettings');
    box.textContent = '';
    S.aux.forEach((a, i) => {
      const wrap = el('div', 'auxwrap');
      wrap.innerHTML =
        '<div class="auxset">' +
        '<label class="f"><span></span><select data-k="port"></select></label>' +
        '<label class="f"><span></span><input type="text" data-k="name" maxlength="20" autocomplete="off" spellcheck="false"></label>' +
        '<label class="f"><span></span><select data-k="mode"></select></label>' +
        '<label class="f"><span></span><div class="range"><input type="range" data-k="speed" min="10" max="100" step="5"><output></output></div></label>' +
        '</div><div class="fold"><div class="auxset">' +
        '<label class="f"><span></span><div class="range"><input type="range" data-k="travel" min="-720" max="720" step="5"><output></output></div></label>' +
        '<div class="f"><span></span><div class="rowbtns"><button class="btn sm jog" data-dir="-1"></button><button class="btn sm jog" data-dir="1"></button><button class="btn sm zero"></button></div></div>' +
        '<p class="small span2" style="margin:0"></p></div></div>';
      const labels = qsa('label.f > span, div.f > span', wrap);
      [t('aux.n', i + 1), t('aux.name'), t('aux.mode'), t('aux.speed'), t('aux.travel'), t('aux.jog')].forEach((txt, j) => { labels[j].textContent = txt; });
      const q = (sel) => wrap.querySelector(sel), port = q('[data-k="port"]'), name = q('[data-k="name"]'), mode = q('[data-k="mode"]'), speed = q('[data-k="speed"]'), travel = q('[data-k="travel"]');
      fill(port, [['-', t('aux.off')]].concat(portItems())); fill(mode, [['hold', t('aux.hold')], ['toggle', t('aux.toggle')], ['grip', t('aux.grip')]]);
      name.placeholder = t('aux.namePh'); q('p').textContent = t('aux.gripHelp'); q('.zero').textContent = t('aux.zero');
      const jogs = qsa('.jog', wrap); jogs[0].textContent = t('aux.minus'); jogs[1].textContent = t('aux.plus');
      const show = () => {
        port.value = a.port; name.value = a.name; mode.value = a.mode; speed.value = a.speed; travel.value = a.travel;
        speed.nextElementSibling.textContent = a.speed + '%'; travel.nextElementSibling.textContent = a.travel + '°';
        q('.fold').classList.toggle('on', a.mode === 'grip' && a.port !== '-');
      };
      const changed = () => { save(); show(); renderAux(); };
      port.addEventListener('change', () => { a.port = port.value; st.aux[i] = 0; sfx.tick(); changed(); port.blur(); });
      mode.addEventListener('change', () => { a.mode = mode.value; st.aux[i] = 0; sfx.tick(); changed(); mode.blur(); });
      name.addEventListener('input', () => { a.name = name.value.slice(0, 20); save(); renderAux(); });
      speed.addEventListener('input', () => { a.speed = +speed.value; changed(); });
      travel.addEventListener('input', () => { a.travel = +travel.value; changed(); });
      jogs.forEach((b) => bindHold(b, i, +b.dataset.dir, 'jog'));
      q('.zero').addEventListener('click', () => {
        const p = auxPorts()[i];
        if (!p || !needReady()) return;
        hub.text('zero ' + p).catch(() => {});
        toast(t('msg.zeroSet', auxName(i)), 'ok'); sfx.open(); buzz(15);
      });
      show(); box.appendChild(wrap);
    });
  }

  function syncSettings() {
    $('inpName').value = S.name;
    $('selLeft').value = S.left; $('selRight').value = S.right; $('chkInvL').checked = S.invL; $('chkInvR').checked = S.invR;
    $('rngSpeed').value = S.speed; $('outSpeed').textContent = S.speed + '%';
    $('rngTurn').value = S.turn; $('outTurn').textContent = S.turn + '%';
    $('rngTrim').value = S.trim; $('outTrim').textContent = S.trim === 0 ? '0' : (S.trim < 0 ? 'L ' : 'R ') + Math.abs(S.trim) + '%';
    $('chkGuard').checked = S.guard; $('rngGuard').value = S.guardCm; $('outGuard').textContent = S.guardCm + ' cm';
    $('selSlot').value = String(G.slot); $('selLang').value = G.lang === 'nl' || G.lang === 'en' ? G.lang : 'auto';
    $('chkSound').checked = G.sound; $('chkHaptic').checked = G.haptic; $('selTheme').value = G.theme;
    $('rngVol').value = G.hubVol; $('outVol').textContent = G.hubVol + '%'; $('chkReact').checked = G.react; $('selVoice').value = G.voice;
    $('btnRoute').disabled = !G.path.length; $('btnSongPlay').disabled = !G.song.length;
    $('warnPorts').classList.toggle('on', S.left === S.right);
    renderAux();
  }
  const bind = (id, ev, fn) => $(id).addEventListener(ev, (e) => { fn(e.target); save(); syncSettings(); if (e.target.tagName === 'SELECT') e.target.blur(); });
  bind('selLeft', 'change', (n) => { S.left = n.value; S.userPorts = true; sfx.tick(); });
  bind('selRight', 'change', (n) => { S.right = n.value; S.userPorts = true; sfx.tick(); });
  bind('chkInvL', 'change', (n) => { S.invL = n.checked; sfx.tick(); buzz(10); });
  bind('chkInvR', 'change', (n) => { S.invR = n.checked; sfx.tick(); buzz(10); });
  bind('rngSpeed', 'input', (n) => { S.speed = +n.value; });
  bind('rngTurn', 'input', (n) => { S.turn = +n.value; });
  bind('rngTrim', 'input', (n) => { S.trim = +n.value; });
  bind('chkGuard', 'change', (n) => { S.guard = n.checked; sfx.tick(); buzz(10); });
  bind('rngGuard', 'input', (n) => { S.guardCm = +n.value; });
  bind('selSlot', 'change', (n) => { G.slot = +n.value; sfx.tick(); if (st.phase !== 'idle') log(t('msg.slotLater'), 'warn'); });
  bind('chkSound', 'change', (n) => { G.sound = n.checked; sfx.tick(); });
  bind('chkHaptic', 'change', (n) => { G.haptic = n.checked; sfx.tick(); buzz(20); });
  bind('rngVol', 'input', (n) => { G.hubVol = +n.value; if (st.phase === 'ready') hub.text('vol ' + G.hubVol).catch(() => {}); });
  bind('chkReact', 'change', (n) => { G.react = n.checked; sfx.tick(); buzz(10); });
  bind('selVoice', 'change', (n) => { G.voice = n.value; sfx.tick(); });
  function applyTheme() {
    document.documentElement.dataset.theme = G.theme;
    $('themeColor').setAttribute('content', G.theme === 'dark' ? '#161b22' : '#ffffff');
    if (code.ws) code.ws.setTheme(editorTheme());
  }
  $('selTheme').addEventListener('change', (e) => { G.theme = e.target.value === 'dark' ? 'dark' : 'light'; save(); sfx.tick(); applyTheme(); e.target.blur(); });
  $('selLang').addEventListener('change', (e) => { G.lang = e.target.value; save(); sfx.tick(); applyLang(); e.target.blur(); });
  // Motortest: laat één aandrijfmotor kort "vooruit" draaien om poort en draairichting te controleren.
  [['btnTestL', 'l'], ['btnTestR', 'r']].forEach(([id, side]) => $(id).addEventListener('click', (e) => {
    e.preventDefault();
    if (!needReady()) return;
    st.test = { side, until: performance.now() + 700 };
    toast(t('msg.testing', side === 'l' ? S.left : S.right), 'ok'); sfx.tick(); buzz(15);
  }));
  $('btnClear').addEventListener('click', () => { logEl.textContent = ''; sfx.tick(); });
  $('btnConnect').addEventListener('click', () => { sfx.tick(); buzz(10); if (st.phase === 'stopped') restart(); else if (st.phase === 'idle') connect(); });
  $('btnDisconnect').addEventListener('click', () => { sfx.tick(); buzz(10); disconnect(); });

  /* ---------- taal ---------- */
  function applyLang() {
    document.documentElement.lang = curLang();
    qsa('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
    qsa('[data-i18n-title]').forEach((n) => { n.title = t(n.dataset.i18nTitle); });
    qsa('[data-i18n-aria]').forEach((n) => { n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
    qsa('[data-i18n-ph]').forEach((n) => { n.placeholder = t(n.dataset.i18nPh); });
    $('playWhere').textContent = t(st.phase === 'ready' ? 'play.hub' : 'play.phone');
    if (st.songRec) $('btnSongRec').textContent = t('piano.stopRec');
    $('pillText').dataset.t = ''; $('btnConnectText').dataset.t = ''; $('hint').dataset.t = '';
    phaseTexts(); setText($('hint'), t(...st.hint));
    fillStatic(); fillProfiles(); renderAuxSettings(); syncSettings(); showChips(); renderProgs(); rebuildEditor();
    showSensors(st.sensors);
    showBle();
  }
  function showBle() {
    if (navigator.bluetooth) return;
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const msg = t(!window.isSecureContext ? 'ble.insecure' : ios ? 'ble.ios' : /Android/.test(ua) ? 'ble.android' : 'ble.other');
    $('noBle').textContent = msg; $('noBle').classList.add('on');
    return msg;
  }

  // App-gedrag: geen pinch- of dubbeltik-zoom, geen contextmenu.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => { if (!e.target.closest('#log') && e.target.tagName !== 'INPUT') e.preventDefault(); });
  window.addEventListener('pagehide', () => { try { if (hub.connected) hub.text(zeroText()); } catch (e) {} });
  // Hoogte van de kop bijhouden voor de indeling op half dichtgeklapte vouwtelefoons.
  const setHeaderH = () => document.documentElement.style.setProperty('--header-h', $('header').offsetHeight + 'px');
  setHeaderH(); window.addEventListener('resize', setHeaderH);
  window.addEventListener('hashchange', () => { const n = importFromHash(); if (n) { applyLang(); toast(n[0], n[1]); } });

  const imported = importFromHash();
  applyTheme(); applyLang(); setPhase('idle'); setMode(G.mode); save();
  const bleMsg = showBle();
  if (bleMsg) log(bleMsg, 'warn'); else log(t('msg.ready'));
  if (imported) setTimeout(() => { toast(imported[0], imported[1]); log(imported[0], imported[1] === 'err' ? 'err' : 'ok'); }, 300);

  // Brede schermen tonen de code meteen naast het rijden.
  ensureEditor();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
