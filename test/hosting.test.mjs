import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createStaticServer } from '../server.mjs';
import { buildSite } from '../scripts/build.mjs';

test('the deployable site works at both a domain root and a repository subpath', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'kite-hosting-'));
  const directory = path.join(temporary, 'site');
  try {
    await buildSite(directory);
    assert.deepEqual((await readdir(directory)).sort(),
      ['.nojekyll', 'app.mjs', 'flock.mjs', 'index.html', 'styles.css']);
    for (const basePath of ['/', '/fun-games/']) {
      const server = createStaticServer({ directory, basePath });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const origin = `http://127.0.0.1:${server.address().port}`;
      const home = new URL(basePath, origin);
      try {
        const page = await fetch(home);
        assert.equal(page.status, 200);
        assert.match(page.headers.get('content-type'), /text\/html/);
        const html = await page.text();
        for (const [, reference] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
          const resource = new URL(reference, home);
          assert.ok(resource.pathname.startsWith(basePath), `${reference} must stay under the site subpath`);
          assert.equal((await fetch(resource)).status, 200, reference);
        }
        for (const file of ['app.mjs', 'flock.mjs']) {
          const resource = new URL(file, home);
          const response = await fetch(resource);
          assert.match(response.headers.get('content-type'), /text\/javascript/);
          const javascript = await response.text();
          assert.equal(javascript, await readFile(path.join(directory, file), 'utf8'));
          for (const [, dependency] of javascript.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
            assert.equal((await fetch(new URL(dependency, resource))).status, 200);
          }
        }
        assert.equal((await fetch(home, { method: 'HEAD' })).status, 200);
        assert.equal(await (await fetch(home, { method: 'HEAD' })).text(), '');
        assert.equal((await fetch(home, { method: 'POST' })).status, 405);
        for (const privateFile of ['.git/config', 'README.md', 'server.mjs', '.env', 'test/flock.test.mjs']) {
          assert.equal((await fetch(new URL(privateFile, home))).status, 404);
        }
        if (basePath !== '/') {
          const redirect = await fetch(new URL('/fun-games', origin), { redirect: 'manual' });
          assert.equal(redirect.status, 308);
          assert.equal(redirect.headers.get('location'), '/fun-games/');
          assert.equal((await fetch(new URL('/app.mjs', origin))).status, 404);
        }
      } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
