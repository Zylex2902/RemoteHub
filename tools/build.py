#!/usr/bin/env python3
"""Builds the app (site/app/index.html, everything inlined into one page) and the landing page
(site/index.html) from src/.

  python3 tools/build.py                    -> site/app/index.html (fonts loaded from site/app/fonts/)
                                               and site/index.html (the landing page)
  python3 tools/build.py --standalone FILE  -> also writes FILE with the fonts embedded,
                                               a single file that works on its own
"""
import base64, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, SITE = ROOT / "src", ROOT / "site" / "app"
LANDING = ROOT / "site" / "index.html"
rd = lambda p: p.read_text(encoding="utf8")


def blockly():
    # Blockly-kern plus de Nederlandse en Engelse menuteksten als objecten (BlocklyMsg.nl / .en),
    # zodat de pagina van taal kan wisselen zonder ze over elkaar heen te laden.
    v = ROOT / "vendor" / "blockly"
    out = [rd(v / "blockly_compressed.js"), "var BlocklyMsg = {};"]
    for lang in ("nl", "en"):
        out.append("(function () { var module = { exports: {} }, exports = module.exports;\n" + rd(v / ("msg-" + lang + ".js"))
                   + "\nBlocklyMsg." + lang + " = module.exports; })();")
    return "\n".join(out)


def build():
    html = rd(SRC / "base.html")
    parts = {"CSS": rd(SRC / "style.css"), "HUB": rd(SRC / "hub_program.py"), "PROTO": rd(SRC / "proto.js"),
             "QR": rd(ROOT / "vendor" / "qrcode.min.js").strip(), "I18N": rd(SRC / "i18n.js"), "BLOCKLY": blockly(), "CARDS": rd(SRC / "cards.js"), "LDRAW": rd(SRC / "ldraw.js"),
             "APP": rd(SRC / "app.js")}
    for key, text in parts.items():
        assert "</script>" not in text and "</style>" not in text, key
        assert html.count("{{" + key + "}}") == 1, key
        html = html.replace("{{" + key + "}}", text)
    return html


def viewer():
    # Bouwplan-viewer: src/buildview.js met three.js gebundeld tot site/app/ldraw/viewer.js (pas geladen bij gebruik).
    esb = ROOT / "node_modules" / ".bin" / "esbuild"
    out = SITE / "ldraw" / "viewer.js"
    if not esb.exists():
        print("skipped site/app/ldraw/viewer.js (run npm install for esbuild)")
        return
    banner = "/*! Hub Remote building-guide viewer. Includes three.js 0.170.0, Copyright 2010-2024 three.js authors, MIT License (see LICENSE-NOTICES.txt). */"
    subprocess.run([str(esb), str(SRC / "buildview.js"), "--bundle", "--minify", "--format=iife", "--target=es2020",
                    "--legal-comments=none", "--log-level=warning", "--banner:js=" + banner, "--outfile=" + str(out)], check=True, cwd=ROOT)
    print("built site/app/ldraw/viewer.js", out.stat().st_size, "bytes")


def landing():
    # De website rond de app: src/landing.html met src/landing.css erin.
    html, css = rd(SRC / "landing.html"), rd(SRC / "landing.css")
    assert html.count("{{CSS}}") == 1 and "</style>" not in css
    return html.replace("{{CSS}}", css)


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
    viewer()
    land = landing()
    LANDING.write_text(land, encoding="utf8")
    print("built site/index.html (landing)", len(land.encode()), "bytes")
    if "--standalone" in sys.argv:
        out = pathlib.Path(sys.argv[sys.argv.index("--standalone") + 1])
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(embed_fonts(page), encoding="utf8")
        print("built", out, out.stat().st_size, "bytes")
