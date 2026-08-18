import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

/**
 * A LiveKit token carries its grants until it expires, so revoking a co-host
 * seat cannot take back a publish token already issued. Somebody who was seated
 * an hour ago and kept that token could rejoin and publish again.
 *
 * The join is therefore re-checked against the current seat state, and only a
 * proven refusal takes publishing away: if the registry cannot answer, a live
 * host must not be silenced by a failed lookup.
 */

process.env.LIVEKIT_API_KEY = 'test-key';
process.env.LIVEKIT_API_SECRET = 'test-secret';

type WebhookEvent = {
  event: string;
  room?: { name?: string };
  participant?: { identity?: string; permission?: { canPublish?: boolean } };
};

let nextEvent: WebhookEvent | null = null;
let signatureValid = true;

vi.mock('livekit-server-sdk', () => ({
  WebhookReceiver: class {
    async receive() {
      if (!signatureValid) throw new Error('invalid signature');
      return nextEvent;
    }
  },
}));

let authority: 'authorized' | 'unauthorized' | 'unknown' = 'authorized';
let authorityThrows = false;

const livestream = {
  removeActiveStream: vi.fn(async () => true),
  resolveStreamOwnerUserId: vi.fn(async (room: string) => room),
  resolveLivePublishAuthority: vi.fn(async () => {
    if (authorityThrows) throw new Error('registry unreachable');
    return authority;
  }),
};

const services = {
  listActiveRoomsFromLiveKit: vi.fn(async () => [] as Array<{ name: string }>),
  isUserPublishingInRoom: vi.fn(async () => false),
  revokeParticipantPublish: vi.fn(async () => 'revoked' as const),
  // Mirrors the real identity scheme: subscribe-only viewers carry a suffix.
  userIdFromLiveKitIdentity: (identity: string) =>
    identity.match(/^(.*)__v_[a-f0-9]{12}$/i)?.[1] || identity,
};

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

vi.mock('./livestream', () => livestream);
vi.mock('../services/livekit', () => services);
vi.mock('../lib/logger', () => ({ logger }));
vi.mock('../feedBroadcast', () => ({ broadcastToFeedSubscribers: vi.fn() }));
vi.mock('../websocket/liveCreatorRole', () => ({
  getCreatorLiveRoleRoom: vi.fn(async () => null),
}));

const { handleLiveKitWebhook } = await import('./livekit-webhook');

function fakeRes() {
  const sent: { status?: number; body?: Record<string, unknown> } = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      sent.body = body;
      return res;
    },
    end() {
      return res;
    },
  };
  return { res: res as unknown as Response, sent };
}

async function deliver(event: WebhookEvent) {
  nextEvent = event;
  const req = {
    body: Buffer.from(JSON.stringify(event)),
    get: () => 'Bearer livekit-signed',
  } as unknown as Request;
  const { res, sent } = fakeRes();
  await handleLiveKitWebhook(req, res);
  return sent;
}

function joined(
  overrides: Partial<WebhookEvent['participant']> & { room?: string } = {},
): WebhookEvent {
  const { room = 'room-1', ...participant } = overrides;
  return {
    event: 'participant_joined',
    room: { name: room },
    participant: {
      identity: 'cohost-1',
      permission: { canPublish: true },
      ...participant,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authority = 'authorized';
  authorityThrows = false;
  signatureValid = true;
});

describe('publish re-verification when a participant joins LiveKit', () => {
  it('revokes publishing the server no longer grants', async () => {
    authority = 'unauthorized';

    const sent = await deliver(joined());

    expect(services.revokeParticipantPublish).toHaveBeenCalledWith('room-1', 'cohost-1');
    expect(logger.warn).toHaveBeenCalled();
    // LiveKit gets its 200: this is our correction, not a delivery failure.
    expect(sent.status).toBe(200);
  });

  it('leaves an authorized publisher alone', async () => {
    authority = 'authorized';

    await deliver(joined({ identity: 'host-1' }));

    expect(livestream.resolveLivePublishAuthority).toHaveBeenCalledWith('room-1', 'host-1');
    expect(services.revokeParticipantPublish).not.toHaveBeenCalled();
  });

  it('does not silence anyone when the server cannot say', async () => {
    authority = 'unknown';

    await deliver(joined());

    expect(services.revokeParticipantPublish).not.toHaveBeenCalled();
  });

  it('does not silence anyone when the check itself fails', async () => {
    authorityThrows = true;

    await deliver(joined());

    expect(services.revokeParticipantPublish).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('ignores viewers, who hold no publish rights to check', async () => {
    authority = 'unauthorized';

    await deliver(
      joined({ identity: 'viewer-1__v_0123456789ab', permission: { canPublish: false } }),
    );

    expect(livestream.resolveLivePublishAuthority).not.toHaveBeenCalled();
    expect(services.revokeParticipantPublish).not.toHaveBeenCalled();
  });

  it('leaves 1:1 call rooms out of it — both parties publish by design', async () => {
    authority = 'unauthorized';

    await deliver(joined({ room: 'call_abc123' }));

    expect(livestream.resolveLivePublishAuthority).not.toHaveBeenCalled();
    expect(services.revokeParticipantPublish).not.toHaveBeenCalled();
  });

  it('resolves the app user behind a suffixed identity before checking', async () => {
    authority = 'unauthorized';

    await deliver(joined({ identity: 'cohost-9__v_abcdef012345' }));

    expect(livestream.resolveLivePublishAuthority).toHaveBeenCalledWith('room-1', 'cohost-9');
    expect(services.revokeParticipantPublish).toHaveBeenCalledWith('room-1', 'cohost-9');
  });

  it('rejects an unsigned webhook without touching anyone permissions', async () => {
    signatureValid = false;
    authority = 'unauthorized';

    const sent = await deliver(joined());

    expect(sent.status).toBe(401);
    expect(livestream.resolveLivePublishAuthority).not.toHaveBeenCalled();
    expect(services.revokeParticipantPublish).not.toHaveBeenCalled();
  });
});
