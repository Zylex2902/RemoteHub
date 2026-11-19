import hub, motor, runloop, time
from hub import port, light_matrix
try:
    from hub import sound
except Exception:
    sound = None
try:
    from hub import light
except Exception:
    light = None
try:
    from hub import button
except Exception:
    button = None
try:
    from hub import motion_sensor
except Exception:
    motion_sensor = None
try:
    import distance_sensor
except Exception:
    distance_sensor = None

VERSION = '5'
PORTS = {'A': port.A, 'B': port.B, 'C': port.C, 'D': port.D, 'E': port.E, 'F': port.F}
TIMEOUT_MS = 800
tunnel = hub.config['module_tunnel']
inbox = []
seen = [time.ticks_ms()]
speeds = {}
failed = {}
grip = {}
# Poorten met een beweging over een aantal graden: (start, verwachte duur in ms). En stopstand per poort.
moving = {}
stops = {}
# Laatst gemelde hubknoppen en gebaar, en een teller om ze om de 50 ms te lezen.
inputs = {'L': 0, 'R': 0, 'g': -1, 'n': 0}
notes = []
# Muziek: [start van de huidige noot, lengte in ms, volume]
tune = [0, 0, 80]
MAX_NOTES = 400


def say(text):
    try:
        tunnel.send(text.encode())
    except Exception:
        pass


def on_data(data):
    try:
        if not isinstance(data, str):
            data = bytes(data).decode()
        inbox.append(data)
        seen[0] = time.ticks_ms()
    except Exception:
        pass


def set_motor(name, pct):
    if speeds.get(name) == pct:
        return
    speeds[name] = pct
    p = PORTS.get(name)
    if p is None:
        return
    if pct != 0 and name in moving:
        del moving[name]
    try:
        if pct == 0:
            halt_port(p, name)
        else:
            motor.run(p, pct * 10)
        if name in failed:
            del failed[name]
    except Exception as e:
        if name not in failed:
            failed[name] = 1
            say('err ' + name + ' ' + str(e))


def halt_port(p, name):
    # Stoppen met de gekozen stopstand (uitlopen, remmen, vasthouden); zonder die mogelijkheid gewoon stoppen.
    try:
        motor.stop(p, stop=stops[name])
        return
    except Exception:
        pass
    motor.stop(p)


def stop_all():
    for name in list(speeds):
        set_motor(name, 0)
    # Ook bewegingen over een aantal graden die nog bezig zijn: die staan niet in speeds.
    now = time.ticks_ms()
    for name in list(moving):
        start, ms = moving[name]
        del moving[name]
        if time.ticks_diff(now, start) < ms:
            try:
                motor.stop(PORTS[name])
            except Exception:
                pass


def halt_all():
    # STOP op de pagina: alle poorten stil, ook lopende bewegingen, en geen geluid.
    for name in PORTS:
        speeds[name] = 0
        try:
            motor.stop(PORTS[name])
        except Exception:
            pass
    moving.clear()
    hush()


