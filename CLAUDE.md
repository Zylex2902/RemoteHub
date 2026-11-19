# Hub Remote: notes for Claude Code

Web app (PWA) that drives a LEGO Education SPIKE Prime hub on stock firmware over Web Bluetooth.
Public, free, independent project. Read `README.md` first; this file holds what it does not.

## Commands

```
npm run build              # src/ -> site/index.html (never edit site/index.html by hand)
npm run test:unit          # protocol vectors + hub program logic (fast, no browser)
npm run test:browser       # headless Chrome against a simulated hub (ONLY=AE limits sections)
npm run build:standalone   # dist/hub-remote.html, single file with fonts embedded
```

Browser tests: set `CHROME_PATH` or run `npx playwright install chromium`; `NO_SANDBOX=1` as root.
CI (`.github/workflows/pages.yml`) fails if `site/index.html` is not rebuilt and committed.

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
- Every user-facing string lives in `src/i18n.js` under both `nl` and `en`. Keep the key sets equal.
- Safety behaviour to preserve: hub-side stop after 800 ms without a message; page keepalive
  every 250 ms; STOP acts on pointer down; everything stops on blur, tab hidden and view switch.
  Dances and route replay run only in the Drive view and end on `halt()` or on any joystick,
  tilt, tank or key input. An extra motor in on/off mode keeps turning after the tap, so it
  must stay in `st.aux` and be cleared by `halt()` (STOP, blur, hidden, view switch, link lost).
- Robot language plays on the hub (beeps per syllable via `tune`); the owner rejected speech
  from the phone, because it does not come from the robot.
- Songs in the app are public domain or written for this project. Do not add copyrighted melodies.
- CI: the GitHub Pages deploy runs only when the repository variable `DEPLOY_PAGES` is `true`;
  the app is hosted on Netlify (`netlify.toml`, publishes `site/` with no build step).
- Layout must keep STOP visible without scrolling on every size in `tests/test_page.js` section E
  and both fold postures in `tests/test_fold.js`.

## Status and open work

- v1 (connect, upload, drive) was confirmed on a real hub by the owner. v2, v3 and v4 features
  are tested only against the simulated hub.
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
  Bluetooth layer, a plain web view has no Web Bluetooth); donation link on the website only.

## Intellectual property guardrails

Follow `docs/trademarks.md` for every change: no "LEGO" or "SPIKE" in names, identifiers, icons,
URLs or store metadata; compatibility stated once with symbols and the disclaimer; keep the
notices. Warn the owner before adding anything that could touch a patent, copyright or trademark.

## Project look

Light and child-friendly by default (round shapes, large controls), with a dark theme as an option.
Fonts are Fredoka and Nunito, hosted with the app.

The owner's personal working and design rules are in `CLAUDE.local.md`, which is not committed.
