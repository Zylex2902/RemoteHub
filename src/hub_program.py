import hub, motor, runloop, time
from hub import port, light_matrix
try:
    from hub import sound
except Exception:
    sound = None

VERSION = '4'
PORTS = {'A': port.A, 'B': port.B, 'C': port.C, 'D': port.D, 'E': port.E, 'F': port.F}
TIMEOUT_MS = 800
tunnel = hub.config['module_tunnel']
inbox = []
seen = [time.ticks_ms()]
speeds = {}
failed = {}
grip = {}
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
    try:
        if pct == 0:
            motor.stop(p)
        else:
            motor.run(p, pct * 10)
        if name in failed:
            del failed[name]
    except Exception as e:
        if name not in failed:
            failed[name] = 1
            say('err ' + name + ' ' + str(e))


def stop_all():
    for name in list(speeds):
        set_motor(name, 0)


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
        await runloop.sleep_ms(10)


runloop.run(main())
