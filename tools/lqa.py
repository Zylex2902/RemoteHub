#!/usr/bin/env python3
"""Translation quality (LQA) for BrickHubRemote.

English (src/i18n/en.json) is the source text; Dutch (nl.json) is the owner's original. Every other
language is checked automatically and then reviewed by a language expert who sees the English text,
the translation, where it appears (context and screenshots) and the automatic warnings side by side.

  python3 tools/lqa.py check [code ...]   automatic checks; exit 1 on errors (placeholders, marks, names)
  python3 tools/lqa.py page CODE [--out F] review page for one language (one HTML file, works offline)
  python3 tools/lqa.py apply CODE FILE    take a reviewer's export: fixes into src/i18n/CODE.json,
                                          decisions into src/i18n/review/CODE.json
  python3 tools/lqa.py report [--write]   reviewed share per language (--write: docs/translation-status.md)

A review counts only while both the English text and the translation are unchanged since the expert
saw them (a hash of both is stored). Screenshots for the page come from `npm run lqa:shots -- CODE`.
"""
import datetime, hashlib, html, json, pathlib, re, sys, unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
I18N = ROOT / "src" / "i18n"
SHOTS = ROOT / "dist" / "lqa" / "shots"
rd = lambda p: json.loads(p.read_text(encoding="utf8"))

PROTECTED = ["BrickHubRemote", "LEGO", "SPIKE", "LDraw", "BrickLink", "Studio", "MicroPython", "Python", "Blockly",
             "Bluetooth", "Bluefy", "Chrome", "Android", "iPhone", "iPad"]
MARKS = ["®", "™"]
PH = re.compile(r"\{[A-Za-z0-9]+\}")


def languages():
    return rd(I18N / "languages.json")


def texts(code, base=I18N):
    return rd(base / (code + ".json"))


def h(src, tr):
    return hashlib.sha256((src + "\x00" + tr).encode("utf8")).hexdigest()[:16]


def width(s):
    # Weergavebreedte: Chinese en Japanse tekens tellen dubbel.
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in s)


def context():
    return rd(I18N / "context.json")


def note_for(key, ctx):
    parts = []
    best = max((p for p in ctx["prefixes"] if key.startswith(p)), key=len, default=None)
    if best:
        parts.append(ctx["prefixes"][best])
    if key in ctx["keys"]:
        parts.append(ctx["keys"][key])
    return " ".join(parts)


def check_lang(code, base=I18N):
    """Returns (errors, warnings) as lists of (key, message)."""
    en, tr = texts("en", base), texts(code, base)
    errors, warns = [], []
    for k in en:
        if k not in tr:
            errors.append((k, "missing"))
    for k in tr:
        if k not in en:
            errors.append((k, "not in English (old key?)"))
    for k, s in en.items():
        t = tr.get(k)
        if t is None:
            continue
        if not isinstance(t, str) or not t.strip():
            errors.append((k, "empty"))
            continue
        if sorted(PH.findall(s)) != sorted(PH.findall(t)):
            errors.append((k, "placeholders differ: " + " ".join(sorted(PH.findall(s))) + " -> " + " ".join(sorted(PH.findall(t)))))
        for m in MARKS:
            if s.count(m) != t.count(m):
                errors.append((k, "the sign " + m + " appears " + str(s.count(m)) + "x in English, " + str(t.count(m)) + "x here"))
        for w in PROTECTED:
            if re.search(r"\b" + w + r"\b", s) and w not in t and not (w == "Python" and "MicroPython" in t):
                errors.append((k, "name '" + w + "' is missing (names stay as they are)"))
        if s.count("\n") != t.count("\n"):
            warns.append((k, "line breaks differ (" + str(s.count("\n")) + " in English)"))
        if code not in ("en", "nl") and t == s and re.search(r"[a-z]{4}", re.sub(r"\b(" + "|".join(PROTECTED) + r")\b|\{\w+\}", "", s)):
            warns.append((k, "same as English: not translated?"))
        ws, wt = width(s), width(t)
        if ws <= 24 and wt > max(ws * 1.8, ws + 10):
            warns.append((k, "much longer than English (" + str(wt) + " vs " + str(ws) + " characters); it may not fit on a button"))
        if (k.startswith("py.c.") or k.startswith("py.x.") or k.startswith("pyg.")) and ("\n" in t):
            errors.append((k, "a comment in Python code must stay on one line"))
    return errors, warns


