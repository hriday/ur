import { randomBytes, randomInt } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { openRepo } from './repo';
import { createGameService } from './service';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const dataDir = process.env.DATA_DIR ?? path.resolve(here, '../../data');
const clientDir = process.env.CLIENT_DIR ?? path.resolve(here, '../../client/dist');

mkdirSync(dataDir, { recursive: true });
const repo = openRepo(path.join(dataDir, 'ur.sqlite'));
const service = createGameService({
  repo,
  rng: () => randomInt(0, 2 ** 32) / 2 ** 32,
  randomBytes,
  now: Date.now,
});
const server = createApp({ service, clientDir });

setInterval(() => service.sweep(), 60 * 60_000).unref();
server.listen(port, host, () => console.log(`Royal Game of Ur listening on http://${host}:${port}`));

const shutdown = () => {
  server.close();
  repo.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
