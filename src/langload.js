/* Taal kiezen voordat de app start. Nederlands en Engels zitten in de pagina; andere talen staan in
   lang/<code>.js (teksten plus Blockly-menuteksten) en worden hier synchroon geladen, zodat de app
   meteen in de goede taal begint. Lukt dat niet (offline, nog niet bewaard), dan valt t() terug op Engels. */
function pickLang(stored) {
  var codes = LANGS.map(function (l) { return l.code; });
  if (codes.indexOf(stored) >= 0) return stored;
  var wanted = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
  for (var i = 0; i < wanted.length; i++) { var c = String(wanted[i]).toLowerCase().split('-')[0]; if (codes.indexOf(c) >= 0) return c; }
  return 'en';
}
function langFile(code) { return 'lang/' + code + '.js'; }
(function () {
  var stored = 'auto';
  try { var g = JSON.parse(localStorage.getItem('hubremote3') || 'null'); if (g && typeof g.lang === 'string') stored = g.lang; } catch (e) {}
  var code = pickLang(stored);
  if (!I18N[code]) document.write('<script src="' + langFile(code) + '"><\/script>');
})();
