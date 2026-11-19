// Leest een LDraw-model (.ldr of .mpd, bijvoorbeeld geëxporteerd uit BrickLink Studio) en telt de
// SPIKE-elektronica erin. Alleen de onderdeelnummers worden gelezen; er wordt niets getekend.
// Kabels staan niet in LDraw, dus de poorten zijn een voorstel. Geen DOM: ook in node te testen.
const LDraw = (() => {
  // Onderdeelnummers uit de officiële LDraw-bibliotheek (met varianten zoals c01 = met kabel, p01 = met print),
  // plus de BrickLink-nummers die Studio soms gebruikt.
  const KINDS = [
    [/^(45601|67718|53444)/, 'hub6'],          // 6-poorts hub (SPIKE Prime; ook die van Robot Inventor)
    [/^67351/, 'hub2'],                        // 2-poorts hub (SPIKE Essential)
    [/^(54675|69730)/, 'motorL'],              // grote hoekmotor
    [/^54696/, 'motorM'],                      // middelgrote hoekmotor
    [/^68488/, 'motorS'],                      // kleine hoekmotor (Essential)
    [/^37308/, 'color'], [/^37316/, 'distance'], [/^37312/, 'force'],
    [/^47592/, 'matrix'],                      // 3x3-lichtmatrix (Essential)
    [/^(22127|85824|28738|103479|bb0961|bb0892|bb1277)/, 'otherHub'],   // Powered Up-hubs zonder SPIKE-firmware
  ];
  const MOTORS = ['motorL', 'motorM', 'motorS'], SENSORS = ['color', 'distance', 'force', 'matrix'];
  function kindOf(file) {
    const base = file.toLowerCase().replace(/\\/g, '/').split('/').pop().replace(/\.(dat|ldr)$/, '');
    const hit = KINDS.find(([re]) => re.test(base));
    return hit ? hit[1] : null;
  }

  // Telt onderdelen; een .mpd heeft deelmodellen ("0 FILE naam") die vanuit het hoofdmodel meetellen.
  function parse(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('empty');
    const files = {}, order = [];
    let cur = null, title = '', skip = false, lines1 = 0;
    for (const raw of text.split(/\r?\n/)) {
      const l = raw.trim();
      let m = /^0\s+FILE\s+(.+)$/i.exec(l);
      if (m) { cur = m[1].trim().toLowerCase(); files[cur] = files[cur] || []; order.push(cur); skip = false; continue; }
      if (/^0\s+!?NOFILE\b/i.test(l)) { skip = true; continue; }
      if (skip) continue;
      if (cur === null) { cur = ''; files[cur] = []; order.push(cur); }
      if (!title) {
        m = /^0\s+(?:Name:\s*)?(.+)$/i.exec(l);
        if (m && !/^(!|FILE\b|Author:|BFC\b|STEP\b|ROTSTEP\b|\/\/|MLCAD\b|LPUB\b|GROUP\b)/i.test(m[1])) title = m[1].replace(/\.(ldr|mpd)$/i, '').trim();
      }
      m = /^1\s+\S+(?:\s+-?[\d.eE+-]+){12}\s+(.+)$/.exec(l);
      if (m) { files[cur].push(m[1].trim().toLowerCase().replace(/\\/g, '/')); lines1++; }
    }
    if (!lines1) throw new Error('noParts');
    const counts = {};
    let parts = 0;
    const walk = (name, depth) => {
      if (depth > 30) return;
      for (const ref of files[name] || []) {
        if (files[ref] && ref !== name) { walk(ref, depth + 1); continue; }
        parts++;
        const k = kindOf(ref);
        if (k) counts[k] = (counts[k] || 0) + 1;
      }
    };
    walk(order[0], 0);
    return { title: title.slice(0, 60), counts, parts };
  }

  // De officiële rijbases herkennen aan hun elektronica (de poorten staan dan in hun bouwinstructies).
  const n = (c, k) => c[k] || 0;
  const motorCount = (c) => MOTORS.reduce((a, k) => a + n(c, k), 0);
  function match(c) {
    const m = motorCount(c), sens = SENSORS.reduce((a, k) => a + n(c, k), 0);
    if (n(c, 'hub6') === 1) {
      if (m === 3 && sens === 0) return 'db';
      if (m === 3 && sens === 1 && n(c, 'color') === 1) return 'db3';
      if (n(c, 'motorL') === 2 && n(c, 'motorM') === 2 && sens === 2 && n(c, 'color') === 2) return 'adb';
    }
    if (n(c, 'hub2') === 1 && m === 2 && sens === 0) return 'ess';
    return '';
  }

  // Voorstel: twee gelijke motoren rijden (links A, rechts B), de rest van de motoren als extra motor,
  // daarna de sensoren op de vrije poorten.
  function suggest(c) {
    const small = !n(c, 'hub6') && (n(c, 'hub2') > 0 || n(c, 'motorS') > 0 || n(c, 'matrix') > 0);
    const free = small ? ['A', 'B'] : ['A', 'B', 'C', 'D', 'E', 'F'];
    const take = () => free.shift() || null;
    const order = small ? ['motorS', 'motorM', 'motorL'] : ['motorL', 'motorM', 'motorS'];
    const motors = [];
    order.forEach((k) => { for (let i = 0; i < n(c, k); i++) motors.push(k); });
    const driveType = order.find((k) => n(c, k) >= 2) || null;
    let drive = null;
    if (driveType) {
      motors.splice(motors.indexOf(driveType), 1); motors.splice(motors.indexOf(driveType), 1);
      drive = { type: driveType, left: take(), right: take() };
    }
    const aux = [], sens = {};
    let left = 0;
    for (const k of motors) { const p = aux.length < 2 ? take() : null; if (p) aux.push({ port: p, type: k }); else left++; }
    for (const k of SENSORS) for (let i = 0; i < n(c, k); i++) { const p = take(); if (p) sens[p] = k; else left++; }
    return { hub: small ? 'small' : 'big', drive, aux, sens, notPlaced: left, noHub: !n(c, 'hub6') && !n(c, 'hub2'), otherHub: n(c, 'otherHub') > 0, model: match(c) };
  }

  return { parse, suggest, match, kindOf, MOTORS, SENSORS };
})();
if (typeof module !== 'undefined') module.exports = LDraw;
