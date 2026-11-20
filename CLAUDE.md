# BrickHubRemote: notes for Claude Code

Web app (PWA) that drives a LEGO Education SPIKE Prime or SPIKE Essential hub on stock firmware over
Web Bluetooth.
Public, free, independent project. Read `README.md` first; this file holds what it does not.

## Commands

```
npm run build              # src/ -> site/app/index.html (app) + site/index.html (landing); never edit them
npm run screenshots        # landing page screenshots (site/img/) from the app; rerun after UI changes
npm run test:unit          # protocol vectors + hub program logic (fast, no browser)
npm run test:browser       # headless Chrome against a simulated hub (ONLY=AE limits sections)
npm run build:standalone   # dist/brickhubremote.html, single file with fonts and all languages
npm run lqa:check          # translation checks (also in test:unit); tools/lqa.py page|apply|report
npm run lqa:shots -- de    # screenshots per screen in a language, for the review page
```

Browser tests: set `CHROME_PATH` or run `npx playwright install chromium`; `NO_SANDBOX=1` as root.
CI (`.github/workflows/pages.yml`) fails if `site/app/index.html` or `site/index.html` is not rebuilt
and committed. The site root is the landing page (`src/landing.html`, `src/landing.css`); the app is
at `/app/`. The landing page must stay honest about availability: web and Android (install from
Chrome) work today, iPhone/iPad via Bluefy; store apps are 'coming'/'planned' until they exist, and
no App Store or Google Play badges before then.

## Things that bite

- The hub program (`src/hub_program.py`) is uploaded as text. Keep it ASCII and MicroPython-safe.
  When its behaviour changes, bump `VERSION` there and `HUB_VERSION` in `src/app.js` together:
  the page skips the upload when a running program answers `?` with the same version.
- Hub API calls that are confirmed on a real hub: `motor.run`, `motor.stop`, the tunnel
  (`hub.config['module_tunnel']`, undocumented), `light_matrix`. Used but not yet confirmed on
  hardware: `sound.beep`, `sound.stop`, `motor.run_for_degrees` (called without `await`, as other
  projects do). Music is a note queue played from the drive loop, one `sound.beep` at a time, so
  it never blocks driving; faces use `light_matrix.set_pixel`.
  Wrap anything new in try/except so a missing API cannot stop the drive loop.
- Upload packets start at min(hub limit, 180) bytes and fall back to 20 if the upload fails;
  phones often allow less than the hub reports.
