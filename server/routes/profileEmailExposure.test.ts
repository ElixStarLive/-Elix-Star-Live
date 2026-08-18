import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

/**
 * `GET /api/profiles/:userId` is public, and it used to return the account's full
 * login address for whatever id was asked for. An address alone is enough to start
 * a password reset or aim a credential-stuffing run somewhere else, so walking the
 * id space harvested every user's email.
 *
 * The screens that show someone else's profile only ever render the local part
 * ("info@"), so that is all a non-owner now receives; the owner still gets their
 * own full address.
 */

const pool = {
  query: vi.fn(async () => ({ rows: [{ c: 0 }], rowCount: 1 })),
};

vi.mock("../lib/postgres", () => ({
  getPool: vi.fn(() => pool),
  dbIsBlockedEitherWay: vi.fn(async () => false),
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../lib/notifications", () => ({ insertNotification: vi.fn(async () => {}) }));
vi.mock("../services/videoDownload", () => ({ isSafeMediaUrl: vi.fn(() => true) }));
vi.mock("../lib/valkey", () => ({
  isValkeyConfigured: vi.fn(() => false),
  valkeyGet: vi.fn(async () => null),
  valkeySet: vi.fn(async () => {}),
  valkeyDel: vi.fn(async () => {}),
  acquireCacheBuildLock: vi.fn(async () => false),
  waitForCachePopulate: vi.fn(async () => null),
}));
vi.mock("../lib/catalogCacheValkey", () => ({
  bumpProfilesListEpoch: vi.fn(async () => {}),
  getProfilesListEpoch: vi.fn(async () => 1),
  profilesListDataKey: vi.fn(() => "profiles:list:1"),
}));
vi.mock("../lib/cacheLayerMetrics", () => ({ bumpCacheLayer: vi.fn() }));

const authMock = {
  getTokenFromRequest: vi.fn((): string | null => null),
  verifyAuthToken: vi.fn((): { sub: string; email: string } | null => null),
};
vi.mock("./auth", () => authMock);

const profiles = await import("./profiles");

const OWNER = "creator-1";
const EMAIL = "creator.one@example.com";

function fakeRes() {
  const sent: { status?: number; body?: { profile?: Record<string, unknown> } } = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: { profile?: Record<string, unknown> }) {
      sent.body = body;
      return res;
    },
    setHeader: vi.fn(),
  };
  return { res: res as unknown as Response, sent };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.getTokenFromRequest.mockReturnValue(null);
  authMock.verifyAuthToken.mockReturnValue(null);
  pool.query.mockImplementation(async (sql: string) => {
    const text = String(sql).replace(/\s+/g, " ");
    if (text.includes("FROM profiles WHERE user_id")) {
      return {
        rows: [
          {
            user_id: OWNER,
            username: "creatorone",
            display_name: "Creator One",
            avatar_url: "",
            bio: "",
            website: "",
            followers: 0,
            following: 0,
            video_count: 0,
            coins: 0,
            level: 1,
            is_verified: false,
            unique_profile_views: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      };
    }
    if (text.includes("FROM elix_auth_users")) {
      return { rows: [{ id: OWNER, email: EMAIL, username: "creatorone" }], rowCount: 1 };
    }
    return { rows: [{ c: 0 }], rowCount: 1 };
  });
});

function getRequest(): Request {
  return { params: { userId: OWNER }, headers: {}, query: {} } as unknown as Request;
}

describe("public profile read must not leak a login address", () => {
  it("gives an anonymous caller the local part only", async () => {
    const { res, sent } = fakeRes();

    await profiles.handleGetProfile(getRequest(), res);

    expect(sent.body?.profile?.email).toBe("creator.one@");
    expect(String(sent.body?.profile?.email)).not.toContain("example.com");
  });

  it("gives another signed-in user the local part only", async () => {
    authMock.getTokenFromRequest.mockReturnValue("token-of-someone-else");
    authMock.verifyAuthToken.mockReturnValue({ sub: "other-user", email: "other@example.com" });
    const { res, sent } = fakeRes();

    await profiles.handleGetProfile(getRequest(), res);

    expect(sent.body?.profile?.email).toBe("creator.one@");
  });

  it("gives the owner their own full address", async () => {
    authMock.getTokenFromRequest.mockReturnValue("owner-token");
    authMock.verifyAuthToken.mockReturnValue({ sub: OWNER, email: EMAIL });
    const { res, sent } = fakeRes();

    await profiles.handleGetProfile(getRequest(), res);

    expect(sent.body?.profile?.email).toBe(EMAIL);
  });

  it("omits the field entirely when the account has no address", async () => {
    pool.query.mockImplementation(async (sql: string) => {
      const text = String(sql).replace(/\s+/g, " ");
      if (text.includes("FROM profiles WHERE user_id")) {
        return {
          rows: [
            {
              user_id: OWNER,
              username: "creatorone",
              display_name: "Creator One",
              avatar_url: "",
              bio: "",
              website: "",
              followers: 0,
              following: 0,
              video_count: 0,
              coins: 0,
              level: 1,
              is_verified: false,
              unique_profile_views: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes("FROM elix_auth_users")) {
        return { rows: [{ id: OWNER, email: "", username: "creatorone" }], rowCount: 1 };
      }
      return { rows: [{ c: 0 }], rowCount: 1 };
    });
    const { res, sent } = fakeRes();

    await profiles.handleGetProfile(getRequest(), res);

    // No bare "@" placeholder — the key is simply absent, as before.
    expect(sent.body?.profile).not.toHaveProperty("email");
  });
});
