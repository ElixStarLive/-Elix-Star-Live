/**
 * Session token transport.
 *
 * The token travels two ways and this module owns both. The browser gets an
 * HttpOnly cookie, which JavaScript cannot read and therefore cannot leak
 * through an XSS payload. The native app has no cookie jar worth relying on and
 * sends an `Authorization: Bearer` header instead.
 *
 * Reads prefer the header so a native client is never affected by a stale
 * cookie left over from a webview session.
 */

import { parse as parseCookie, serialize as serializeCookie } from 'cookie';
import type { Request, Response } from 'express';
import { config } from '../config.js';

const COOKIE_NAME = 'elix_session';

export function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token) return token;
  }

  const raw = req.headers.cookie;
  if (typeof raw !== 'string') return null;
  return parseCookie(raw)[COOKIE_NAME] ?? null;
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.append(
    'Set-Cookie',
    serializeCookie(COOKIE_NAME, token, {
      httpOnly: true,
      // `lax` still sends the cookie on top-level navigation, which email
      // verification links need, while withholding it from cross-site POSTs.
      sameSite: 'lax',
      secure: config.isProduction,
      path: '/',
      expires: expiresAt,
    }),
  );
}

export function clearSessionCookie(res: Response): void {
  res.append(
    'Set-Cookie',
    serializeCookie(COOKIE_NAME, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      path: '/',
      maxAge: 0,
    }),
  );
}
