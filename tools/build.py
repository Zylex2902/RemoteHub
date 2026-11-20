#!/usr/bin/env python3
"""Builds the app (site/app/index.html, everything inlined into one page) and the landing page
(site/index.html) from src/.

  python3 tools/build.py                    -> site/app/index.html (fonts loaded from site/app/fonts/)
                                               and site/index.html (the landing page)
  python3 tools/build.py --standalone FILE  -> also writes FILE with the fonts embedded,
                                               a single file that works on its own
"""
import base64, html as htmlmod, json, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, SITE = ROOT / "src", ROOT / "site" / "app"
LANDING = ROOT / "site" / "index.html"
rd = lambda p: p.read_text(encoding="utf8")


def languages():
    return json.loads(rd(SRC / "i18n" / "languages.json"))


def texts(code):
    return json.loads(rd(SRC / "i18n" / (code + ".json")))


def review_coverage(code):
    # Deel van de teksten dat een taalexpert heeft goedgekeurd en dat sindsdien niet is veranderd (zie tools/lqa.py).
    if code in ("nl", "en"):
        return 1
    sys.path.insert(0, str(ROOT / "tools"))
    import lqa
    return lqa.coverage(code)["share"]


def i18n(everything=False):
    # Teksten van de meegebakken talen (of alle, voor het losse bestand) als I18N, plus de lijst LANGS
    # (code, eigen naam, Blockly-taal, LEGO-site, meegebakken, deel nagekeken door een taalexpert).
    langs = [dict(l, reviewed=review_coverage(l["code"])) for l in languages()]
    inline = {l["code"]: texts(l["code"]) for l in langs if everything or l.get("bundled")}
    return ("const I18N = " + json.dumps(inline, ensure_ascii=False, separators=(",", ":")) + ";\n"
            + "const LANGS = " + json.dumps(langs, ensure_ascii=False, separators=(",", ":")) + ";")


def blockly_msg(lang):
    v = ROOT / "vendor" / "blockly"
    return ("(function () { var module = { exports: {} }, exports = module.exports;\n" + rd(v / ("msg-" + lang + ".js"))
            + "\nBlocklyMsg['" + lang + "'] = module.exports; })();")


def blockly(everything=False):
    # Blockly-kern plus de menuteksten van de meegebakken talen als objecten (BlocklyMsg.nl, .en, ...),
    # zodat de pagina van taal kan wisselen zonder ze over elkaar heen te laden.
    out = [rd(ROOT / "vendor" / "blockly" / "blockly_compressed.js"), "var BlocklyMsg = {};"]
    for lang in sorted({l["blockly"] for l in languages() if everything or l.get("bundled")}):
        out.append(blockly_msg(lang))
    return "\n".join(out)


def lang_files():
    # Andere talen: site/app/lang/<code>.js, pas geladen als iemand die taal gebruikt.
    d = SITE / "lang"
    d.mkdir(exist_ok=True)
    want = set()
    for l in languages():
        if l.get("bundled"):
            continue
        name = l["code"] + ".js"
        want.add(name)
        body = ("/* BrickHubRemote texts: " + l["name"] + ". Blockly menu texts: Blockly 13.4.0, Copyright Google LLC, Apache License 2.0. */\n"
                + "I18N[" + json.dumps(l["code"]) + "] = " + json.dumps(texts(l["code"]), ensure_ascii=False, separators=(",", ":")) + ";\n"
                + blockly_msg(l["blockly"]) + "\n")
        (d / name).write_text(body, encoding="utf8")
    for old in d.glob("*.js"):
        if old.name not in want:
            old.unlink()
    print("built site/app/lang/ (" + ", ".join(sorted(n[:-3] for n in want)) + ")")


def check_keys():
    # Elke tekstsleutel in de pagina (data-i18n...) en elke t('...') in de app moet in en.json staan.
    en = texts("en")
    html, app = rd(SRC / "base.html"), rd(SRC / "app.js")
    used = set(re.findall(r'data-i18n(?:-title|-aria|-ph)?="([^"]+)"', html)) | set(re.findall(r"\bt\('([\w.\-]+)'", app))
    missing = sorted(k for k in used if k not in en and not k.endswith("."))   # "song." + id: built at runtime
    assert not missing, "texts missing in src/i18n/en.json: " + ", ".join(missing)


