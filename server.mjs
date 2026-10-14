import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const files = new Set(['index.html', 'styles.css', 'app.mjs', 'flock.mjs']);
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript' };
http.createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!files.has(name)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(path.join(root, name));
    res.writeHead(200, { 'Content-Type': `${types[path.extname(name)]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(500); res.end('Unable to read app file'); }
}).listen(port, '127.0.0.1', () => console.log(`Kite Flock is running at http://127.0.0.1:${port}`));
