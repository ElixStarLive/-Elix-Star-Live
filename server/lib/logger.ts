import pino from 'pino';
import { config } from '../config.js';

/**
 * Structured logging owner.
 *
 * `redact` is the reason this is centralised: credentials must never reach a log
 * sink, and that guarantee is worth nothing if it depends on every call site
 * remembering to strip them.
 */
export const logger = pino({
  level: config.isProduction ? 'info' : 'debug',
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'access_token',
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
    ],
    censor: '[redacted]',
  },
  ...(config.isProduction ? {} : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
});