def run_degrees(name, deg, pct):
    # Draait een motor een aantal graden; de rijlus laat hem met rust tot er een nieuwe snelheid komt.
    p = PORTS.get(name)
    if p is None or deg == 0:
        return
    pct = max(5, min(100, abs(pct)))
    try:
        motor.run_for_degrees(p, deg, pct * 10)
        speeds[name] = 0
        moving[name] = (time.ticks_ms(), abs(deg) * 150 // pct + 500)
    except Exception as e:
        say('err ' + name + ' ' + str(e))


def go_to(name, pos, pct, way):
    p = PORTS.get(name)
    if p is None:
        return
    pct = max(5, min(100, abs(pct)))
    ways = {'cw': ('CLOCKWISE', 0), 'ccw': ('COUNTERCLOCKWISE', 1), 's': ('SHORTEST_PATH', 2)}
    w = ways.get(way, ways['s'])
    try:
        motor.run_to_absolute_position(p, pos % 360, pct * 10, direction=getattr(motor, w[0], w[1]))
        speeds[name] = 0
        moving[name] = (time.ticks_ms(), 54000 // pct + 500)
    except Exception as e:
        say('err ' + name + ' ' + str(e))


def poll_inputs():
    # Hubknoppen links/rechts en gebaren (tikken, schudden, vallen) doorgeven als ze veranderen.
    try:
        for key, which in (('L', 'LEFT'), ('R', 'RIGHT')):
            down = 1 if button.pressed(getattr(button, which)) else 0
            if down != inputs[key]:
                inputs[key] = down
                say('btn ' + key + ' ' + str(down))
    except Exception:
        pass
    try:
        g = motion_sensor.gesture()
        if g != inputs['g']:
            inputs['g'] = g
            if g is not None and g >= 0:
                say('ges ' + str(g))
    except Exception:
        pass


def move_to(name, target, pct):
    # Grijper: draai naar een stand, gerekend in graden vanaf het nulpunt.
    p = PORTS.get(name)
    if p is None:
        return
    delta = target - grip.get(name, 0)
    if delta == 0:
        return
    if pct < 5:
        pct = 5
    if pct > 100:
        pct = 100
    try:
        motor.run_for_degrees(p, delta, pct * 10)
        grip[name] = target
    except Exception as e:
        say('err ' + name + ' ' + str(e))


def hush():
    del notes[:]
    tune[1] = 0
    try:
        sound.stop()
    except Exception:
        pass


def add_notes(parts, now):
    # Noten als 'frequentie:ms'; frequentie 0 is een rust.
    for tok in parts:
        i = tok.find(':')
        if i < 1 or len(notes) >= MAX_NOTES:
            continue
        try:
            f = int(tok[:i])
            ms = int(tok[i + 1:])
        except ValueError:
            continue
        if ms < 10:
            ms = 10
        if ms > 3000:
            ms = 3000
        if f != 0 and (f < 100 or f > 10000):
            continue
        notes.append((f, ms))


def play_notes(now):
    # Speelt de wachtrij noot voor noot af zonder de rijlus op te houden.
    if not notes or time.ticks_diff(now, tune[0]) < tune[1]:
        return
    f, ms = notes.pop(0)
    tune[0] = now
    tune[1] = ms
    if f > 0:
        try:
            sound.beep(f, ms, tune[2])
        except Exception:
            pass


def show(img):
    # 25 cijfers 0-9, rij voor rij van boven naar beneden.
    if len(img) != 25:
        return
    try:
        for i in range(25):
            v = ord(img[i]) - 48
            if v < 0 or v > 9:
                v = 0
            light_matrix.set_pixel(i % 5, i // 5, 100 if v == 9 else v * 11)
    except Exception:
        pass


def handle(text):
    if text == '?':
        say('rdy ' + VERSION)
        return
    if text == 'beep':
        try:
            sound.beep(440, 250, 100)
        except Exception:
            pass
        return
    parts = text.split()
    if parts and parts[0] in ('tune', 'tune+'):
        if parts[0] == 'tune':
            hush()
        add_notes(parts[1:], time.ticks_ms())
        return
    if parts and parts[0] == 'hush':
        hush()
        return
    if parts and parts[0] == 'vol':
        try:
            tune[2] = max(0, min(100, int(parts[1])))
        except (ValueError, IndexError):
            pass
        return
    if parts and parts[0] == 'img':
        if len(parts) > 1:
            show(parts[1])
        return
    if parts and parts[0] == 'halt':
        halt_all()
        return
    if parts and parts[0] == 'deg':
        # deg A:360:50 B:-360:50  (poort:graden:snelheid), alle motoren tegelijk
        for tok in parts[1:]:
            bits = tok.split(':')
            try:
                run_degrees(bits[0], int(bits[1]), int(bits[2]))
            except (ValueError, IndexError):
                pass
        return
    if parts and parts[0] == 'goto':
        try:
            go_to(parts[1], int(parts[2]), int(parts[3]), parts[4] if len(parts) > 4 else 's')
        except (ValueError, IndexError):
            pass
        return
    if parts and parts[0] == 'smode':
        try:
            stops[parts[1]] = max(0, min(2, int(parts[2])))
        except (ValueError, IndexError):
            pass
        return
    if parts and parts[0] == 'light':
        try:
            light.color(getattr(light, 'POWER', 0), int(parts[1]))
        except Exception:
            pass
        return
    if parts and parts[0] == 'eyes':
        try:
            distance_sensor.show(PORTS[parts[1]], [max(0, min(100, int(x))) for x in parts[2:6]])
        except Exception:
            pass
        return
    if parts and parts[0] == 'pos':
        try:
            move_to(parts[1], int(parts[2]), int(parts[3]))
        except (ValueError, IndexError):
            pass
        return
    if parts and parts[0] == 'zero':
        if len(parts) > 1:
            grip[parts[1]] = 0
        return
    for tok in parts:
        i = tok.find(':')
        if i < 1:
            continue
        try:
            pct = int(tok[i + 1:])
        except ValueError:
            continue
        if pct > 100:
            pct = 100
        if pct < -100:
            pct = -100
        set_motor(tok[:i], pct)


async def main():
    tunnel.callback(on_data)
    try:
        light_matrix.clear()
        for x, y in ((2, 0), (1, 1), (2, 1), (3, 1), (2, 2), (2, 3), (2, 4)):
            light_matrix.set_pixel(x, y, 100)
    except Exception:
        pass
    say('rdy ' + VERSION)
    while True:
        if inbox:
            while inbox:
                handle(inbox.pop(0))
        elif time.ticks_diff(time.ticks_ms(), seen[0]) > TIMEOUT_MS:
            stop_all()
            if notes:
                hush()
        play_notes(time.ticks_ms())
        inputs['n'] += 1
        if inputs['n'] >= 5:
            inputs['n'] = 0
            poll_inputs()
        await runloop.sleep_ms(10)


runloop.run(main())
