import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { isDatabaseHealthy } from '../lib/postgres.js';
import { isValkeyHealthy } from '../lib/valkey.js';
import { apiError } from '../auth/contract.js';
import { authRouter } from '../routes/auth.routes.js';
import { feedRouter } from '../routes/feed.routes.js';
import { usersRouter } from '../routes/users.routes.js';
import { inboxRouter } from '../routes/inbox.routes.js';
import { adminRouter } from '../routes/admin.routes.js';
import { reportsRouter } from '../routes/reports.routes.js';
import { musicRouter } from '../routes/music.routes.js';
import { liveRouter } from '../routes/live.routes.js';
import { shopRouter } from '../routes/shop.routes.js';
import { coinsRouter } from '../routes/coins.routes.js';
import { battleRouter } from '../routes/battle.routes.js';
import { giftsRouter } from '../routes/gifts.routes.js';
import { uploadsRouter } from '../routes/uploads.routes.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Behind Coolify's proxy, so the client IP must come from the forwarded
  // header rather than the socket. One hop only: trusting the whole chain would
  // let a client spoof its own address.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGINS.length > 0 ? [...config.CORS_ORIGINS] : false,
      credentials: true,
    }),
  );
  // Stripe webhook needs the raw body to verify the signature.
  app.use('/api/shop/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json({ limit: '100kb' }));

  /**
   * Reports what the dependencies actually say. Nothing here is hard-coded to
   * true: if the database or Valkey is down this returns 503, because a process
   * that cannot reach them is not serving traffic correctly no matter how
   * healthy the event loop looks.
   */
  app.get('/api/health', async (_req: Request, res: Response) => {
    const [database, valkey] = await Promise.all([isDatabaseHealthy(), isValkeyHealthy()]);
    const ok = database && valkey;
    res.status(ok ? 200 : 503).json({ ok, services: { database, valkey } });
  });

  app.use('/api/auth', authRouter);
  app.use('/api', feedRouter);
  app.use('/api', usersRouter);
  app.use('/api', inboxRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', reportsRouter);
  app.use('/api', musicRouter);
  app.use('/api', liveRouter);
  app.use('/api', shopRouter);
  app.use('/api', coinsRouter);
  app.use('/api', battleRouter);
  app.use('/api', giftsRouter);
  app.use('/api', uploadsRouter);

  const distDir = resolve(import.meta.dirname, '..', '..', 'dist');
  const indexPath = resolve(distDir, 'index.html');

  app.use(express.static(distDir, { maxAge: '1d' }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json(apiError('invalid_request', 'Not found.'));
      return;
    }
    if (req.method === 'GET' && existsSync(indexPath)) {
      res.sendFile(indexPath);
      return;
    }
    next();
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'unhandled request error');
    if (res.headersSent) return;
    res.status(500).json(apiError('server_error', 'Something went wrong. Please try again.'));
  });

  return app;
}
