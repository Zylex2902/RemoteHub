// LDraw import: counting SPIKE parts in .ldr/.mpd files (as BrickLink Studio exports them) and the port suggestion.
const assert = require('assert');
const LDraw = require('../src/ldraw.js');

const at = (file, x = 0) => `1 16 ${x} 0 0 1 0 0 0 1 0 0 0 1 ${file}`;
let checks = 0;
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); checks++; };

// part numbers with and without cable/print suffixes, paths and upper case
eq(['45601.dat', '45601c01.dat', '45601p01.dat', '53444c01.dat', '67351c01.dat', '54675c01.dat', '69730.dat', '54696p01c01.dat', 'parts\\68488.DAT',
  '37308c01.dat', '37316.dat', '37312c01.dat', '47592c01.dat', '22127.dat', '3001.dat', '45610.dat', 'u9364c01.dat'].map(LDraw.kindOf),
['hub6', 'hub6', 'hub6', 'hub6', 'hub2', 'motorL', 'motorL', 'motorM', 'motorS', 'color', 'distance', 'force', 'matrix', 'otherHub', null, null, null]);

// a single .ldr: Driving Base 3-like (hub, 3 motors, colour sensor) among ordinary bricks
const db3 = ['0 My Robot', '0 Name: myrobot.ldr', '0 Author: Kid', at('45601c01.dat'), at('54696p01c01.dat', 40), at('54696p01c01.dat', -40), at('54675c01.dat', 80),
  at('37308c01.dat'), at('3001.dat'), at('32524.dat'), '0 STEP', ''].join('\r\n');
let r = LDraw.parse(db3);
eq(r, { title: 'My Robot', counts: { hub6: 1, motorM: 2, motorL: 1, color: 1 }, parts: 7 });
let s = LDraw.suggest(r.counts);
eq(s.model, 'db3'); eq(s.hub, 'big');
eq(s.drive, { type: 'motorM', left: 'A', right: 'B' }); eq(s.aux, [{ port: 'C', type: 'motorL' }]); eq(s.sens, { D: 'color' }); eq(s.notPlaced, 0);

// .mpd with submodels used twice: the wheel assembly holds a motor, referenced from the main model
const mpd = ['0 FILE main.ldr', '0 Advanced', at('45601.dat'), at('wheel.ldr'), at('wheel.ldr', 100), at('tool.ldr'), at('37308c01.dat'), at('37308c01.dat', 5),
  '0 FILE wheel.ldr', '0 wheel', at('54675c01.dat'), at('3001.dat'),
  '0 FILE tool.ldr', at('54696p01c01.dat'), at('54696p01c01.dat', 3),
  '0 NOFILE', '0 !DATA picture.png', '0 !: aGVsbG8='].join('\n');
r = LDraw.parse(mpd);
eq(r.counts, { hub6: 1, motorL: 2, motorM: 2, color: 2 }); eq(r.parts, 9); eq(r.title, 'Advanced');
s = LDraw.suggest(r.counts);
eq(s.model, 'adb'); eq(s.drive, { type: 'motorL', left: 'A', right: 'B' }); eq(s.aux.map((a) => a.port + a.type), ['CmotorM', 'DmotorM']); eq(s.sens, { E: 'color', F: 'color' });

// Essential: small hub, two small motors -> the two-motor car; a light matrix makes it no longer an exact match
r = LDraw.parse([at('67351c01.dat'), at('68488c01.dat'), at('68488c01.dat')].join('\n'));
s = LDraw.suggest(r.counts);
eq([s.hub, s.model, s.drive.left, s.drive.right], ['small', 'ess', 'A', 'B']);
s = LDraw.suggest({ hub2: 1, motorS: 1, matrix: 1, color: 1 });
eq([s.hub, s.model, s.drive, s.aux, s.sens, s.notPlaced], ['small', '', null, [{ port: 'A', type: 'motorS' }], { B: 'color' }, 1]);

// too many devices for six ports; no hub in the file; another kind of hub
s = LDraw.suggest({ hub6: 1, motorM: 4, color: 2, distance: 1 });
eq([s.drive.left, s.drive.right, s.aux.length, Object.keys(s.sens).join(''), s.notPlaced], ['A', 'B', 2, 'EF', 1]);
s = LDraw.suggest({ motorL: 2 }); eq([s.hub, s.noHub, s.model], ['big', true, '']);
s = LDraw.suggest({ otherHub: 1, motorL: 2 }); eq(s.otherHub, true);

// our own example designs: the import suggests the ports their cable notes give
const fs = require('fs'), path = require('path');
const ex = (f) => LDraw.parse(fs.readFileSync(path.join(__dirname, '..', 'site', 'app', 'bricks', f), 'utf8'));
r = ex('rover.ldr'); s = LDraw.suggest(r.counts);
eq([r.title, r.counts, s.drive.left, s.drive.right, s.sens], ['Rover', { hub6: 1, motorM: 2, distance: 1 }, 'A', 'B', { C: 'distance' }]);
r = ex('veegbot.ldr'); s = LDraw.suggest(r.counts);
eq([r.counts, s.drive.left + s.drive.right, s.aux, s.sens], [{ hub6: 1, motorM: 2, motorL: 1, color: 1, force: 1 }, 'AB', [{ port: 'C', type: 'motorL' }], { D: 'color', E: 'force' }]);

// files without parts, and anything else, are refused
for (const bad of ['', 'hello', '0 just a comment\n0 STEP', 'PK\u0003\u0004binary']) {
  assert.throws(() => LDraw.parse(bad)); checks++;
}

console.log('OK ldraw: ' + checks + ' checks (part numbers, .ldr, .mpd submodels, Essential, port suggestion, official models, bad files)');
