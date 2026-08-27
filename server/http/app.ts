import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { isDatabaseHealthy } from '../lib/postgres.js';
import { isValkeyHealthy } from '../lib/valkey.js';
import { apiError } from '../auth/contract.js';
import { authRouter } from '../routes/auth.routes.js';

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

  app.use((_req: Request, res: Response) => {
    res.status(404).json(apiError('invalid_request', 'Not found.'));
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'unhandled request error');
    if (res.headersSent) return;
    res.status(500).json(apiError('server_error', 'Something went wrong. Please try again.'));
  });

  return app;
}