- Every user-facing string lives in `src/i18n/<code>.json`, one file per language, all with the same keys in
  the same order (`en.json` is the source, `nl.json` the owner's original). A new or changed text goes into
  every language file; changing English expires earlier reviews of that key. `npm run lqa:check` fails on
  missing keys, changed placeholders, lost ®/™ and translated product names. nl and en are inlined in the
  page; other languages are built into `site/app/lang/<code>.js` and loaded by `src/langload.js` before the
  app starts (or on a runtime switch); if that fails, t() falls back to English and Settings says so. The
  translations were machine-made; Settings shows the share reviewed by a language expert (from
  `src/i18n/review/`). Review flow, adding a language: `docs/localization.md`. The landing page stays nl/en.
- Safety behaviour to preserve: hub-side stop after 800 ms without a message; page keepalive
  every 250 ms; STOP acts on pointer down; everything stops on blur, tab hidden and view switch.
  Dances and route replay run only in the Drive view and end on `halt()` or on any joystick,
  tilt, tank or key input. An extra motor in on/off mode keeps turning after the tap, so it
  must stay in `st.aux` and be cleared by `halt()` (STOP, blur, hidden, view switch, link lost).
- The Code tab is a Blockly editor (13.4.0, vendored in `vendor/blockly/`, inlined by the build,
  media in `site/app/blockly-media/`; update with `npm run vendor:blockly`). Block definitions and the
  toolbox are generated from `Cards.TYPES` and `Cards.REP` in `src/cards.js`; programs are stored as
  Blockly JSON (`G.programs[].ws`) and turned into the runner format with `Cards.fromBlocks` when
  Start is pressed. Old card programs are converted with `Cards.toBlocks` on load. Sheets, toasts
  and the banner sit above Blockly's layers (z-index 2000+).
- Programs (`src/cards.js`, Code tab) run in the page, not on the hub. Dances, routes and
  programs share the drive loop: `st.run` takes over `targets()`/`outputs()`, and `halt()` stops it.
  Moves over degrees go to the hub as `deg`/`goto`; the page sends zero speeds first (`syncOut`)
  because a non-zero speed for a port cancels its move on the hub. Block texts live in i18n as
  `card.*`, `blk.*`, `opt.*`, `src.*`; `tests/test_cards.js` checks every key and every block.
- Not confirmed on hardware: the IMU fields in status messages (units: degrees, or tenths, which
  the runner detects; the sign of pitch/roll for 'tilts forward' is a guess), `button.pressed`,
  `motion_sensor.gesture()` (gesture numbers), `light.color`, `distance_sensor.show`,
  `motor.run_to_absolute_position`, stop modes via `motor.stop(port, stop=...)`.
- Robot language plays on the hub (beeps per syllable via `tune`); the owner rejected speech
  from the phone, because it does not come from the robot.
- Songs in the app are public domain or written for this project. Do not add copyrighted melodies.
- CI: the GitHub Pages deploy runs only when the repository variable `DEPLOY_PAGES` is `true`;
  the app is hosted on Netlify (`netlify.toml`, publishes `site/` with no build step: landing at `/`, app at `/app/`).
- Two hub kinds: SPIKE Prime (6 ports) and SPIKE Essential (2 ports), named in the UI with ™ as
  descriptions (rule 2 of `docs/trademarks.md`). The small hub (owner has one) has ports A-B, and, as far as known, no speaker
  and no 5x5 light matrix: sounds then play on the phone, pictures are skipped. Detection: product
  value in the info response (only 0 = Prime is documented), and the hub program's `hw <matrix>
  <sound> <ports>` line; Settings can override. Hub program imports must never assume
  `light_matrix`, `sound`, `button` or ports C-F exist. Not yet tried on a real small hub.
- Wide layouts (>= 900 px and both fold postures) have no tab bar: a header switch (`#modeSwitch`)
  toggles `body.codefull`. The overview never shows the editor; Code fills the screen. Programs
  and driving are never on screen together, and drive keys are ignored in the Code view.
- Code has two modes (`G.codeMode`): Blocks and Python. Python programs (`G.py[]`, plain text) run ON
  the hub: `runPython()` stops the control program, uploads to `pySlot()` (control slot - 1), starts it,
  shows console messages (0x21) in `#pyOut` and marks the traceback line. A stop notification (0x20)
  or STOP/halt() (`stopPython()`) leads to `pyEnded()`, which starts the control slot again (no upload).
  This is the one place without the 800 ms failsafe: link loss leaves the Python program running, and
  the page says so; reconnecting stops it by uploading the control program. Phase is `python` meanwhile
  (no driving). The fake hub keeps a file per slot and treats anything not starting with the control
  program's first line as Python (print('...') echoes, `1/0` gives a traceback, `while True` keeps running).
- In Code, start and STOP are one round button (`#btnPlay`) in the editor's bottom-right corner.
  It acts on pointer down (start when idle, STOP while running) and is registered with Blockly's
  component manager as a positionable, so Blockly moves its trash can and zoom buttons above it.
  In Python mode it moves into `#pyEdit` (`showCodeMode()`) and back into `#blocklyDiv` after.
- Build a robot: `MODELS` in `src/app.js` (Driving Base C+D with tool motor E; Driving Base 3 adds a
  colour sensor on B; Advanced Driving Base drives on E (left) + A (right), tools C+D, colour sensors
  B+F; Essential car A+B). Ports were read from the wiring page of LEGO Education's instruction PDFs
  and the `motor_pair.pair(PAIR_1, port.C, port.D)` / `(port.E, port.A)` lines in their Python lessons;
  left/right of the Advanced Driving Base is not confirmed on hardware. We only LINK to their
  instructions (rule 9 of `docs/trademarks.md`). Profiles store `model`; the share link appends it.
  `wiringSvg()` is our own schematic; live colours come from `st.motors`/`st.sensors`.
- LDraw import (`src/ldraw.js`, no DOM, `tests/test_ldraw.js`): reads type-1 lines of .ldr/.mpd (submodels
  via `0 FILE`), maps part numbers to kinds (hub 45601/67718/53444, Essential hub 67351, motors 54675/69730
  large, 54696 medium, 68488 small, sensors 37308 colour, 37316 distance, 37312 force, matrix 47592; checked
  against the official LDraw library), matches the official driving bases by their electronics, else
  suggests ports (drive pair A+B, extra motors next, then sensors). Profiles keep `sens` {port: kind},
  also in the share link. Studio `.io` (password-protected zip) is deliberately not read.
- Building guides: `src/buildview.js` (three.js 0.170 LDrawLoader + OrbitControls) is bundled by
  `npm run build` (esbuild) into `site/app/bricks/viewer.js`, loaded lazily; CI checks it is rebuilt. Bricks
  come from `site/app/bricks/parts.pack` (gzip of `0 FILE` sections, made by `tools/ldraw_pack.py` from the
  official LDraw `complete.zip`, not in the repo); the page packs model + needed parts into one MPD,
  so nothing is fetched elsewhere. The loader renames `s/x` to `parts/s/x` and `48/x` to `p/48/x`:
  embedded names must match. Guides are stored per profile in localStorage `hubremote3-builds`.
  Opening one calls `halt()`; arrow keys step, Escape closes. Owner-approved exception to the
  imagery rule (rule 6 of `docs/trademarks.md`): 3D bricks only inside the app, never on the site
  or store screenshots. Does not work as a file:// page or in the standalone build. LDraw.org's
  terms (rule 10): every guide shows the credit "The LDraw Parts Library" (CC BY) with links to
  www.ldraw.org and LICENSE-NOTICES.txt; "LDraw" never in our name, titles or URLs (files live in
  `site/app/bricks/`), LDraw™ with the Jessiman Estate trademark notice.
- Example guides are own designs: `site/app/bricks/demo.ldr` (bricks), `rover.ldr` and `veegbot.ldr`, written
  by `tools/designs/rover.py` / `veegbot.py` (need `LDRAW_ZIP`; shared checks in `common.py`). They check every pin/axle end sits inside a real
  hole (from the LDraw hole primitives, `tools/designs/geo.py`), bodies do not overlap, wheels and caster
  touch the same ground, and part counts stay within LEGO Education's SPIKE Prime element overview.
  Use cable-less motor/sensor parts (54696p01, 37316): the `c01` versions shift the part and draw a
  cable coil through the model. `veegbot.py` also checks that the turning arm's circle is clear. Design
  coordinates have the front at +Z and are written turned to face -Z. Not built physically yet.
- Blocks as Python (`src/topython.js`, `tests/test_topython.js` runs the output in CPython against stub hub
  modules): one `async def stackN()` per stack, helpers only for what is used; comments come from `pyg.*`.
- Draw a route: `Cards.fromPath` simplifies the finger line (Ramer-Douglas-Peucker) into turn + moveFor
  cards; it runs with `runCards()` in the Drive view (any steering input stops it) or is saved as a program.
- Keyboard: actions are bound to `KeyboardEvent.code` (position), stored in `G.keys` (`KEY_DEF` defaults,
  `cleanKeys()` validates). Labels via `keyName()`: `navigator.keyboard.getLayoutMap()` where it exists,
  else an AZERTY/QWERTZ guess from the language. Arrows always drive; Escape, Tab, arrows and F-keys
  cannot be bound. Every place that names a key goes through `showKeys()`.
- Game controller: `pollPad()` in the 50 ms tick, standard mapping only. Ignored in Code and the building
  guide; B/Start = STOP; after any `halt()` the stick must return to centre (`st.pad.lock`) before it
  drives again; disconnect calls `halt()`.
- Feedback (`openFeedback()` in `src/app.js`): posts form `feedback` to `/` as Netlify Forms (the hidden
  `<form data-netlify>` in `base.html` must stay so Netlify detects it at deploy). The owner must turn on form
  detection and email notifications in Netlify (Site configuration > Forms). Children use the app: keep
  contact optional, never send the hub's name, show the details before sending, no contact info in the
  GitHub link. The landing FAQ promises no cookies, statistics or accounts: keep it true.
- Service worker (`site/app/sw.js`): network first; offline it serves the cache, and only a page load may fall
  back to `index.html` (a script such as `lang/xx.js` must fail, not get HTML). Bump `CACHE` on changes.
- Light animation (`G.anim`, Play tab, and the `anim` block): frames go out as `img`; `halt()` stops it.
- Layout must keep STOP visible without scrolling on every size in `tests/test_page.js` section E
  and both fold postures in `tests/test_fold.js`.

## Status and open work

- v1 (connect, upload, drive) was confirmed on a real hub by the owner. v2 to v5 features and
  Python mode are tested only against the simulated hub. To confirm for Python: upload to a second
  slot, the 0x20 stop notification when a program ends, console text in 0x21, and that restarting
  the control slot works without an upload.
- To confirm on hardware: horn, gripper moves, sensors and obstacle guard, reconnect, battery,
  v4 songs and moods (does each short `sound.beep` play cleanly one after another?), faces,
  dances, recorded routes.
- Bluefy on iPhone (owner, hub firmware 1.8.149): the hub answers the info request, then the link
  drops at once ("Niet verbonden"); a first try failed with the bare message "2". Cause unknown.
  The page now logs each connection step and the step where the link dropped, and retries twice
  without the chooser. Ask for a log screenshot before changing more.
- To confirm on devices: Android Chrome, Bluefy on iPhone and iPad, tilt steering (the sign of
  the axes in landscape is a guess), a real foldable.
- Not started: update notice when a new version is online; native iOS wrapper (needs a native
  Bluetooth layer, a plain web view has no Web Bluetooth).
- Donation link (website only, never in the app): set `donate` in `src/site.json` to the owner's
  Buy Me a Coffee address and rebuild; empty leaves the section and footer link out. The owner has
  not made the page yet, so it is off. Wording ties it to the developer, no LEGO marks, no perks.

## Descriptions stay current

After every feature added or changed, in the same change: update the README (intro, Features, Status),
`docs/store-listing.md` (store texts in English and Dutch, and the GitHub About text, website and topics)
and the landing page where it lists features. No tool here can edit GitHub's About box: when its text
changes, give the owner the new text to paste. Keep marks out of the About text (as for store titles).

## Intellectual property guardrails

Follow `docs/trademarks.md` for every change. In short: our name, icon, logo, domain and store
titles carry no LEGO marks; naming LEGO® and SPIKE™ products to describe compatibility is fine,
also in headings and in the app, with the symbols and the disclaimer; no LEGO imagery and nothing
that suggests endorsement. The Code tab offers the same kinds of commands as the official hub app
with our own names, icons, colours and texts; the block style is Blockly's own renderer, and
"Scratch" (name, cat, colours, icons) is never used. Warn the owner before adding anything else
that could touch a patent, copyright or trademark.

## Project look

Light and child-friendly by default (round shapes, large controls), with a dark theme as an option.
Fonts are Fredoka and Nunito, hosted with the app.
Accent: teal `#0a7f72` in the light theme, green `#3ddc97` in the dark theme (also the icon). Avoid
the stock "generated" look on the site and in the app: no emoji as icons (pictures on buttons use the
hub's own 5x5 images), no gradients or glows on surfaces, no pill "kickers", no grids of identical
icon cards, no slogans or rhetorical questions ("Ready for the next step?"), no "in three easy steps".
Write plain, specific sentences that say what the app does and what is not tested yet.

The owner's personal working and design rules are in `CLAUDE.local.md`, which is not committed.
