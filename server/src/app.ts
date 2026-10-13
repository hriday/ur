import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import express, { type Response } from 'express';
import { createRateLimiter } from './rateLimit';
import { ServiceError, type GameService } from './service';
import { attachSockets } from './sockets';

export interface AppOptions { service: GameService; clientDir?: string; now?: () => number }

export function createApp({ service, clientDir, now = Date.now }: AppOptions): Server {
  const app = express();
  app.set('trust proxy', 'loopback');
  const allowCreate = createRateLimiter({ limit: 30, windowMs: 10 * 60_000, now });

  const fail = (res: Response, e: unknown) => {
    if (!(e instanceof ServiceError)) throw e;
    const status = e.code === 'notFound' ? 404 : e.code === 'gameFull' ? 409 : 400;
    res.status(status).json({ code: e.code, message: e.message });
  };

  app.post('/api/games', (req, res) => {
    if (!allowCreate(req.ip ?? 'unknown')) {
      res.status(429).json({ code: 'rateLimited', message: 'Too many new games — try again in a few minutes.' });
      return;
    }
    res.status(201).json(service.create());
  });
  app.get('/api/games/:id', (req, res) => {
    try { res.json(service.info(req.params.id)); } catch (e) { fail(res, e); }
  });
  app.post('/api/games/:id/join', (req, res) => {
    try { res.json(service.join(req.params.id)); } catch (e) { fail(res, e); }
  });
  app.use('/api', (_req, res) => { res.status(404).json({ code: 'notFound', message: 'Unknown endpoint.' }); });
  app.get('/healthz', (_req, res) => { res.send('ok'); });

  if (clientDir && existsSync(clientDir)) {
    app.use('/assets', express.static(path.join(clientDir, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(clientDir, { index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  const server = createServer(app);
  attachSockets(server, service);
  return server;
}
