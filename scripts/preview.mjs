import { fileURLToPath } from 'node:url';
import { startServer } from '../server.mjs';

startServer({
  directory: fileURLToPath(new URL('../dist/', import.meta.url)),
  basePath: '/fun-games/',
  port: Number(process.env.PORT || 4174),
  host: process.env.HOST || '127.0.0.1',
});
