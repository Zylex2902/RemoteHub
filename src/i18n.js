// Texts of the app, one JSON file per language in src/i18n/ (key -> text). The build puts them in the page
// as the I18N object; this file only loads them for the Node tests. nl and en are written by hand; the
// other languages are translations that go through the review in tools/lqa/ (see docs/localization.md).
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'i18n');
const LANGS = JSON.parse(fs.readFileSync(path.join(DIR, 'languages.json'), 'utf8'));
const I18N = {};
for (const l of LANGS) I18N[l.code] = JSON.parse(fs.readFileSync(path.join(DIR, l.code + '.json'), 'utf8'));
module.exports = I18N;
Object.defineProperty(module.exports, "LANGS", { value: LANGS, enumerable: false });
