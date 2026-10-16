import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { networkInterfaces } from 'node:os';

const root = path.dirname(fileURLToPath(import.meta.url));
const files = new Set(['index.html', 'styles.css', 'app.mjs', 'flock.mjs', 'renderer.mjs', 'renderer-3d.mjs', 'bird-model.mjs', 'vendor/three.module.min.js', 'vendor/THREE-LICENSE.txt']);
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.txt': 'text/plain' };

export function createStaticServer({ directory = root, basePath = '/' } = {}) {
  const prefix = `/${basePath.split('/').filter(Boolean).join('/')}${basePath === '/' ? '' : '/'}`;
  return http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed'); return;
    }
    let url;
    try { url = new URL(req.url, 'http://localhost'); }
    catch { res.writeHead(400); res.end('Invalid URL'); return; }
    if (prefix !== '/' && url.pathname === prefix.slice(0, -1)) {
      res.writeHead(308, { Location: `${prefix}${url.search}` }); res.end(); return;
    }
    if (!url.pathname.startsWith(prefix)) { res.writeHead(404); res.end('Not found'); return; }
    const name = url.pathname.slice(prefix.length) || 'index.html';
    // Serve only public app assets, never repository metadata, tests, or local files.
    if (!files.has(name)) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const body = await readFile(path.join(directory, name));
      res.writeHead(200, { 'Content-Type': `${types[path.extname(name)]}; charset=utf-8`, 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(500); res.end('Unable to read app file'); }
  });
}

export function startServer({ directory = root, basePath = '/', port = Number(process.env.PORT || 4173), host = process.env.HOST || '0.0.0.0' } = {}) {
  const server = createStaticServer({ directory, basePath });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? `Port ${port} is already in use. Stop the previous server or set PORT to a free port.`
      : `Unable to start the server: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.log(`Kite Flock: http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}${basePath}`);
    if (host === '0.0.0.0') {
      for (const address of new Set(Object.values(networkInterfaces()).flat()
        .filter(item => item.family === 'IPv4' && !item.internal).map(item => item.address))) {
        console.log(`Same Wi-Fi / LAN: http://${address}:${port}${basePath}`);
      }
    }
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startServer();
