# "Veegbot" (sweeper robot): the Rover's chassis with all motors of the SPIKE Prime set (45678) and two
# sensors. A large motor at the front turns a sweeper arm above the robot; the colour sensor looks down at
# the floor on the right, the force sensor is a bumper on the left. Only parts of the set, within its counts.
#   LDRAW_ZIP=path/to/complete.zip python3 tools/designs/veegbot.py   -> site/app/bricks/veegbot.ldr
# Design coordinates: front is +Z, -Y is up, the floor is at y = 40 (written turned around to face -Z).
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from common import I, write
from geo import verts
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'site', 'app', 'bricks', 'veegbot.ldr')

R_MOTOR = [[0, -1, 0], [-1, 0, 0], [0, 0, -1]]   # medium motor, output to +X
L_MOTOR = [[0, 1, 0], [1, 0, 0], [0, 0, -1]]     # medium motor, output to -X
R_WHEEL = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]]
L_WHEEL = [[0, 0, -1], [0, 1, 0], [1, 0, 0]]
BEAM_X = [[0, 0, 1], [1, 0, 0], [0, 1, 0]]       # beam along X, holes along Z
BEAM_FLAT = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]]   # beam along X, holes vertical
AX_Z = [[0, 0, -1], [0, 1, 0], [1, 0, 0]]        # pin along Z
PIN_UP = [[0, 1, 0], [1, 0, 0], [0, 0, -1]]      # pin vertical
L_RIGHT = [[0, 0, 1], [0, -1, 0], [1, 0, 0]]     # 3x5 L-beam: long arm along +X, short arm to the front
L_LEFT = [[0, 0, -1], [0, 1, 0], [1, 0, 0]]      # long arm along -X, short arm to the front
LOOK_DOWN = [[1, 0, 0], [0, 0, -1], [0, 1, 0]]   # colour sensor: face (local -Z) down
BUMPER = [[-1, 0, 0], [0, 1, 0], [0, 0, -1]]     # force sensor: button (local -Z) to the front

STEPS = [
    ('Hub', [(71, 0, 0, 0, I, '45601c01.dat')]),
    ('Right drive motor: two blue 3L pins into the side of the hub', [
        (1, 80, -10, 80, I, '6558.dat'), (1, 80, -50, 80, I, '6558.dat'), (15, 100, -30, 80, R_MOTOR, '54696p01.dat')]),
    ('Left drive motor', [
        (1, -80, -10, 80, I, '6558.dat'), (1, -80, -50, 80, I, '6558.dat'), (15, -100, -30, 80, L_MOTOR, '54696p01.dat')]),
    ('Wheels on 3L axles', [
        (71, 155, -30, 80, I, '4519.dat'), (15, 167.5, -30, 80, R_WHEEL, '39367p01.dat'),
        (71, -155, -30, 80, I, '4519.dat'), (15, -167.5, -30, 80, L_WHEEL, '39367p01.dat')]),
    ('Back: a 7L beam with two blue 3L pins', [
        (1, 40, -30, -120, AX_Z, '6558.dat'), (1, -40, -30, -120, AX_Z, '6558.dat'), (15, 0, -30, -120, BEAM_X, '32524.dat')]),
    ('Ball caster', [(71, 0, -30, -140, AX_Z, '39370c01.dat')]),
    ('Large motor at the front, output up, on two black pins', [
        (0, 40, -30, 110, AX_Z, '2780.dat'), (0, -40, -30, 110, AX_Z, '2780.dat'), (15, 0, -30, 140, I, '54675.dat')]),
    ('Arm hub: two blue 3L pins in the motor output, then a 3L beam', [
        (1, 20, -90, 140, PIN_UP, '6558.dat'), (1, -20, -90, 140, PIN_UP, '6558.dat'), (15, 0, -90, 140, BEAM_FLAT, '32523.dat')]),
    ('Sweeper arm: an 11L beam on the same pins', [(15, 0, -110, 140, BEAM_FLAT, '32525.dat')]),
    ('Scoops: two 3x5 L-beams, each on two black pins', [
        (0, 40, -120, 140, PIN_UP, '2780.dat'), (0, 100, -120, 140, PIN_UP, '2780.dat'), (71, 20, -130, 140, L_RIGHT, '32526.dat'),
        (0, -40, -120, 140, PIN_UP, '2780.dat'), (0, -100, -120, 140, PIN_UP, '2780.dat'), (71, -20, -130, 140, L_LEFT, '32526.dat')]),
    ('Colour sensor on the right of the large motor, looking down', [
        (0, 50, -50, 120, I, '2780.dat'), (0, 50, -50, 160, I, '2780.dat'), (15, 80, -50, 140, LOOK_DOWN, '37308.dat')]),
    ('Force sensor on the left as a front bumper', [
        (0, -50, -50, 240, I, '2780.dat'), (0, -50, -10, 240, I, '2780.dat'), (15, -80, -30, 280, BUMPER, '37312.dat')]),
]

def sweep_clear(steps, moving=('32523.dat', '32525.dat', '32526.dat'), axis=(0, 140)):
    # The arm turns around the large motor's output: nothing fixed may be inside the circle it sweeps.
    parts = [q for _, ps in steps for q in ps]
    world = lambda c, x, y, z, m, p: (np.array(m, float) @ np.array(verts(p)).T).T + [x, y, z]
    mv = np.vstack([world(*q) for q in parts if q[5] in moving])
    radius = np.hypot(mv[:, 0] - axis[0], mv[:, 2] - axis[1]).max(); top, bottom = mv[:, 1].min(), mv[:, 1].max()
    ok = True
    for q in parts:
        if q[5] in moving or q[5] in ('2780.dat', '6558.dat'): continue
        w = world(*q); r = np.hypot(w[:, 0] - axis[0], w[:, 2] - axis[1])
        if ((w[:, 1] > top + 0.5) & (w[:, 1] < bottom - 0.5) & (r < radius)).any(): print('IN THE ARM\'S WAY:', q[5]); ok = False
    print('arm sweeps radius %.1f between y %.0f and %.0f: %s' % (radius, top, bottom, 'clear' if ok else 'BLOCKED'))
    return ok

if __name__ == '__main__':
    if not sweep_clear(STEPS): sys.exit('arm blocked')
    write(OUT, 'Veegbot', ['A sweeper robot, built only from parts of the LEGO Education SPIKE Prime set (45678).',
                           'Cables (not drawn): drive motors to ports A and B, large motor to C, colour sensor to D, force sensor to E.'], STEPS)
