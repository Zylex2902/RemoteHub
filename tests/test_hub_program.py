"""Runs the hub program against stubbed hub modules: drive, failsafe, ping, horn, gripper."""
import sys, re, types, asyncio, ast, pathlib
PAGE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent.parent / "site" / "index.html"
html = PAGE.read_text(encoding="utf8")
src = re.search(r'<script type="text/plain" id="hub-program">(.*?)</script>', html, re.S).group(1)
src = re.sub(r'^\s*\n', '', src)
ast.parse(src)
assert all(ord(c) < 128 for c in src), "non-ascii in hub program"
assert "VERSION = '3'" in src and "HUB_VERSION = '3'" in html
print("program:", len(src.encode()), "bytes,", src.count("\n"), "lines")

clock = [0]; calls = []; sent = []; script = []; pixels = []; beeps = []
class Tunnel:
    cb = None
    def callback(self, f): self.cb = f
    def send(self, b): assert isinstance(b, (bytes, bytearray)); sent.append(bytes(b))
tunnel = Tunnel()
hub = types.ModuleType("hub"); hub.config = {"module_tunnel": tunnel}
hub.port = types.SimpleNamespace(A=0, B=1, C=2, D=3, E=4, F=5)
hub.light_matrix = types.SimpleNamespace(clear=lambda: pixels.clear(), set_pixel=lambda x, y, v: pixels.append((x, y, v)))
hub.sound = types.SimpleNamespace(beep=lambda f, d, v: beeps.append((clock[0], f, d, v)))
motor = types.ModuleType("motor")
MISSING = {4}
def run(p, v):
    if p in MISSING: raise OSError("[Errno 19] ENODEV")
    assert isinstance(v, int); calls.append((clock[0], "run", p, v))
def stop(p):
    if p in MISSING: raise OSError("[Errno 19] ENODEV")
    calls.append((clock[0], "stop", p, 0))
def run_for_degrees(p, deg, vel):
    if p in MISSING: raise OSError("[Errno 19] ENODEV")
    assert isinstance(deg, int) and isinstance(vel, int) and vel > 0
    calls.append((clock[0], "deg", p, (deg, vel)))
motor.run, motor.stop, motor.run_for_degrees = run, stop, run_for_degrees
timem = types.ModuleType("time"); timem.ticks_ms = lambda: clock[0]; timem.ticks_diff = lambda a, b: a - b
class Done(Exception): pass
runloop = types.ModuleType("runloop")
END = 4000
async def sleep_ms(ms):
    clock[0] += ms
    while script and script[0][0] <= clock[0]:
        tunnel.cb(script.pop(0)[1])
    if clock[0] > END: raise Done()
runloop.sleep_ms = sleep_ms
def rl_run(coro):
    try: asyncio.run(coro)
    except Done: pass
runloop.run = rl_run
sys.modules.update(hub=hub, motor=motor, runloop=runloop, time=timem)

script[:] = [
    (100, b"A:-50 B:50"), (200, b"A:-50 B:50"), (300, "A:-50 B:50"), (400, b"A:0 B:0"),
    (500, b"A:30 B:-30 E:60"), (600, b"A:30 B:-30 E:-60"), (700, b"junk Z:5 :3 A:x B:999"),
    (2000, b"A:30 B:100"), (2050, b"?"), (2060, b"beep"),
    (2100, b"A:0 B:0"),
    (2200, b"pos C 120 80"),      # gripper open: +120 degrees at 80%
    (2300, b"pos C 120 80"),      # already there: nothing
    (2400, b"pos C 0 50"),        # close: -120 degrees
    (2500, b"zero C"), (2600, b"pos C 30 2"),   # after zero: +30, speed clamped to 5%
    (2700, b"pos E 90 50"),       # no motor on E: error reported, state unchanged
    (2800, b"pos"), (2810, b"pos C x 5"), (2820, b"zero"),   # malformed: ignored
    (2900, b"A:0 B:0"), (3000, b"A:0 B:0"), (3100, b"A:0 B:0"),
]
exec(compile(src, "program.py", "exec"), {"__name__": "__main__"})
def at(t0, t1): return [(k, p, v) for (t, k, p, v) in calls if t0 <= t < t1]
assert sent[0] == b"rdy 3" and sent.count(b"rdy 3") == 2, sent
assert len(beeps) == 1 and beeps[0][1:] == (440, 250, 100), beeps
assert len(pixels) == 7
assert at(100, 200) == [("run", 0, -500), ("run", 1, 500)]
assert at(200, 400) == []
assert at(400, 500) == [("stop", 0, 0), ("stop", 1, 0)]
assert at(500, 600) == [("run", 0, 300), ("run", 1, -300)]
assert at(700, 800) == [("run", 1, 1000)]
assert sorted(at(800, 2000)) == [("stop", 0, 0), ("stop", 1, 0)]          # failsafe
assert at(2000, 2100) == [("run", 0, 300), ("run", 1, 1000)]
assert at(2200, 2300) == [("deg", 2, (120, 800))], at(2200, 2300)
assert at(2300, 2400) == []
assert at(2400, 2500) == [("deg", 2, (-120, 500))], at(2400, 2500)
assert at(2600, 2700) == [("deg", 2, (30, 50))], at(2600, 2700)
assert at(2700, 2900) == [], at(2700, 2900)
errs = [s for s in sent if s.startswith(b"err ")]
assert len(errs) == 2 and errs[0].startswith(b"err E ") and errs[1].startswith(b"err E "), errs
# a position move is not undone by the failsafe: only A/B stop after the silence that follows
assert all(k == "stop" and p in (0, 1) for (k, p, v) in at(3100, 4100)), at(3100, 4100)
print("OK hub program v3: drive, failsafe, ping, horn, gripper moves, malformed input")
