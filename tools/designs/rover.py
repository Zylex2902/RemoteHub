# "Rover": a small driving robot built only from parts of the SPIKE Prime set (45678), as an LDraw model.
# Checks that every pin and axle sits in real holes at both ends, that bodies do not overlap, that the
# wheels and the ball caster touch the same ground, and that no part is used more often than the set has it
# (counts from LEGO Education's "SPIKE Prime Set Element Overview"). Writes site/app/bricks/rover.ldr.
#   LDRAW_ZIP=path/to/complete.zip python3 tools/designs/rover.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import I, write
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'site', 'app', 'bricks', 'rover.ldr')

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
if __name__ == '__main__':
    write(OUT, 'Rover', ['A small driving robot, built only from parts of the LEGO Education SPIKE Prime set (45678).',
                         'Cables (not drawn): the motors to ports A and B, the distance sensor to port C.'], STEPS)
