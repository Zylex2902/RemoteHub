// Shared bits for the browser tests.
const path = require('path'), http = require('http'), fs = require('fs');

const SITE = path.resolve(__dirname, '..', 'site');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

// Serves site/ on a free localhost port (service workers and share links need http, not file://).
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(SITE, path.normalize(p));
      if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, 'localhost', () => resolve({ url: 'http://localhost:' + srv.address().port + '/', close: () => srv.close() }));
  });
}

// CHROME_PATH picks a specific Chrome; NO_SANDBOX=1 is needed when running as root (containers, CI).
const launchOptions = (extraArgs) => ({
  executablePath: process.env.CHROME_PATH || undefined,
  args: (process.env.NO_SANDBOX || process.env.CI ? ['--no-sandbox'] : []).concat(extraArgs || []),
});

module.exports = { SITE, OUT, serve, launchOptions };
