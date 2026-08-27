/**
 * Token minting and verification.
 *
 * Two kinds of token share this module and must never be interchangeable: a
 * session token, and a purpose-bound token such as a password reset link. Every
 * token therefore carries an explicit `purpose` claim which is checked on
 * verification, so a reset link can never be presented as a session.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { config } from '../config.js';

const ISSUER = 'elix-star-live';
const ALG = 'HS256';

const secret = new TextEncoder().encode(config.JWT_SECRET);

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type TokenPurpose = 'session' | 'email_verify' | 'password_reset';

export interface TokenClaims {
  userId: string;
  purpose: TokenPurpose;
  /**
   * Optional fingerprint tying the token to server-side state — for a reset
   * link, the current password hash. Once that state changes the fingerprint no
   * longer matches, which is what makes such links single-use without needing a
   * table of spent tokens.
   */
  binding?: string;
}

export async function signToken(
  claims: TokenClaims,
  ttlSeconds: number,
  audience: string = ISSUER,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    purpose: claims.purpose,
    ...(claims.binding === undefined ? {} : { bnd: claims.binding }),
  };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secret);
}

/** Returns the claims, or null when the token is absent, malformed, expired, signed with the wrong key, or issued for a different purpose. */
export async function verifyToken(
  token: string,
  expectedPurpose: TokenPurpose,
): Promise<TokenClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: ISSUER,
      algorithms: [ALG],
    });

    if (payload.purpose !== expectedPurpose) return null;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

    return {
      userId: payload.sub,
      purpose: expectedPurpose,
      ...(typeof payload.bnd === 'string' ? { binding: payload.bnd } : {}),
    };
  } catch {
    return null;
  }
}