def review_file(code, base=I18N):
    return base / "review" / (code + ".json")


def reviews(code, base=I18N):
    p = review_file(code, base)
    return rd(p) if p.exists() else {}


def coverage(code, base=I18N):
    en, tr, rv = texts("en", base), texts(code, base), reviews(code, base)
    ok = stale = comments = 0
    for k, s in en.items():
        r = rv.get(k)
        if not r:
            continue
        if r.get("status") == "comment":
            comments += 1
        elif r.get("h") == h(s, tr.get(k, "")):
            ok += 1
        else:
            stale += 1
    n = len(en)
    return {"keys": n, "reviewed": ok, "stale": stale, "comments": comments, "share": round(ok / n, 3) if n else 1}


def state_of(k, s, t, rv):
    r = rv.get(k)
    if not r:
        return "new"
    if r.get("status") == "comment":
        return "comment"
    return "ok" if r.get("h") == h(s, t) else "changed"


def shots(code):
    # Schermafbeeldingen uit `npm run lqa:shots -- CODE`: dist/lqa/shots/CODE/index.json + .jpg's.
    d = SHOTS / code
    idx = d / "index.json"
    if not idx.exists():
        return []
    import base64
    out = []
    for s in rd(idx):
        img = d / s["file"]
        if img.exists():
            out.append({"id": s["id"], "title": s["title"], "keys": s["keys"], "img": "data:image/jpeg;base64," + base64.b64encode(img.read_bytes()).decode()})
    return out


def page(code, out=None):
    langs = {l["code"]: l for l in languages()}
    assert code in langs and code not in ("en", "nl"), "pick a translated language: " + ", ".join(c for c in langs if c not in ("en", "nl"))
    en, nl, tr, rv, ctx = texts("en"), texts("nl"), texts(code), reviews(code), context()
    errors, warns = check_lang(code)
    auto = {}
    for k, m in errors:
        auto.setdefault(k, []).append(["error", m])
    for k, m in warns:
        auto.setdefault(k, []).append(["warn", m])
    sh = shots(code)
    seen = {}
    for s in sh:
        for k in s["keys"]:
            seen.setdefault(k, []).append(s["id"])
    rows = [{"k": k, "en": s, "nl": nl.get(k, ""), "tr": tr.get(k, ""), "ctx": note_for(k, ctx), "auto": auto.get(k, []),
             "state": state_of(k, s, tr.get(k, ""), rv), "seen": seen.get(k, []), "src": h(s, tr.get(k, "")),
             "was": rv.get(k, {}).get("note", "") if rv.get(k, {}).get("status") == "comment" else ""} for k, s in en.items()]
    data = {"lang": code, "name": langs[code]["name"], "style": ctx["style"], "langNote": ctx["languages"].get(code, ""),
            "rows": rows, "shots": [{"id": s["id"], "title": s["title"], "img": s["img"]} for s in sh],
            "made": datetime.date.today().isoformat()}
    tpl = (ROOT / "tools" / "lqa_page.html").read_text(encoding="utf8")
    body = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    page_html = tpl.replace("{{DATA}}", body).replace("{{LANG}}", html.escape(langs[code]["name"]))
    out = pathlib.Path(out) if out else ROOT / "dist" / "lqa" / ("review-" + code + ".html")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page_html, encoding="utf8")
    c = coverage(code)
    print("wrote", out.relative_to(ROOT) if out.is_relative_to(ROOT) else out, "-", len(rows), "texts,", c["reviewed"], "already reviewed,",
          len(sh), "screenshots,", len(errors), "errors,", len(warns), "warnings")
    return out


