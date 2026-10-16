import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function buildSite(destination = path.join(root, 'dist')) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const file of ['index.html', 'styles.css', 'app.mjs', 'flock.mjs', 'renderer.mjs', 'renderer-3d.mjs', 'bird-model.mjs', 'vendor/three.module.min.js', 'vendor/THREE-LICENSE.txt']) {
    await mkdir(path.dirname(path.join(destination,file)),{recursive:true});
    await cp(path.join(root, file), path.join(destination, file));
  }
  await writeFile(path.join(destination, '.nojekyll'), '');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildSite();
  console.log('Built dist/ with only the static app assets and .nojekyll.');
}
