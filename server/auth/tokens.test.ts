import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from './tokens.js';

describe('tokens', () => {
  it('round-trips a session token', async () => {
    const token = await signToken({ userId: 'user-1', purpose: 'session' }, 60);
    await expect(verifyToken(token, 'session')).resolves.toMatchObject({
      userId: 'user-1',
      purpose: 'session',
    });
  });

  it('refuses a token presented for a different purpose', async () => {
    // The whole point of the purpose claim: a password-reset link must not be
    // usable as a session, however it reaches an endpoint.
    const reset = await signToken({ userId: 'user-1', purpose: 'password_reset' }, 60);
    await expect(verifyToken(reset, 'session')).resolves.toBeNull();
    await expect(verifyToken(reset, 'password_reset')).resolves.not.toBeNull();
  });

  it('refuses an expired token', async () => {
    const token = await signToken({ userId: 'user-1', purpose: 'session' }, -1);
    await expect(verifyToken(token, 'session')).resolves.toBeNull();
  });

  it('refuses a tampered payload', async () => {
    const token = await signToken({ userId: 'user-1', purpose: 'session' }, 60);
    const [header, , signature] = token.split('.') as [string, string, string];
    const forged = Buffer.from(
      JSON.stringify({ sub: 'user-2', purpose: 'session', exp: Math.floor(Date.now() / 1000) + 60 }),
    ).toString('base64url');

    await expect(verifyToken(`${header}.${forged}.${signature}`, 'session')).resolves.toBeNull();
  });

  it('carries the binding fingerprint through', async () => {
    const token = await signToken(
      { userId: 'user-1', purpose: 'password_reset', binding: 'abc123' },
      60,
    );
    await expect(verifyToken(token, 'password_reset')).resolves.toMatchObject({ binding: 'abc123' });
  });

  it('refuses empty and malformed input', async () => {
    for (const bad of ['', 'not-a-token', 'a.b.c']) {
      await expect(verifyToken(bad, 'session')).resolves.toBeNull();
    }
  });
});
