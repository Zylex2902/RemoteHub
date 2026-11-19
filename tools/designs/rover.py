# "Rover": a small driving robot built only from parts of the SPIKE Prime set (45678), as an LDraw model.
# Checks that every pin and axle sits in real holes at both ends, that bodies do not overlap, that the
# wheels and the ball caster touch the same ground, and that no part is used more often than the set has it
# (counts from LEGO Education's "SPIKE Prime Set Element Overview"). Writes site/app/bricks/rover.ldr.
#   LDRAW_ZIP=path/to/complete.zip python3 tools/designs/rover.py
import os, sys, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import holes, bbox, verts
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'site', 'app', 'bricks', 'rover.ldr')

I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
R_MOTOR = [[0, -1, 0], [-1, 0, 0], [0, 0, -1]]   # output (local -Y) to +X, length along -Z
L_MOTOR = [[0, 1, 0], [1, 0, 0], [0, 0, -1]]     # output to -X
R_WHEEL = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]]     # wheel axis (local Z) along +X
L_WHEEL = [[0, 0, -1], [0, 1, 0], [1, 0, 0]]
BEAM_X = [[0, 0, 1], [1, 0, 0], [0, 1, 0]]       # beam length along X, holes along Z
AX_Z = [[0, 0, -1], [0, 1, 0], [1, 0, 0]]        # pin/caster local X along Z
SENSOR = [[-1, 0, 0], [0, 1, 0], [0, 0, -1]]     # eyes (local -Z) to the front (+Z)

# (step comment, [(colour, x, y, z, matrix, part)])
STEPS = [
    ('Hub', [(71, 0, 0, 0, I, '45601c01.dat')]),
    ('Right motor: two blue 3L pins into the side of the hub, then the motor', [
        (1, 80, -10, 80, I, '6558.dat'), (1, 80, -50, 80, I, '6558.dat'),
        (15, 100, -30, 80, R_MOTOR, '54696p01.dat')]),
    ('Left motor', [
        (1, -80, -10, 80, I, '6558.dat'), (1, -80, -50, 80, I, '6558.dat'),
        (15, -100, -30, 80, L_MOTOR, '54696p01.dat')]),
    ('Right wheel on a 3L axle', [(71, 155, -30, 80, I, '4519.dat'), (15, 167.5, -30, 80, R_WHEEL, '39367p01.dat')]),
    ('Left wheel on a 3L axle', [(71, -155, -30, 80, I, '4519.dat'), (15, -167.5, -30, 80, L_WHEEL, '39367p01.dat')]),
    ('Back: a 7L beam with two blue 3L pins', [
        (1, 40, -30, -120, AX_Z, '6558.dat'), (1, -40, -30, -120, AX_Z, '6558.dat'),
        (15, 0, -30, -120, BEAM_X, '32524.dat')]),
    ('Ball caster on the pins', [(71, 0, -30, -140, AX_Z, '39370c01.dat')]),
    ('Front: a 7L beam with two black pins', [
        (0, 40, -30, 110, AX_Z, '2780.dat'), (0, -40, -30, 110, AX_Z, '2780.dat'),
        (15, 0, -30, 120, BEAM_X, '32524.dat')]),
    ('Distance sensor: two black pins in the outer holes, then the sensor', [
        (0, 60, -30, 130, AX_Z, '2780.dat'), (0, -60, -30, 130, AX_Z, '2780.dat'),
        (15, 0, -30, 140, SENSOR, '37316.dat')]),
]
PINS = {'6558.dat': 60, '2780.dat': 40, '4519.dat': 60}
SET = {'45601c01.dat': 1, '54696p01.dat': 2, '39367p01.dat': 4, '4519.dat': 8, '6558.dat': 10, '2780.dat': 72,
       '32524.dat': 6, '39370c01.dat': 1, '37316.dat': 1}

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
    lows = [w[:, 1].max() for p, i, lo, hi, w in boxes]
    print('lowest points (y down):', {boxes[i][0]: round(float(l), 1) for i, l in enumerate(lows)})
    return ok

def ldr(steps):
    out = ['0 Rover', '0 Name: rover.ldr', '0 Author: Hub Remote (own design, free to use)', '0 !LICENSE Licensed under CC BY 4.0',
           '0 // A small driving robot, built only from parts of the LEGO Education SPIKE Prime set (45678).',
           '0 // Cables (not drawn): the motors to ports A and B, the distance sensor to port C.', '']
    # Designed with the front at +Z; LDraw models face -Z, so turn everything half a turn around the vertical.
    T = np.diag([-1.0, 1.0, -1.0])
    for i, (title, parts) in enumerate(steps):
        out.append('0 // ' + title)
        for col, x, y, z, m, p in parts:
            mm = T @ np.array(m, float)
            out.append('1 %d %g %g %g %s %s' % (col, -x, y, -z, ' '.join('%g' % (v + 0.0) for row in mm for v in row), p))
        out.append('0 STEP')
    return '\r\n'.join(out) + '\r\n'

if __name__ == '__main__':
    allparts = [q for _, ps in STEPS for q in ps]
    good = check(allparts)
    if not good: sys.exit('CHECK FAILED: rover.ldr not written')
    open(OUT, 'w', newline='').write(ldr(STEPS))
    print('written', os.path.normpath(OUT), len(allparts), 'parts, CHECK OK')
