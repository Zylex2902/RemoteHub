"""Translation review pipeline (tools/lqa.py): automatic checks, applying a reviewer's export, and
reviews that expire when the English text or the translation changes. Works on a copy in a temp dir."""
import json, pathlib, shutil, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import lqa  # noqa: E402

tmp = pathlib.Path(tempfile.mkdtemp())
base = tmp / "i18n"
shutil.copytree(ROOT / "src" / "i18n", base, ignore=shutil.ignore_patterns("review"))
en = json.loads((base / "en.json").read_text(encoding="utf8"))
save = lambda code, d: (base / (code + ".json")).write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf8")
checks = 0

# 1. automatic checks: placeholders, ™/®, names, missing keys
xx = {k: "XX " + v for k, v in en.items()}
xx["draw.info"] = "{0} Teile"                       # {1} lost
xx["about.text"] = xx["about.text"].replace("™", "")  # trademark sign lost
xx["py.help"] = xx["py.help"].replace("MicroPython", "Mikro")
del xx["pad.off"]
save("xx", xx)
err, warn = lqa.check_lang("xx", base)
msgs = {k: m for k, m in err}
assert "placeholders differ" in msgs.get("draw.info", ""), msgs.get("draw.info"); checks += 1
assert "™" in msgs.get("about.text", ""); checks += 1
assert "MicroPython" in msgs.get("py.help", ""); checks += 1
assert msgs.get("pad.off") == "missing"; checks += 1
assert not lqa.check_lang("nl", base)[0], "Dutch passes"; checks += 1

# 2. a reviewer's export: approve, correct, a correction that breaks a placeholder, a comment, an outdated item
xx = {k: "XX " + v for k, v in en.items()}
save("xx", xx)
src = lambda k: lqa.h(en[k], xx[k])
export = {"lang": "xx", "reviewer": "Test Expert", "date": "2026-11-20", "items": {
    "tab.drive": {"status": "ok", "src": src("tab.drive")},
    "draw.info": {"status": "fix", "src": src("draw.info"), "text": "{0} Stücke, {1} cm", "note": "shorter"},
    "port": {"status": "fix", "src": src("port"), "text": "Anschluss"},
    "tab.log": {"status": "comment", "src": src("tab.log"), "note": "unsure about this word"},
    "tab.code": {"status": "ok", "src": "0000000000000000"},
}}
f = tmp / "export.json"
f.write_text(json.dumps(export), encoding="utf8")
skipped = lqa.apply("xx", f, base)
assert len(skipped) == 2 and any(s.startswith("port:") for s in skipped) and any(s.startswith("tab.code:") for s in skipped), skipped; checks += 1
after = json.loads((base / "xx.json").read_text(encoding="utf8"))
assert after["draw.info"] == "{0} Stücke, {1} cm" and after["port"] == xx["port"], "correction applied, broken one not"; checks += 1
c = lqa.coverage("xx", base)
assert (c["reviewed"], c["comments"], c["stale"]) == (2, 1, 0), c; checks += 1
rv = json.loads((base / "review" / "xx.json").read_text(encoding="utf8"))
assert rv["draw.info"]["was"] == xx["draw.info"] and rv["draw.info"]["by"] == "Test Expert"; checks += 1

# 3. the review of a text expires when the English source changes
en2 = dict(en, **{"tab.drive": "Drive it"})
save("en", en2)
c = lqa.coverage("xx", base)
assert (c["reviewed"], c["stale"]) == (1, 1), c; checks += 1
save("en", en)

# 4. the languages in the app all pass the automatic checks, with equal key sets
for l in lqa.languages():
    e, _ = lqa.check_lang(l["code"])
    assert not e, l["code"] + ": " + "; ".join(k + " " + m for k, m in e[:5])
    checks += 1

shutil.rmtree(tmp)
print("OK lqa:", checks, "checks (placeholders, marks, names, apply with hashes, expiring reviews, all languages)")
