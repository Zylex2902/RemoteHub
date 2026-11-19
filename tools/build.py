#!/usr/bin/env python3
"""Builds site/index.html from src/ (everything inlined into one page).

  python3 tools/build.py                    -> site/index.html (fonts loaded from site/fonts/)
  python3 tools/build.py --standalone FILE  -> also writes FILE with the fonts embedded,
                                               a single file that works on its own
"""
import base64, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, SITE = ROOT / "src", ROOT / "site"
rd = lambda p: p.read_text(encoding="utf8")


def build():
    html = rd(SRC / "base.html")
    parts = {"CSS": rd(SRC / "style.css"), "HUB": rd(SRC / "hub_program.py"), "PROTO": rd(SRC / "proto.js"),
             "QR": rd(ROOT / "vendor" / "qrcode.min.js").strip(), "I18N": rd(SRC / "i18n.js"), "CARDS": rd(SRC / "cards.js"),
             "APP": rd(SRC / "app.js")}
    for key, text in parts.items():
        assert "</script>" not in text and "</style>" not in text, key
        assert html.count("{{" + key + "}}") == 1, key
        html = html.replace("{{" + key + "}}", text)
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
    print("built site/index.html", len(page.encode()), "bytes")
    if "--standalone" in sys.argv:
        out = pathlib.Path(sys.argv[sys.argv.index("--standalone") + 1])
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(embed_fonts(page), encoding="utf8")
        print("built", out, out.stat().st_size, "bytes")
