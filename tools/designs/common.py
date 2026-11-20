# Shared checks and LDraw output for the example designs (see rover.py and veegbot.py).
import os, sys, numpy as np
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import holes, bbox, verts

# Rotations used by the designs (LDraw: -Y is up).
I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

PINS = {'6558.dat': 60, '2780.dat': 40, '4519.dat': 60}
# How many of each part the SPIKE Prime set (45678) has, from LEGO Education's element overview.
SET = {'45601c01.dat': 1, '54696p01.dat': 2, '54675.dat': 1, '39367p01.dat': 4, '4519.dat': 8, '6558.dat': 10, '2780.dat': 72,
       '32524.dat': 6, '32525.dat': 4, '32523.dat': 6, '32526.dat': 4, '32316.dat': 4, '40490.dat': 4, '32278.dat': 6,
       '39370c01.dat': 1, '37316.dat': 1, '37308.dat': 1, '37312.dat': 1}

def write(path, title, notes, steps):
    allparts = [q for _, ps in steps for q in ps]
    if not check(allparts): sys.exit('CHECK FAILED: ' + os.path.basename(path) + ' not written')
    open(path, 'w', newline='').write(ldr(title, os.path.basename(path), notes, steps))
    print('written', os.path.normpath(path), len(allparts), 'parts in', len(steps), 'steps, CHECK OK')

def world_holes(parts):
    out = []
    for idx, (col, x, y, z, m, p) in enumerate(parts):
        if p in PINS: continue
        R = np.array(m, float); t = np.array([x, y, z], float)
        for L in holes(p):
            # a hole runs between its outermost face rings; a single ring stands for a hole one beam (20 LDU) deep
            span = L['hi'] - L['lo']
            out.append((idx, p, R @ L['c'] + t, R @ L['ax'], span / 2 + (10 if span < 5 else 1)))
    return out

def check(parts):
    ok = True
    from collections import Counter
    n = Counter(p for *_, p in parts)
    for p, k in n.items():
        if k > SET.get(p, 0): print('TOO MANY', p, k, '>', SET.get(p)); ok = False
    wh = world_holes(parts)
    for idx, (col, x, y, z, m, p) in enumerate(parts):
        if p not in PINS: continue
        R = np.array(m, float); ax = R @ np.array([1.0, 0, 0]); c = np.array([x, y, z], float); half = PINS[p] / 2
        ends = []
        for s in (-1, 1):
            pt = c + ax * s * (half - 10)   # middle of the last 20 LDU of each end
            hit = [(i, q) for i, q, hc, hax, reach in wh if abs(abs(np.dot(hax, ax)) - 1) < 1e-3
                   and np.linalg.norm((pt - hc) - np.dot(pt - hc, hax) * hax) < 1.5 and abs(np.dot(pt - hc, hax)) <= reach + 1]
            ends.append(sorted(set(q for _, q in hit)))
        good = all(ends)
        print(('ok  ' if good else 'MISS'), p, 'at', (x, y, z), 'ends in', ends)
        ok &= good
    # bodies must not overlap (boxes shrunk by 1.5 LDU; pins/axles are inside holes by design)
    boxes = []
    for idx, (col, x, y, z, m, p) in enumerate(parts):
        if p in PINS: continue
        R = np.array(m, float); v = np.array(verts(p, skip=('u9218c01.dat',)))
        w = (R @ v.T).T + [x, y, z]
        boxes.append((p, idx, w.min(0) + 1.5, w.max(0) - 1.5, w))
    for a in range(len(boxes)):
        for b in range(a + 1, len(boxes)):
            pa, ia, lo_a, hi_a, wa = boxes[a]; pb, ib, lo_b, hi_b, wb = boxes[b]
            if np.all(lo_a < hi_b) and np.all(lo_b < hi_a):
                # boxes touch: count vertices of one strictly inside the other's box (coarse but catches real clashes)
                b_in_a = np.sum(np.all((wb > lo_a + 2) & (wb < hi_a - 2), axis=1)); a_in_b = np.sum(np.all((wa > lo_b + 2) & (wa < hi_b - 2), axis=1))
                print('box overlap', pa, ia, pb, ib, 'vertices of 2nd in 1st box:', b_in_a, ' of 1st in 2nd box:', a_in_b)
    lows = [(boxes[i][0], round(float(w[:, 1].max()), 1)) for i, (p, _, lo, hi, w) in enumerate(boxes)]
    print('lowest points (y down, ground = largest):', lows)
    ground = max(l for _, l in lows)
    touching = sorted(set(p for p, l in lows if l > ground - 0.5))
    print('standing on:', touching)
    return ok

def ldr(title, name, notes, steps):
    out = ['0 ' + title, '0 Name: ' + name, '0 Author: BrickHubRemote (own design, free to use)', '0 !LICENSE Licensed under CC BY 4.0']
    out += ['0 // ' + n for n in notes] + ['']
    # Designed with the front at +Z; LDraw models face -Z, so turn everything half a turn around the vertical.
    T = np.diag([-1.0, 1.0, -1.0])
    for i, (title, parts) in enumerate(steps):
        out.append('0 // ' + title)
        for col, x, y, z, m, p in parts:
            mm = T @ np.array(m, float)
            out.append('1 %d %g %g %g %s %s' % (col, -x, y, -z, ' '.join('%g' % (v + 0.0) for row in mm for v in row), p))
        out.append('0 STEP')
    return '\r\n'.join(out) + '\r\n'

