import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

/**
 * Admin removal of a reported live must end it the same way every other path
 * does.
 *
 * This used to be a direct `UPDATE live_streams ... WHERE stream_key = $1 OR
 * id::text = $1`. That table has no `id` column, so Postgres rejected the
 * statement, the surrounding `.catch` logged a warning, and the moderator saw a
 * success response while the creator kept broadcasting. Even had it worked it
 * would have skipped the Valkey session, the member set, the streams cache and
 * the stream_ended broadcast that removeActiveStream owns.
 */

const livestream = { removeActiveStream: vi.fn(async () => true) };
const feed = { broadcastToFeedSubscribers: vi.fn() };
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

/** Rows returned by the report UPDATE ... RETURNING *. */
let reportRow: { target_type: string; target_id: string } | null = null;
const query = vi.fn(async (sql: string) => {
  if (/UPDATE elix_reports/i.test(sql)) {
    return { rowCount: reportRow ? 1 : 0, rows: reportRow ? [reportRow] : [] };
  }
  return { rowCount: 0, rows: [] };
});

vi.mock("../lib/postgres", () => ({
  getPool: () => ({ query }),
  deleteVideoFromDb: vi.fn(async () => {}),
}));
vi.mock("./livestream", () => livestream);
vi.mock("../feedBroadcast", () => feed);
vi.mock("../lib/logger", () => ({ logger }));
vi.mock("../lib/notifications", () => ({ insertNotification: vi.fn(async () => {}) }));
vi.mock("../middleware/rbac", () => ({
  requireAuthWithRoles: (_req: Request, _res: Response, next: () => void) => next(),
  requireAdmin: (_req: Request, _res: Response, next: () => void) => next(),
}));
vi.mock("./auth", () => ({ invalidateUserSessionCache: vi.fn() }));
vi.mock("../middleware/validate", () => ({
  validateBody: () => (_req: Request, _res: Response, next: () => void) => next(),
}));
vi.mock("../lib/catalogCacheValkey", () => ({ invalidateGiftsCatalogCache: vi.fn() }));
vi.mock("../websocket/index", () => ({
  disconnectUserSessions: vi.fn(),
  sendToUserGlobal: vi.fn(),
}));

const router = (await import("./adminActions")).default;

type Handler = (req: Request, res: Response) => Promise<void> | void;

/** The PATCH /reports/:id handler, past its middleware. */
function patchReportHandler(): Handler {
  const layers = (router as unknown as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>;
  }).stack;
  const layer = layers.find((l) => l.route?.path === "/reports/:id" && l.route.methods.patch);
  if (!layer?.route) throw new Error("PATCH /reports/:id route not registered");
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function fakeReq(action: string): Request {
  return {
    params: { id: "report-1" },
    body: { status: "actioned", action },
    query: {},
    headers: {},
    authContext: { userId: "admin-1" },
  } as unknown as Request;
}

function fakeRes() {
  const sent: { status?: number; body?: Record<string, unknown> } = {};
  const res = {
    setHeader() {
      return res;
    },
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      sent.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, sent };
}

describe("admin removal of a reported live stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    livestream.removeActiveStream.mockResolvedValue(true);
    reportRow = { target_type: "live", target_id: "room-1" };
  });

  it("ends the stream through the shared end authority", async () => {
    const { res, sent } = fakeRes();

    await patchReportHandler()(fakeReq("removed"), res);

    expect(livestream.removeActiveStream).toHaveBeenCalledWith("room-1");
    expect(sent.body?.report).toBeDefined();
  });

  it("tells every discovery surface the stream ended", async () => {
    const { res } = fakeRes();

    await patchReportHandler()(fakeReq("removed"), res);

    expect(feed.broadcastToFeedSubscribers).toHaveBeenCalledWith("stream_ended", {
      stream_key: "room-1",
    });
  });

  it("never writes the live_streams table directly", async () => {
    const { res } = fakeRes();

    await patchReportHandler()(fakeReq("removed"), res);

    const touchedLiveStreams = query.mock.calls.some(([sql]) => /live_streams/i.test(String(sql)));
    expect(touchedLiveStreams).toBe(false);
  });

  it("does not claim an end it could not perform", async () => {
    livestream.removeActiveStream.mockResolvedValue(false);
    const { res } = fakeRes();

    await patchReportHandler()(fakeReq("removed"), res);

    expect(feed.broadcastToFeedSubscribers).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("leaves the stream alone for a warning", async () => {
    const { res } = fakeRes();

    await patchReportHandler()(fakeReq("warned"), res);

    expect(livestream.removeActiveStream).not.toHaveBeenCalled();
  });
});
