// Bouwplan-viewer: toont een LDraw-model (bijv. uit BrickLink Studio) stap voor stap in 3D.
// Wordt met esbuild samen met three.js gebundeld tot site/app/bricks/viewer.js en pas geladen als iemand
// een bouwplan opent. De bouwstenen komen uit ons eigen pakket (bricks/parts.pack, gemaakt door
// tools/ldraw_pack.py uit de LDraw-bibliotheek); er wordt niets van andere sites opgehaald.
import { WebGLRenderer, Scene, PerspectiveCamera, Box3, Vector3, Color, PMREMGenerator, SRGBColorSpace } from 'three';
import { LDrawLoader } from 'three/examples/jsm/loaders/LDrawLoader.js';
import { LDrawConditionalLineMaterial } from 'three/examples/jsm/materials/LDrawConditionalLineMaterial.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

let pack = null;   // naam (zoals verwezen, kleine letters) -> tekst

// Het pakket ophalen (gzip) en indexeren; onProgress krijgt 0..1.
async function loadPack(url, onProgress) {
  if (pack) return pack;
  const res = await fetch(url);
  if (!res.ok) throw new Error('pack ' + res.status);
  const total = +res.headers.get('content-length') || 0;
  let got = 0;
  const counting = new TransformStream({ transform(chunk, ctl) { got += chunk.length; if (total && onProgress) onProgress(Math.min(1, got / total)); ctl.enqueue(chunk); } });
  const text = await new Response(res.body.pipeThrough(counting).pipeThrough(new DecompressionStream('gzip'))).text();
  const map = new Map();
  for (const sec of ('\n' + text).split('\n0 FILE ')) {
    if (!sec.trim()) continue;
    const nl = sec.indexOf('\n');
    map.set(sec.slice(0, nl).trim().toLowerCase(), sec.slice(nl + 1));
  }
  pack = map;
  return pack;
}

const refOf = (line) => { const t = line.trim().split(/\s+/); return t.length >= 15 && t[0] === '1' ? t.slice(14).join(' ').replace(/\\/g, '/') : null; };
const descOf = (name) => { const t = pack && pack.get(name.toLowerCase()); return t ? t.split('\n', 1)[0].replace(/^0\s+/, '').replace(/\s+/g, ' ').trim() : name; };

// Model + alle benodigde onderdelen uit het pakket tot één "packed" MPD-bestand. Onderdelen die er niet in
// zitten worden een grijs blok. Zonder STEP-regels maken we zelf stappen: van onder naar boven.
function packModel(src) {
  let text = src.replace(/\r\n?/g, '\n');
  // Plaatjes en andere data aan het eind van Studio-bestanden weglaten.
  text = text.replace(/\n0 !?NOFILE[\s\S]*?(?=\n0 FILE |$)/gi, '\n');
  if (!/^\s*0 FILE /i.test(text)) text = '0 FILE main.ldr\n' + text;
  const sections = ('\n' + text).split('\n0 FILE ').filter((s) => s.trim()).map((s) => { const nl = s.indexOf('\n'); return { name: s.slice(0, nl).trim(), body: nl < 0 ? '' : s.slice(nl + 1) }; });
  const own = new Set(sections.map((s) => s.name.toLowerCase()));
  let autoSteps = false;
  if (!/^\s*0\s+(STEP|ROTSTEP)\b/im.test(text)) {
    // Eigen stappen in het hoofdmodel: onderdelen gesorteerd op hoogte (LDraw: -Y is omhoog).
    const main = sections[0], lines = main.body.split('\n');
    const parts = lines.filter((l) => refOf(l)), rest = lines.filter((l) => !refOf(l));
    if (parts.length > 1) {
      parts.sort((a, b) => parseFloat(b.trim().split(/\s+/)[3]) - parseFloat(a.trim().split(/\s+/)[3]));
      const per = Math.max(1, Math.ceil(parts.length / 40)), out = [];
      parts.forEach((l, i) => { if (i && i % per === 0) out.push('0 STEP'); out.push(l); });
      main.body = rest.join('\n') + '\n' + out.join('\n') + '\n';
      autoSteps = true;
    }
  }
  const need = new Set(), missing = new Set(), stack = [];
  const visit = (body) => { for (const l of body.split('\n')) { const r = refOf(l); if (r && !own.has(r.toLowerCase())) stack.push(r.toLowerCase()); } };
  sections.forEach((s) => visit(s.body));
  while (stack.length) {
    const n = stack.pop();
    if (need.has(n) || missing.has(n)) continue;
    const t = pack.get(n);
    if (t === undefined) { missing.add(n); continue; }
    need.add(n); visit(t);
  }
  if (missing.size && pack.has('box.dat')) need.add('box.dat');
  let out = sections.map((s) => '0 FILE ' + s.name + '\n' + s.body).join('\n');
  // De lader zet "s/" om naar "parts/s/" en "48/" naar "p/48/"; ingebedde namen moeten daarbij passen.
  const as = (n) => (n.startsWith('s/') ? 'parts/' + n : n.startsWith('48/') ? 'p/' + n : n);
  for (const n of need) out += '\n0 FILE ' + as(n) + '\n' + pack.get(n);
  // Grijs blok (ongeveer 2 x 2 noppen) voor wat niet in het pakket zit.
  for (const n of missing) out += '\n0 FILE ' + as(n) + '\n0 ' + n + '\n0 !LDRAW_ORG Unofficial_Part\n0 BFC CERTIFY CCW\n1 7 0 -12 0 20 0 0 0 12 0 0 0 20 box.dat\n';
  return { text: out, missing: [...missing], autoSteps };
}

