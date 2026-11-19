# Hub Remote

Drive a programmable robot hub from your browser: phone, tablet or laptop, over Bluetooth, with no
game controller and no custom firmware.

Hub Remote is a small web app (a PWA). It connects with Web Bluetooth, stores one short Python
program in a program slot on the hub, and then sends live drive commands to it.

**Compatibility:** works with the LEGO® Education SPIKE™ Prime hub on its standard firmware
(app version 3). The firmware is not modified.

> Hub Remote is an independent project. LEGO® and SPIKE™ are trademarks of the LEGO Group, which
> does not sponsor, authorize or endorse this project.

## Features

- Three ways to drive: joystick, tank (one slider per motor), or tilting the phone
- Keyboard on a laptop: WASD or arrows, Shift for turbo, Space to stop, H for the horn
- Speed, turn speed and straight-line trim
- Motor test buttons to find the right ports and directions in seconds
- Two extra motors with their own name and speed, either hold-to-turn or a gripper with fixed
  open and closed positions
- Live sensors: distance, colour and force, plus an optional stop-for-obstacles guard
- A profile per robot, shareable as a link or QR code
- Hub battery level with low-battery warnings
- Play tab: public-domain songs and a one-octave piano on the hub's speaker, robot moods with a face
  on the hub's light matrix, and the phone speaking typed text while the hub moves its mouth
- Two dances and a route you record with the joystick and drive again; STOP, the space bar or the
  joystick takes over at once
- Without a hub, songs, moods and the piano play on the phone itself
- Reconnects by itself; the robot stops within about a second if the link drops
- Dutch and English, light and dark theme
- Phones, tablets and foldables, portrait and landscape; installable and usable offline

## Where it runs

| Device | Browser | Notes |
| --- | --- | --- |
| Windows, macOS, ChromeOS laptop | Chrome or Edge | also works from a local file |
| Android phone or tablet | Chrome | needs https; can be installed to the home screen |
| iPhone, iPad | a Web Bluetooth browser such as Bluefy | needs https; Safari has no Web Bluetooth |

Web Bluetooth needs a secure address, so phones and tablets need the app hosted over https. The
app is hosted on Netlify: `netlify.toml` publishes `site/` as is, with no build step. GitHub Pages
works too: enable Pages with "GitHub Actions" as the source and set the repository variable
`DEPLOY_PAGES` to `true`; `.github/workflows/pages.yml` then deploys every push to `main`.

## Using it

1. Turn the hub on and close other apps that are connected to it.
2. Tap **Connect to hub** and pick your hub. If it is not listed, press the Bluetooth button on the hub.
3. Drive. Under Settings, use **Test** to check which motor is left and right.

Good to know:

- The control program is written to a program slot (19 by default, selectable). **Whatever was in
  that slot is replaced.**
- The obstacle guard reads the distance sensor about five times a second, so it reacts with a
  short delay. Pick a larger stop distance at high speed.

## Status

Early. Version 1 was confirmed on a real hub. Everything since then (reconnect, battery, horn,
gripper, sensors, tank and tilt steering, profiles, and the version 4 songs, faces, speech, dances
and routes) is covered by automated tests against a simulated hub, and still needs confirming on
real hardware, on Android and in Bluefy. The sound features depend on `sound.beep` working on the
hub; the horn is the quickest check.

One part of the hub side is not documented by the LEGO Group: the program receives live data
through `hub.config['module_tunnel']`. Other community projects use the same call, but a firmware
update could change it.

## Development

Requirements: Node 20+, Python 3.9+, Chrome for the browser tests.

```
npm install
npm run build              # src/ -> site/index.html
npm run build:standalone   # also dist/hub-remote.html, one file with the fonts embedded
npm run test:unit          # protocol vectors + hub program logic
npm run test:browser       # full flow in headless Chrome against a simulated hub
```

`site/index.html` is generated. Edit the files in `src/` and rebuild.

Environment for the browser tests: `CHROME_PATH` selects a Chrome binary (otherwise run
`npx playwright install chromium` once); `NO_SANDBOX=1` is needed when running as root.

```
src/base.html        page markup with placeholders for the parts below
src/style.css        styles, light and dark theme, all screen layouts
src/proto.js         protocol: framing, CRC, messages (no DOM)
src/hub_program.py   the program that runs on the hub
src/i18n.js          Dutch and English texts
src/app.js           connection, controls, settings, profiles
site/                the deployable app: built page, manifest, service worker, icons, fonts
tests/               unit and browser tests, reference vectors
tools/build.py       builds the page
vendor/              minified QR code library
docs/                store listing text and trademark notes
```

How the link works: the page speaks the hub's Bluetooth protocol as published in
[LEGO/spike-prime-docs](https://github.com/LEGO/spike-prime-docs) to upload and start the program.
Live commands then travel as small text messages (`A:-60 B:60`, `pos E 120 80`, `beep`, `?`,
`tune 440:200 0:50`, `vol 60`, `img` with 25 brightness digits, `hush`) in tunnel messages. If no
message arrives for 800 ms the hub program stops the drive motors and clears any queued notes.

## Contributing

Issues and pull requests are welcome. Please keep third-party names out of the app name, icon,
identifiers and addresses; `docs/trademarks.md` explains why and how compatibility is described.

## Licence

MIT for the code written for Hub Remote: see `LICENSE`. Third-party parts keep their own licences:
see `THIRD-PARTY-NOTICES.md` and `licenses/`.