def write_json(p, d):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def apply(code, file, base=I18N):
    """Takes a reviewer's export. Returns a list of messages about items that were skipped."""
    ex = rd(pathlib.Path(file))
    assert ex.get("lang") == code, "this export is for '" + str(ex.get("lang")) + "', not '" + code + "'"
    en, tr, rv = texts("en", base), texts(code, base), reviews(code, base)
    by, date = str(ex.get("reviewer") or "").strip()[:80] or "unknown", str(ex.get("date") or datetime.date.today().isoformat())[:10]
    skipped, done = [], {"ok": 0, "fixed": 0, "comment": 0}
    for k, it in (ex.get("items") or {}).items():
        if k not in en:
            skipped.append(k + ": no longer exists")
            continue
        if it.get("src") != h(en[k], tr.get(k, "")):
            skipped.append(k + ": the English text or the translation changed after the page was made; review it again")
            continue
        st = it.get("status")
        if st == "ok":
            rv[k] = {"status": "ok", "h": h(en[k], tr[k]), "by": by, "date": date}
        elif st == "fix":
            new = str(it.get("text") or "").strip("\n")
            if not new.strip():
                skipped.append(k + ": empty correction")
                continue
            if sorted(PH.findall(en[k])) != sorted(PH.findall(new)):
                skipped.append(k + ": the correction changes the placeholders " + " ".join(PH.findall(en[k])))
                continue
            rv[k] = {"status": "fixed", "h": h(en[k], new), "by": by, "date": date, "was": tr[k]}
            if it.get("note"):
                rv[k]["note"] = str(it["note"])[:500]
            tr[k] = new
        elif st == "comment":
            rv[k] = {"status": "comment", "by": by, "date": date, "note": str(it.get("note") or "")[:500]}
        else:
            continue
        done["fixed" if st == "fix" else st] += 1
    write_json(base / (code + ".json"), tr)
    write_json(review_file(code, base), dict(sorted(rv.items())))
    print(code + ":", done["ok"], "approved,", done["fixed"], "corrected,", done["comment"], "comments,", len(skipped), "skipped")
    for s in skipped:
        print("  skipped", s)
    return skipped


def report(write=False):
    lines = ["# Translation status", "",
             "Made by `python3 tools/lqa.py report --write`. 'Reviewed' counts texts a language expert approved or corrected",
             "and that have not changed since. See docs/localization.md for how reviews work.", "",
             "| Language | Texts | Reviewed | Changed since review | Open comments | Errors | Warnings |", "|---|---|---|---|---|---|---|"]
    for l in languages():
        if l["code"] in ("en", "nl"):
            continue
        c, (e, w) = coverage(l["code"]), check_lang(l["code"])
        lines.append("| " + l["name"] + " (" + l["code"] + ") | " + str(c["keys"]) + " | " + str(c["reviewed"]) + " (" + str(round(c["share"] * 100)) + "%) | "
                     + str(c["stale"]) + " | " + str(c["comments"]) + " | " + str(len(e)) + " | " + str(len(w)) + " |")
    text = "\n".join(lines) + "\n"
    if write:
        (ROOT / "docs" / "translation-status.md").write_text(text, encoding="utf8")
        print("wrote docs/translation-status.md")
    print(text)


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd, rest = argv[0], argv[1:]
    if cmd == "check":
        verbose = "-v" in rest
        codes = [c for c in rest if c != "-v"] or [l["code"] for l in languages() if l["code"] != "en"]
        bad = 0
        for c in codes:
            e, w = check_lang(c)
            for k, m in e:
                print(c, "ERROR", k + ":", m)
            for k, m in (w if verbose else []):
                print(c, "warn ", k + ":", m)
            bad += len(e)
        print("lqa check:", ", ".join(c + " " + str(len(check_lang(c)[0])) + " errors/" + str(len(check_lang(c)[1])) + " warnings" for c in codes)
              + ("" if verbose else " (-v lists the warnings)"))
        return 1 if bad else 0
    if cmd == "page":
        out = rest[rest.index("--out") + 1] if "--out" in rest else None
        page(rest[0], out)
        return 0
    if cmd == "apply":
        apply(rest[0], rest[1])
        return 0
    if cmd == "report":
        report("--write" in rest)
        return 0
    print("unknown command:", cmd)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
