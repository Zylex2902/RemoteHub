# BrickHubRemote

Drive a programmable robot hub from your browser: phone, tablet or laptop, over Bluetooth, with no
game controller and no custom firmware.

BrickHubRemote is a small web app (a PWA). It connects with Web Bluetooth, stores one short Python
program in a program slot on the hub, and then sends live drive commands to it.

**Compatibility:** works with the LEGO® Education SPIKE™ Prime and SPIKE™ Essential hubs on their
standard firmware (app version 3). The firmware is not modified. On the small hub (2 ports, no speaker,
no light matrix) sounds play on the phone and pictures are skipped.

> BrickHubRemote is an independent project. LEGO® and SPIKE™ are trademarks of the LEGO Group, which
> does not sponsor, authorize or endorse this project.

## Features

- Three ways to drive: joystick, tank (one slider per motor), or tilting the phone
- Keyboard on a laptop: WASD or arrows, Shift for turbo, Space to stop, H for the horn
- Speed, turn speed and straight-line trim
- Motor test buttons to find the right ports and directions in seconds
- Two extra motors with their own name and speed: hold-to-turn, on/off (tap to start, tap again to
  stop), or a gripper with fixed open and closed positions
- Live sensors: distance, colour and force, plus an optional stop-for-obstacles guard
- A profile per robot, shareable as a link or QR code
- Hub battery level with low-battery warnings
- Code tab: a drag-and-drop block editor (Blockly) with puzzle blocks that snap together, 74 blocks
  in nine groups (events, movement, motors, light, sound, control, sensors, operators, variables):
  loops and if/else, number and true/false blocks that fit in slots (sums, random numbers, sensor
  values, and/or/not), variables, pictures you draw, and several stacks that start on events; the
  running block lights up
- Build a robot (Settings): the official SPIKE™ driving bases (Driving Base 1-3, Advanced Driving
  Base) and a two-motor SPIKE™ Essential car. A link opens LEGO® Education's own free building
  instructions; Use sets up a profile with the right ports and adds example programs (blocks and
  Python). Ports come from the wiring page in those instructions and LEGO Education's Python lessons
- Designed in BrickLink Studio? Export the model as LDraw (.ldr or .mpd) and open it under Build a
  robot: the app counts the SPIKE™ hub, motors and sensors by their LDraw part numbers (nothing is
  drawn), recognises the official driving bases, and otherwise suggests ports (LDraw has no cables,
  so this is a guess to check with the live wiring diagram). Studio's own `.io` files are not read
- Building guides (test): open an LDraw model (your own Studio export, or the example robot) as a
  step-by-step 3D guide: turn and zoom with your fingers, the new parts of each step in their real
  colour and earlier steps lighter, a parts list per step. Files without steps get steps made from
  the bottom up. The guide is kept with the robot's profile. The viewer (three.js) and the brick
  shapes (a 5 MB pack from the LDraw parts library: Technic, the SPIKE electronics, wheels and
  common bricks) load only when a guide opens; other parts show as a grey block. Two examples: a
  little brick robot; the Rover, a driving robot built only from parts of the SPIKE™ Prime set
  (hub, two medium motors, two wheels, ball caster, distance sensor, two 7L beams and pins); and the
  Veegbot (sweeper robot), with all three motors of the set: the large motor turns a sweeper arm with
  two scoops above the robot, the colour sensor looks at the floor, the force sensor is a bumper
- Wiring diagram: a drawing of the hub showing what goes on each port, from the profile; when the
  hub is connected it turns green or red per port (found or missing). Also in the share sheet
- Python: switch the Code tab to Python and write real MicroPython that runs on the hub, with the
  same modules as the official app's Python (`motor`, `motor_pair`, `light_matrix`, `sound`,
  `distance_sensor`, `runloop`, ...). A coloured editor with line numbers and auto-indent, examples
  that use your robot's ports, a cheat sheet, and the hub's `print()` output and error messages
  (the line with the error is marked)
- Play tab: public-domain songs and a one-octave piano on the hub's speaker, robot moods with a face
  on the hub's light matrix, and robot language: the hub says a typed sentence in beeps (one per
  syllable, a question rises) while it moves its mouth
- Two dances and a route you record with the joystick and drive again; STOP, the space bar or the
  joystick takes over at once
- Without a hub, songs, moods and the piano play on the phone itself
- Reconnects by itself; the robot stops within about a second if the link drops
- Dutch and English, light and dark theme
- Phones, tablets and foldables, portrait and landscape; installable and usable offline. On wide
  screens a Drive/Code switch in the header shows either the overview (driving, log, play,
  settings) or the block editor across the whole screen

