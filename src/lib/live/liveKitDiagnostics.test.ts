import { describe, expect, it } from 'vitest';
import {
  normalizeLiveKitSignalUrl,
  summarizeLiveKitEndpoint,
  summarizeLiveKitToken,
} from './liveKitDiagnostics';

function makeUnsignedJwt(payload: Record<string, unknown>): string {
  const header = { alg: 'none', typ: 'JWT' };
  const enc = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  return `${enc(header)}.${enc(payload)}.`;
}

describe('liveKitDiagnostics', () => {
  it('normalizes production signal URLs to wss', () => {
    expect(normalizeLiveKitSignalUrl('https://demo.livekit.cloud/')).toBe('wss://demo.livekit.cloud');
    expect(normalizeLiveKitSignalUrl('demo.livekit.cloud')).toBe('wss://demo.livekit.cloud');
  });

  it('keeps localhost URLs as ws/http-safe values', () => {
    expect(normalizeLiveKitSignalUrl('http://localhost:7880')).toBe('ws://localhost:7880');
  });

  it('summarizes endpoint metadata safely', () => {
    const endpoint = summarizeLiveKitEndpoint('https://demo.livekit.cloud');
    expect(endpoint.normalizedUrl).toBe('wss://demo.livekit.cloud');
    expect(endpoint.protocol).toBe('wss:');
    expect(endpoint.isSecureWss).toBe(true);
  });

  it('extracts token claims without exposing secrets', () => {
    const token = makeUnsignedJwt({
      iss: 'apiKey123',
      sub: 'user-1',
      exp: 2_000_000_000,
      nbf: 1_000_000_000,
      video: {
        room: 'room-1',
        canPublish: false,
        canSubscribe: true,
        roomJoin: true,
      },
    });
    const summary = summarizeLiveKitToken(token);
    expect(summary.issuer).toBe('apiKey123');
    expect(summary.identity).toBe('user-1');
    expect(summary.room).toBe('room-1');
    expect(summary.canPublish).toBe(false);
    expect(summary.canSubscribe).toBe(true);
    expect(summary.roomJoin).toBe(true);
  });
});