def build(everything=False):
    check_keys()
    html = rd(SRC / "base.html")
    parts = {"CSS": rd(SRC / "style.css"), "HUB": rd(SRC / "hub_program.py"), "PROTO": rd(SRC / "proto.js"),
             "QR": rd(ROOT / "vendor" / "qrcode.min.js").strip(), "I18N": i18n(everything), "BLOCKLY": blockly(everything),
             "LANGLOAD": rd(SRC / "langload.js"), "VERSION": json.loads(rd(ROOT / "package.json"))["version"], "CARDS": rd(SRC / "cards.js"), "LDRAW": rd(SRC / "ldraw.js"), "TOPY": rd(SRC / "topython.js"),
             "APP": rd(SRC / "app.js")}
    for key, text in parts.items():
        assert "</script>" not in text and "</style>" not in text, key
        assert html.count("{{" + key + "}}") == 1, key
        html = html.replace("{{" + key + "}}", text)
    return html


def viewer():
    # Bouwplan-viewer: src/buildview.js met three.js gebundeld tot site/app/bricks/viewer.js (pas geladen bij gebruik).
    esb = ROOT / "node_modules" / ".bin" / "esbuild"
    out = SITE / "bricks" / "viewer.js"
    if not esb.exists():
        print("skipped site/app/bricks/viewer.js (run npm install for esbuild)")
        return
    banner = "/*! BrickHubRemote building-guide viewer. Includes three.js 0.170.0, Copyright 2010-2024 three.js authors, MIT License (see LICENSE-NOTICES.txt). */"
    subprocess.run([str(esb), str(SRC / "buildview.js"), "--bundle", "--minify", "--format=iife", "--target=es2020",
                    "--legal-comments=none", "--log-level=warning", "--banner:js=" + banner, "--outfile=" + str(out)], check=True, cwd=ROOT)
    print("built site/app/bricks/viewer.js", out.stat().st_size, "bytes")


def landing():
    # De website rond de app: src/landing.html met src/landing.css erin.
    html, css = rd(SRC / "landing.html"), rd(SRC / "landing.css")
    assert html.count("{{CSS}}") == 1 and "</style>" not in css
    html = html.replace("{{CSS}}", css)
    # Donatielink uit src/site.json; leeg = de stukken tussen <!--donate--> en <!--/donate--> weglaten.
    donate = json.loads(rd(SRC / "site.json")).get("donate", "").strip()
    if donate:
        assert re.match(r"^https://[\w.-]+/[\w./-]+$", donate), "site.json: donate must be a plain https address"
        html = html.replace("<!--donate-->", "").replace("<!--/donate-->", "").replace("{{DONATE}}", htmlmod.escape(donate))
    else:
        html = re.sub(r"[ ]*<!--donate-->.*?<!--/donate-->\n?", "", html, flags=re.S)
    assert "{{DONATE}}" not in html and "<!--donate-->" not in html
    return html


def embed_fonts(html):
    for font in sorted((SITE / "fonts").glob("*.woff2")):
        ref = "url(fonts/" + font.name + ")"
        assert ref in html, ref
        html = html.replace(ref, "url(data:font/woff2;base64," + base64.b64encode(font.read_bytes()).decode() + ")")
    return html


if __name__ == "__main__":
    page = build()
    (SITE / "index.html").write_text(page, encoding="utf8")
    print("built site/app/index.html", len(page.encode()), "bytes")
    lang_files()
    viewer()
    land = landing()
    LANDING.write_text(land, encoding="utf8")
    print("built site/index.html (landing)", len(land.encode()), "bytes")
    if "--standalone" in sys.argv:
        out = pathlib.Path(sys.argv[sys.argv.index("--standalone") + 1])
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(embed_fonts(build(everything=True)), encoding="utf8")
        print("built", out, out.stat().st_size, "bytes")
