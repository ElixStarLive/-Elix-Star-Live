import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

const authMocks = vi.hoisted(() => ({
  getTokenFromRequest: vi.fn(),
  checkSessionState: vi.fn(),
  stripAuthCredentials: vi.fn(),
}));

vi.mock("../routes/auth", () => authMocks);
vi.mock("../lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { sessionGuard } from "./sessionGuard";

function request(url: string): Request {
  return { originalUrl: url } as Request;
}

function response() {
  const status = vi.fn();
  const json = vi.fn();
  status.mockReturnValue({ json });
  return {
    value: { status, json } as unknown as Response,
    status,
    json,
  };
}

describe("sessionGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getTokenFromRequest.mockReturnValue("token");
  });

  it("allows public verify-email without querying session state", async () => {
    const res = response();
    const next = vi.fn() as NextFunction;

    await sessionGuard(request("/api/auth/verify-email"), res.value, next);

    expect(next).toHaveBeenCalledOnce();
    expect(authMocks.checkSessionState).not.toHaveBeenCalled();
  });

  it("allows public login without querying session state", async () => {
    const res = response();
    const next = vi.fn() as NextFunction;

    await sessionGuard(request("/api/auth/login"), res.value, next);

    expect(next).toHaveBeenCalledOnce();
    expect(authMocks.checkSessionState).not.toHaveBeenCalled();
  });

  it("validates authenticated auth routes such as /me", async () => {
    const res = response();
    const next = vi.fn() as NextFunction;
    authMocks.checkSessionState.mockResolvedValue({ state: "ok", userId: "user-1" });

    await sessionGuard(request("/api/auth/me"), res.value, next);

    expect(authMocks.checkSessionState).toHaveBeenCalledWith("token");
    expect(next).toHaveBeenCalledOnce();
  });

  it("blocks a banned account", async () => {
    const res = response();
    const next = vi.fn() as NextFunction;
    authMocks.checkSessionState.mockResolvedValue({ state: "banned", userId: "user-1" });

    await sessionGuard(request("/api/wallet"), res.value, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Account suspended." });
    expect(next).not.toHaveBeenCalled();
  });

  it("strips a revoked session before protected handlers run", async () => {
    const req = request("/api/auth/delete");
    const res = response();
    const next = vi.fn() as NextFunction;
    authMocks.checkSessionState.mockResolvedValue({ state: "revoked", userId: "user-1" });

    await sessionGuard(req, res.value, next);

    expect(authMocks.stripAuthCredentials).toHaveBeenCalledWith(req);
    expect(next).toHaveBeenCalledOnce();
  });

  it("fails closed when session state is unavailable", async () => {
    const res = response();
    const next = vi.fn() as NextFunction;
    authMocks.checkSessionState.mockResolvedValue({ state: "unavailable", userId: "user-1" });

    await sessionGuard(request("/api/auth/delete"), res.value, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: "Session validation unavailable." });
    expect(next).not.toHaveBeenCalled();
  });
});