// Kleurnamen uit LDConfig ("Light_Bluish_Grey" -> "Light Bluish Grey").
function colourNames() {
  const names = {};
  for (const m of (pack.get('ldconfig.ldr') || '').matchAll(/^0 !COLOUR\s+(\S+)\s+CODE\s+(\d+)\s+VALUE\s+(#[0-9A-Fa-f]{6})/gm)) names[m[2]] = { name: m[1].replace(/_/g, ' '), hex: m[3] };
  return names;
}

// Opent een bouwplan in `host` (een leeg element). Geeft een besturing terug: stappen, ga naar stap, opruimen.
async function open(host, modelText, opts = {}) {
  await loadPack(opts.packUrl || 'bricks/parts.pack', opts.onProgress);
  const packed = packModel(modelText);
  const loader = new LDrawLoader();
  loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
  loader.smoothNormals = true;
  const cfgUrl = URL.createObjectURL(new Blob([pack.get('ldconfig.ldr') || ''], { type: 'text/plain' }));
  try { await loader.preloadMaterials(cfgUrl); } finally { URL.revokeObjectURL(cfgUrl); }
  const model = await new Promise((ok, fail) => loader.parse(packed.text, ok, fail));
  model.rotation.x = Math.PI;   // LDraw: -Y is omhoog

  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!opts.keepBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new Scene();
  scene.background = new Color(opts.background || '#f0f4ff');
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(model);
  model.updateMatrixWorld(true);

  const camera = new PerspectiveCamera(40, 1, 1, 100000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  const box = new Box3().setFromObject(model), size = box.getSize(new Vector3()), centre = box.getCenter(new Vector3());
  const radius = Math.max(size.length() / 2, 40);
  controls.target.copy(centre);
  const view = new Vector3(1, 0.75, 1.15).normalize();
  const place = () => {
    // Zo ver weg dat het hele model (alle stappen) in beeld past, ook op een smal scherm.
    const half = (camera.fov * Math.PI) / 360, fit = Math.min(half, Math.atan(Math.tan(half) * camera.aspect));
    camera.position.copy(centre).add(view.clone().multiplyScalar((radius / Math.sin(fit)) * 0.82));
    camera.near = radius / 50; camera.far = radius * 50; camera.updateProjectionMatrix();
    controls.update();
  };

  let frame = 0;
  const render = () => { if (frame) return; frame = requestAnimationFrame(() => { frame = 0; renderer.render(scene, camera); }); };
  controls.addEventListener('change', render);
  const fit = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (!moved) place();
    render();
  };
  let moved = false;
  controls.addEventListener('start', () => { moved = true; });
  const ro = new ResizeObserver(fit); ro.observe(host); fit();

  // Onderdelen per stap (groepen van het type Part), voor de lijst onder het beeld.
  const names = colourNames(), partGroups = [];
  // Alleen de bovenste laag onderdelen (een onderdeel kan zelf weer uit onderdelen bestaan).
  const isPart = (c) => c.isGroup && /^(Unofficial_)?(Part|Shortcut)$/.test(c.userData.type || '');
  const collect = (g) => { for (const c of g.children) { if (isPart(c)) partGroups.push(c); else if (c.isGroup) collect(c); } };
  collect(model);
  const steps = model.userData.numBuildingSteps || 1;
  // Nieuwe onderdelen in hun echte kleur; eerdere stappen lichter, zodat je ziet wat er nu bij komt.
  const faded = new Map();   // origineel materiaal -> lichtere kopie
  const fade = (m) => {
    if (!m || !m.isMeshStandardMaterial) return m;
    if (!faded.has(m)) { const h = m.clone(); h.color = m.color.clone().lerp(new Color('#ffffff'), 0.38); faded.set(m, h); }
    return faded.get(m);
  };
  let current = 0;
  function go(n) {
    current = Math.max(0, Math.min(steps - 1, n));
    model.traverse((c) => { if (c.isGroup) c.visible = (c.userData.buildingStep || 0) <= current; });
    for (const g of partGroups) {
      const old = (g.userData.buildingStep || 0) < current && opts.fade !== false;
      g.traverse((m) => {
        if (!m.isMesh) return;
        if (m.userData.orig === undefined) m.userData.orig = m.material;
        m.material = old ? (Array.isArray(m.userData.orig) ? m.userData.orig.map(fade) : fade(m.userData.orig)) : m.userData.orig;
      });
    }
    render();
    return current;
  }
  function partsFor(n) {
    const out = new Map();
    for (const g of partGroups) {
      if ((g.userData.buildingStep || 0) !== n) continue;
      const file = (g.userData.fileName || '').toLowerCase(), col = String(g.userData.colorCode);
      const key = file + '|' + col;
      if (!out.has(key)) out.set(key, { file, desc: descOf(file), code: col, colour: (names[col] || {}).name || '', hex: (names[col] || {}).hex || '#9ba3b4', count: 0, missing: packed.missing.includes(file) });
      out.get(key).count++;
    }
    return [...out.values()];
  }
  function dispose() {
    ro.disconnect(); controls.dispose(); cancelAnimationFrame(frame);
    model.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
    faded.forEach((m) => m.dispose());
    pmrem.dispose(); renderer.dispose(); renderer.domElement.remove();
  }
  go(0);
  const reset = () => { moved = false; place(); render(); };
  return { reset, steps, go, partsFor, dispose, missing: packed.missing, autoSteps: packed.autoSteps, parts: partGroups.length, get step() { return current; } };
}

window.HRBuild = { open, loadPack };
