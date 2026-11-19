# Third-party notices

Hub Remote is an independent project. It is not affiliated with, sponsored, authorized or
endorsed by the LEGO Group.

| Part | Where | Origin | Licence |
| --- | --- | --- | --- |
| Message layout, framing and CRC rules | `src/proto.js` | [LEGO/spike-prime-docs](https://github.com/LEGO/spike-prime-docs), Copyright 2024 The LEGO Group | Apache-2.0 with a modified section 6 (Trademarks): `licenses/LEGO-spike-prime-docs-LICENSE.txt` |
| QR code generator (minified) | `vendor/qrcode.min.js` | qrcode-generator 2.0.4, Copyright (c) 2009 Kazuhiko Arase | MIT: `licenses/MIT-qrcode-generator.txt` |
| Fredoka typeface | `site/fonts/fredoka-latin-wght-normal.woff2` | The Fredoka Project Authors | SIL Open Font License 1.1: `licenses/OFL-Fredoka.txt` |
| Nunito typeface | `site/fonts/nunito-latin-wght-normal.woff2` | The Nunito Project Authors | SIL Open Font License 1.1: `licenses/OFL-Nunito.txt` |

Notes

- `cobsEncode` and `cobsDecode` in `src/proto.js` are JavaScript ports of the reference example
  `examples/python/cobs.py` in LEGO/spike-prime-docs and have been modified. Everything else in
  `src/` was written for Hub Remote.
- `tests/vectors.json` holds expected values produced by running the reference examples from
  LEGO/spike-prime-docs on random input. It contains no code from that repository.
- LEGO® and SPIKE™ are trademarks of the LEGO Group. "QR Code" is a registered trademark of
  DENSO WAVE INCORPORATED. These names are used only to describe compatibility and function.