## Where it runs

| Device | Browser | Notes |
| --- | --- | --- |
| Windows, macOS, ChromeOS laptop | Chrome or Edge | also works from a local file |
| Android phone or tablet | Chrome | needs https; can be installed to the home screen |
| iPhone, iPad | a Web Bluetooth browser such as Bluefy | needs https; Safari has no Web Bluetooth |

Web Bluetooth needs a secure address, so phones and tablets need the app hosted over https. The
site is hosted on Netlify: `netlify.toml` publishes `site/` as is, with no build step. The root is
a landing page that explains the app and the ways to use it (web, Android, iPhone/iPad); the app
itself lives at `/app/`. GitHub Pages
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
gripper, sensors, tank and tilt steering, profiles, the version 4 songs, faces, robot language,
dances and routes, and the version 5 programming cards) is covered by automated tests against a simulated hub, and still needs confirming on
real hardware, on Android and in Bluefy. The sound features depend on `sound.beep` working on the
hub; the horn is the quickest check.

One part of the hub side is not documented by the LEGO Group: the program receives live data
through `hub.config['module_tunnel']`. Other community projects use the same call, but a firmware
update could change it.

## Development

Requirements: Node 20+, Python 3.9+, Chrome for the browser tests.

```
npm install
npm run build              # src/ -> site/app/index.html (the app) and site/index.html (landing page)
npm run build:standalone   # also dist/brickhubremote.html, one file with the fonts embedded
npm run test:unit          # protocol vectors + hub program logic
npm run test:browser       # full flow in headless Chrome against a simulated hub
npm run vendor:blockly     # after updating the blockly package: copy it into vendor/ and site/app/
npm run screenshots        # app screenshots for the landing page (site/img/), after UI changes
```

`site/app/index.html` and `site/index.html` are generated. Edit the files in `src/` and rebuild.

Environment for the browser tests: `CHROME_PATH` selects a Chrome binary (otherwise run
`npx playwright install chromium` once); `NO_SANDBOX=1` is needed when running as root.

```
src/base.html        page markup with placeholders for the parts below
src/style.css        styles, light and dark theme, all screen layouts
src/proto.js         protocol: framing, CRC, messages (no DOM)
src/hub_program.py   the program that runs on the hub
src/i18n.js          Dutch and English texts
src/cards.js         programming blocks: block set, conversion and the program runner (no DOM)
src/app.js           connection, controls, settings, profiles
src/landing.html     the landing page (with src/landing.css)
site/                the deployable site: landing page, screenshots in img/
site/app/            the app: built page, manifest, service worker, icons, fonts, Blockly media
tests/               unit and browser tests, reference vectors
tools/build.py       builds the app page and the landing page
tools/screenshots.js makes the landing page screenshots from the app and a simulated hub
vendor/              minified QR code library, Blockly (block editor) and its Dutch and English texts
docs/                store listing text and trademark notes
```

How the link works: the page speaks the hub's Bluetooth protocol as published in
[LEGO/spike-prime-docs](https://github.com/LEGO/spike-prime-docs) to upload and start the program.
Live commands then travel as small text messages (`A:-60 B:60`, `pos E 120 80`, `beep`, `?`,
`tune 440:200 0:50`, `vol 60`, `img` with 25 brightness digits, `hush`, `deg A:360:50`, `goto A 90 50 s`,
`smode A 2`, `light 9`, `eyes A 100 100 0 0`, `halt`) in tunnel messages; the hub reports `btn L 1` and
`ges 2` for its buttons and gestures. If no message arrives for 800 ms the hub program stops the drive
motors, any move over degrees still under way, and the queued notes.

Programs made with blocks run in the page (`src/cards.js`), not on the hub: the page sends the commands
above and reads motor positions and the motion sensor from the hub's status messages.

Python programs do run on the hub. The page stops the remote-control program, uploads the code to the
slot below it (18 by default), starts it and shows the console output. When the program ends or is
stopped (STOP, another screen, the window losing focus) the page starts the remote-control program again
without uploading it. A Python program has no 800 ms failsafe: if the connection drops while it runs, it
keeps running until it ends or is stopped with the button on the hub.

## Contributing

Issues and pull requests are welcome. Please keep third-party names out of the app name, icon,
identifiers and addresses; `docs/trademarks.md` explains why and how compatibility is described.

## Licence

MIT for the code written for BrickHubRemote: see `LICENSE`. Third-party parts keep their own licences:
see `THIRD-PARTY-NOTICES.md` and `licenses/`.
