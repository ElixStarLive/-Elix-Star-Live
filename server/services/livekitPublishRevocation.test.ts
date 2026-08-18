import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A released seat and silenced media are two different facts.
 *
 * Revoking the stored grant only stops the *next* token, so this call is the
 * enforcement that a removed co-host stops sending camera and mic. When LiveKit
 * cannot answer, that enforcement did not happen — and reporting it as done
 * would mean telling a host the co-host is off their stage while that
 * participant is still publishing into it.
 */

const listParticipants = vi.fn();
const updateParticipant = vi.fn();

vi.mock("livekit-server-sdk", () => ({
  RoomServiceClient: class {
    listParticipants = listParticipants;
    updateParticipant = updateParticipant;
  },
  AccessToken: class {
    addGrant() {}
    async toJwt() {
      return "jwt";
    }
  },
}));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
vi.mock("../lib/logger", () => ({ logger }));

// Read at module load, so they have to be set before the import below.
process.env.LIVEKIT_URL = "wss://livekit.test";
process.env.LIVEKIT_API_KEY = "test-key";
process.env.LIVEKIT_API_SECRET = "test-secret";

const { revokeParticipantPublish } = await import("./livekit");

const ROOM = "host-room";

/** Publishers use the bare userId; subscribe-only identities carry a suffix. */
const publisher = (userId: string) => ({ identity: userId });
const spectator = (userId: string) => ({ identity: `${userId}__v_0123456789ab` });

const revokedIdentities = () =>
  updateParticipant.mock.calls.map(([, identity]) => identity as string);

describe("revokeParticipantPublish outcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateParticipant.mockResolvedValue(undefined);
  });

  it("reports revoked when the participant's publishing was taken away", async () => {
    listParticipants.mockResolvedValue([publisher("cohost-1"), publisher("host-1")]);

    const result = await revokeParticipantPublish(ROOM, "cohost-1");

    expect(result).toBe("revoked");
    expect(revokedIdentities()).toEqual(["cohost-1"]);
    expect(updateParticipant).toHaveBeenCalledWith(ROOM, "cohost-1", undefined, {
      canPublish: false,
      canSubscribe: true,
      canPublishData: true,
    });
  });

  it("leaves every other participant publishing", async () => {
    listParticipants.mockResolvedValue([
      publisher("host-1"),
      publisher("cohost-1"),
      publisher("cohost-2"),
      spectator("viewer-9"),
    ]);

    await revokeParticipantPublish(ROOM, "cohost-1");

    expect(revokedIdentities()).toEqual(["cohost-1"]);
  });

  it("covers both identities one user can hold in the room", async () => {
    // A seated co-host who reconnected as a viewer can appear twice; leaving
    // either row publishing would leave them on air.
    listParticipants.mockResolvedValue([publisher("cohost-1"), spectator("cohost-1")]);

    const result = await revokeParticipantPublish(ROOM, "cohost-1");

    expect(result).toBe("revoked");
    expect(revokedIdentities()).toEqual(["cohost-1", "cohost-1__v_0123456789ab"]);
  });

  it("reports absent when the user is not in the room", async () => {
    listParticipants.mockResolvedValue([publisher("host-1")]);

    expect(await revokeParticipantPublish(ROOM, "cohost-1")).toBe("absent");
    expect(updateParticipant).not.toHaveBeenCalled();
  });

  it("reports absent when the room itself is gone", async () => {
    listParticipants.mockRejectedValue(new Error("room does not exist"));

    // Nothing can be publishing into a room that is not there.
    expect(await revokeParticipantPublish(ROOM, "cohost-1")).toBe("absent");
  });

  it("reports unconfirmed when LiveKit cannot be reached", async () => {
    listParticipants.mockRejectedValue(new Error("ECONNRESET"));

    const result = await revokeParticipantPublish(ROOM, "cohost-1");

    // Not "revoked": a lookup failure is not proof the participant left, and not
    // "absent" either, because their permission was never touched.
    expect(result).toBe("unconfirmed");
    expect(logger.error).toHaveBeenCalled();
  });

  it("reports unconfirmed when the permission update is rejected", async () => {
    listParticipants.mockResolvedValue([publisher("cohost-1")]);
    updateParticipant.mockRejectedValue(new Error("503 service unavailable"));

    expect(await revokeParticipantPublish(ROOM, "cohost-1")).toBe("unconfirmed");
  });

  it("reports unconfirmed when only part of the revocation landed", async () => {
    listParticipants.mockResolvedValue([publisher("cohost-1"), spectator("cohost-1")]);
    updateParticipant.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("timeout"));

    expect(await revokeParticipantPublish(ROOM, "cohost-1")).toBe("unconfirmed");
  });

  it("does not treat a rate-limited LiveKit as a completed revocation", async () => {
    listParticipants.mockRejectedValue(new Error("429 Too Many Requests"));

    expect(await revokeParticipantPublish(ROOM, "cohost-1")).toBe("unconfirmed");
  });

  it("answers absent without calling LiveKit when the room or user is missing", async () => {
    expect(await revokeParticipantPublish("", "cohost-1")).toBe("absent");
    expect(await revokeParticipantPublish(ROOM, "")).toBe("absent");
    expect(listParticipants).not.toHaveBeenCalled();
  });
});
