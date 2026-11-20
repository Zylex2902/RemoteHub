# Languages and translation review

The app speaks Dutch and English, plus German, French, Italian, Spanish, Brazilian Portuguese,
Polish, Simplified Chinese and Japanese. Dutch is the owner's original and English is the source for
every translation. The other languages were made with a translation program and are being checked by
language experts; until a language is fully checked, the app says so under the language picker in
Settings, with the share that has been checked.

## Where the texts live

| File | What |
|---|---|
| `src/i18n/en.json` | English: the source for all translations. One key per line. |
| `src/i18n/nl.json` | Dutch: the owner's original. Same keys. |
| `src/i18n/<code>.json` | One file per translated language, same keys in the same order. |
| `src/i18n/languages.json` | The language list: code, own name, Blockly language, LEGO® Education site locale, `bundled`. |
| `src/i18n/context.json` | Notes for translators: house style, per-language notes, where each group of texts appears. |
| `src/i18n/review/<code>.json` | Review decisions per text: who approved or corrected it, when, and a hash of the text they saw. |

Dutch and English are inside the page. The other languages are built into `site/app/lang/<code>.js`
(texts plus Blockly's own menu texts) and loaded only when someone uses that language; the service
worker keeps the file for offline use after the first time. The single-file build
(`npm run build:standalone`) contains every language.

Blockly's built-in texts (the right-click menu, "delete block" and so on) come with Blockly itself
(`vendor/blockly/msg-<code>.js`, from Blockly's own translators).

## Adding or changing a text

1. Add the key to `en.json` and `nl.json` at the same place (the key sets must stay equal).
2. Add the key to every other language too. A new or changed English text makes earlier reviews of
   that key expire automatically (see below), so it shows up again for the reviewer.
3. If the text needs explaining (where it appears, how long it may be), add a note in `context.json`.
4. Run `npm run lqa:check`: it fails on missing keys, changed placeholders, lost ® or ™ signs and
   product names that were translated, and warns about texts that are much longer than the English or
   look untranslated.

## The review (LQA) pipeline

The goal: a native speaker checks every text **in its place in the app**, against the English source,
and their decision only counts as long as neither the English nor the translation changes.

1. **Automatic checks** - `python3 tools/lqa.py check` (also part of `npm run test:unit`).
2. **Screenshots** - `npm run lqa:shots -- de` takes phone-size screenshots of every screen in that
   language (Drive, Play, the draw sheet, Code with every block category, Python, Settings, Share, Log)
   and records which texts are visible on each one.
3. **Review page** - `python3 tools/lqa.py page de` writes `dist/lqa/review-de.html`: one file that
   works offline, with the house style, the screenshots, and for each text the English source, the
   Dutch original, the translation, where it appears ("seen on" links to the screenshot), the context
   note and the automatic warnings. Send this file to the language expert.
4. **The expert** opens it in a browser, enters their name and goes through the list (it starts with
   the texts that still need a review). For each text: *Correct*, *Change* (write a better
   translation; the page refuses one that drops a placeholder) or *Comment* (unsure, a question). The
   page remembers the work in that browser. At the end: *Download review file*, and send that back.
5. **Apply** - `python3 tools/lqa.py apply de review-de-2026-12-01.json` writes corrections into
   `src/i18n/de.json` and the decisions into `src/i18n/review/de.json`. Items are skipped (and listed)
   when the English text or the translation changed after the page was made, or when a correction
   breaks a placeholder.
6. **Report** - `python3 tools/lqa.py report --write` updates `docs/translation-status.md` (reviewed
   share, texts changed since review, open comments, automatic errors and warnings per language).
   Rebuild (`npm run build`): the share reviewed goes into the app's language list, and the note in
   Settings disappears when a language reaches 100%.

A review is stored with a hash of the English text and the translation the expert saw. If either
changes later, the text counts as unreviewed again and comes back in the next review page.

Open comments are listed in the review file and the report; answer them by changing the English, the
context note or the translation, then make a new review page.

## Adding a language

1. Copy Blockly's message file: add the code to the `vendor:blockly` script in `package.json` (or copy
   `node_modules/blockly/msg/<code>.js` to `vendor/blockly/msg-<code>.js`).
2. Add the language to `src/i18n/languages.json`. Only use a LEGO® Education locale in `lego` after
   checking that `https://education.lego.com/<locale>/product-resources/spike-prime/downloads/building-instructions/`
   exists; otherwise use `en-us`.
3. Write `src/i18n/<code>.json` with every key from `en.json`, add a line for it under `languages` in
   `context.json`, run `npm run lqa:check`, build, and start a review as above.
4. Check the fonts: Fredoka and Nunito are hosted with the app in Latin and Latin Extended; other
   scripts (Chinese, Japanese) use the device's own fonts.

The landing page (`src/landing.html`) is in Dutch and English only.
