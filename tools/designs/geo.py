# Geometry helpers for designing models from LDraw parts: Technic holes (as lines with their extent) and
# bounding boxes, read from the official LDraw library zip (path in the LDRAW_ZIP environment variable;
# https://library.ldraw.org/library/updates/complete.zip, not stored in this repository).
import os, zipfile, re, numpy as np
Z = zipfile.ZipFile(os.environ.get('LDRAW_ZIP', 'complete.zip'))
NAMES = {n.lower().replace('\\', '/'): n for n in Z.namelist()}
HOLE = re.compile(r'^(npeghol|peghole|connhol|beamhole|axl\dhole|axlehol|npeghol)')
PRIM_SKIP = re.compile(r'^(\d+-\d+|48/|8/|rect|box|edge|ring|disc|ndis|stud|con\d|cyl|t\d|tri|chrd|rin|axleend)')
_cache = {}
def rd(ref):
    ref = ref.lower().replace('\\', '/')
    for c in ['ldraw/parts/' + ref, 'ldraw/p/' + ref]:
        if c in NAMES:
            return Z.read(NAMES[c]).decode('utf8', 'replace')
    return None
def M(p):
    x, y, z, a, b, c, d, e, f, g, h, i = map(float, p[2:14])
    m = np.eye(4); m[:3, :3] = [[a, b, c], [d, e, f], [g, h, i]]; m[:3, 3] = [x, y, z]
    return m
def prims(ref, mat=np.eye(4), depth=0, out=None):
    out = [] if out is None else out
    t = rd(ref)
    if t is None or depth > 10: return out
    for l in t.splitlines():
        p = l.split()
        if len(p) >= 15 and p[0] == '1':
            r = ' '.join(p[14:]).lower().replace('\\', '/')
            base = r.split('/')[-1]
            m = mat @ M(p)
            if HOLE.match(base): out.append((base, m))
            elif not PRIM_SKIP.match(base): prims(r, m, depth + 1, out)
    return out
def holes(part):
    # Each hole primitive runs from its origin along its own Y vector (scaled). Merge primitives on one line.
    if part in _cache: return _cache[part]
    lines = []
    for name, m in prims(part):
        o = m[:3, 3]; yv = m[:3, 1]; n = np.linalg.norm(yv)
        if n < 1e-6: continue
        ax = yv / n
        if ax[np.argmax(np.abs(ax))] < 0: ax = -ax
        for L in lines:
            if abs(abs(np.dot(L['ax'], ax)) - 1) < 1e-3:
                d = o - L['p']; perp = d - np.dot(d, L['ax']) * L['ax']
                if np.linalg.norm(perp) < 1.0:
                    break
        else:
            L = {'p': o.copy(), 'ax': ax, 'segs': [], 'kinds': set()}
            lines.append(L)
        a = np.dot(o - L['p'], L['ax']); b = np.dot(o + yv - L['p'], L['ax'])
        L['segs'].append((min(a, b), max(a, b))); L['kinds'].add(name)
    for L in lines:
        L['lo'] = min(s for s, _ in L['segs']); L['hi'] = max(e for _, e in L['segs'])
        L['c'] = L['p'] + L['ax'] * (L['lo'] + L['hi']) / 2
    _cache[part] = lines
    return lines
def show(part, limit=200):
    hs = holes(part)
    print('==', part, (rd(part) or '').split('\n', 1)[0][2:], len(hs), 'holes')
    for L in sorted(hs, key=lambda L: (tuple(np.round(L['ax'], 2)), tuple(np.round(L['c'], 1))))[:limit]:
        print('  axis', np.round(L['ax'], 2), 'at', np.round(L['c'], 1), 'span', round(L['hi'] - L['lo'], 1), sorted(L['kinds'])[:2])

def verts(ref, mat=np.eye(4), depth=0, out=None, skip=()):
    out = [] if out is None else out
    t = rd(ref)
    if t is None or depth > 12: return out
    for l in t.splitlines():
        p = l.split()
        if not p: continue
        if p[0] == '1' and len(p) >= 15:
            r = ' '.join(p[14:]).lower().replace('\\', '/')
            if r in skip: continue
            verts(r, mat @ M(p), depth + 1, out, skip)
        elif p[0] in ('3', '4'):
            n = int(p[0])
            pts = np.array(list(map(float, p[2:2 + 3 * n]))).reshape(n, 3)
            out.extend((mat[:3, :3] @ pts.T).T + mat[:3, 3])
    return out
def bbox(ref, skip=()):
    v = np.array(verts(ref, skip=skip))
    return v.min(0).round(1), v.max(0).round(1)
