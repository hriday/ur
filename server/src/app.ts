import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { addressKey, createRateLimiter } from './rateLimit';
import { ServiceError, type GameService } from './service';
import { attachSockets, type SocketLimits } from './sockets';

export interface AppOptions {
  service: GameService;
  clientDir?: string;
  now?: () => number;
  socketLimits?: SocketLimits;
}

/** Hosts we will echo into the CSP connect-src (anything odd falls back to 'self' alone). */
const SAFE_HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

export function contentSecurityPolicy(host: string | undefined): string {
  const sockets = host && SAFE_HOST.test(host) ? ` ws://${host} wss://${host}` : '';
  return [
    "default-src 'self'",
    "script-src 'self'",
    // Svelte transitions and style attributes need inline styles; scripts stay strict.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src 'self'${sockets}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function createApp({ service, clientDir, now = Date.now, socketLimits }: AppOptions): Server {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  const allowCreate = createRateLimiter({ limit: 30, windowMs: 10 * 60_000, now });
  // A ceiling on new games from everyone together, so address-hopping cannot fill the disk.
  const allowCreateGlobal = createRateLimiter({ limit: 300, windowMs: 60 * 60_000, now });
  const clientKey = (req: Request) => addressKey(req.ip ?? 'unknown');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', contentSecurityPolicy(req.headers.host));
    next();
  });

  const fail = (res: Response, e: unknown) => {
    if (!(e instanceof ServiceError)) throw e;
    const status = e.code === 'notFound' ? 404 : e.code === 'gameFull' ? 409 : 400;
    res.status(status).json({ code: e.code, message: e.message });
  };

  app.post('/api/games', (req, res) => {
    if (!allowCreate(clientKey(req)) || !allowCreateGlobal('all')) {
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
  attachSockets(server, service, { limits: socketLimits, now });
  return server;
}
