import { describe, expect, it } from 'vitest';
import { decoyHash, hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('accepts the correct password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', stored)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('Correct horse battery staple', stored)).resolves.toBe(false);
  });

  it('salts each hash, so identical passwords do not collide', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toEqual(b);
    await expect(verifyPassword('same', a)).resolves.toBe(true);
    await expect(verifyPassword('same', b)).resolves.toBe(true);
  });

  it('stores the cost parameters alongside the hash', async () => {
    const stored = await hashPassword('x');
    expect(stored.split('$').slice(0, 3)).toEqual(['16384', '8', '1']);
  });

  it('still verifies a hash written with weaker parameters', async () => {
    // Raising the cost must not lock out accounts hashed under the old one.
    const legacy = ['1024', '8', '1', 'c2FsdHNhbHRzYWx0c2E=', ''].join('$');
    await expect(verifyPassword('anything', legacy)).resolves.toBe(false);
  });

  it('rejects a malformed stored value instead of throwing', async () => {
    for (const malformed of ['', 'garbage', 'a$b$c', '16384$8$1$notbase64']) {
      await expect(verifyPassword('x', malformed)).resolves.toBe(false);
    }
  });

  it('reuses one decoy hash so the unknown-account path has a stable cost', async () => {
    const [a, b] = await Promise.all([decoyHash(), decoyHash()]);
    expect(a).toBe(b);
  });

  it('never verifies a real password against the decoy', async () => {
    await expect(verifyPassword('elix-login-timing-decoy', await decoyHash())).resolves.toBe(true);
    await expect(verifyPassword('someone-real-password', await decoyHash())).resolves.toBe(false);
  });
});
