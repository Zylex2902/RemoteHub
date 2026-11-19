# Third-party notices

Hub Remote is an independent project. It is not affiliated with, sponsored, authorized or
endorsed by the LEGO Group.

| Part | Where | Origin | Licence |
| --- | --- | --- | --- |
| Message layout, framing and CRC rules | `src/proto.js` | [LEGO/spike-prime-docs](https://github.com/LEGO/spike-prime-docs), Copyright 2024 The LEGO Group | Apache-2.0 with a modified section 6 (Trademarks): `licenses/LEGO-spike-prime-docs-LICENSE.txt` |
| QR code generator (minified) | `vendor/qrcode.min.js` | qrcode-generator 2.0.4, Copyright (c) 2009 Kazuhiko Arase | MIT: `licenses/MIT-qrcode-generator.txt` |
| Blockly block editor | `vendor/blockly/` (inlined in the page), `site/blockly-media/` | Blockly 13.4.0, Copyright Google LLC | Apache-2.0: `licenses/Apache-2.0-Blockly.txt` |
| 3D viewer for building guides | `site/app/ldraw/viewer.js` (bundled from `src/buildview.js`) | three.js 0.170.0 (core, LDrawLoader, OrbitControls, RoomEnvironment), Copyright 2010-2024 three.js authors | MIT: `licenses/MIT-three.js.txt` |
| Brick shapes and colour table | `site/app/ldraw/parts.pack` (files unchanged, gzip-packed by `tools/ldraw_pack.py`; author lines kept in every file) | LDraw.org Parts Library, its many authors (named in each file) | CC BY 2.0 and CC BY 4.0: `licenses/LDraw-CAreadme.txt`, `licenses/CC-BY-2.0-LDraw.txt`, `licenses/CC-BY-4.0-LDraw.txt` |
| Fredoka typeface | `site/fonts/fredoka-latin-wght-normal.woff2` | The Fredoka Project Authors | SIL Open Font License 1.1: `licenses/OFL-Fredoka.txt` |
| Nunito typeface | `site/fonts/nunito-latin-wght-normal.woff2` | The Nunito Project Authors | SIL Open Font License 1.1: `licenses/OFL-Nunito.txt` |

Notes

- `cobsEncode` and `cobsDecode` in `src/proto.js` are JavaScript ports of the reference example
  `examples/python/cobs.py` in LEGO/spike-prime-docs and have been modified. Everything else in
  `src/` was written for Hub Remote.
- `site/app/ldraw/demo.ldr` (the example building guide) is an own design made for Hub Remote.
- `tests/vectors.json` holds expected values produced by running the reference examples from
  LEGO/spike-prime-docs on random input. It contains no code from that repository.
- LEGO® and SPIKE™ are trademarks of the LEGO Group. "QR Code" is a registered trademark of
  DENSO WAVE INCORPORATED. These names are used only to describe compatibility and function.
