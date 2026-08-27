/**
 * Single owner for server configuration.
 *
 * Every value the server needs is read here, once, at startup and validated
 * before anything else is constructed. Nothing else in the server reads
 * `process.env` directly — that is what previously allowed a missing production
 * value to be quietly replaced by a default deep inside a request handler.
 *
 * Critical configuration has no default. A missing value stops the process with
 * a named error rather than starting a server that will fail later under load.
 */

import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),

  /** Neon Postgres connection string for the NEW database. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /** Valkey connection string. Required: session and rate-limit state live here. */
  VALKEY_URL: z.string().min(1, 'VALKEY_URL is required'),

  /**
   * HS256 signing secret for session and purpose-bound tokens. 32 bytes minimum
   * is enforced rather than warned about: a short secret is a real vulnerability,
   * not a style preference.
   */
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),

  /** Absolute origin of the web app, used to build links inside emails. */
  APP_ORIGIN: z.string().url('APP_ORIGIN must be an absolute URL'),

  /**
   * Comma-separated browser origins allowed to call the API with credentials.
   * Empty means same-origin only.
   */
  CORS_ORIGINS: z.string().default(''),
});

export type ServerConfig = Readonly<
  Omit<z.infer<typeof schema>, 'CORS_ORIGINS'> & {
    CORS_ORIGINS: readonly string[];
    isProduction: boolean;
  }
>;

function load(): ServerConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`INVALID SERVER CONFIGURATION\n${details}`);
  }

  const raw = parsed.data;
  return Object.freeze({
    ...raw,
    CORS_ORIGINS: Object.freeze(
      raw.CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
    isProduction: raw.NODE_ENV === 'production',
  });
}

export const config: ServerConfig = load();
