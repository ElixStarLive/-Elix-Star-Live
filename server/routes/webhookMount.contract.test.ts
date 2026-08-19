/**
 * Webhook mounting contract.
 *
 * Every provider router in `webhooks.router.ts` declares its handler at `"/"`,
 * which is only reachable when the router is attached with `app.use(path, router)`
 * — that is what strips the mount path before the router matches. Attaching the
 * same router with `app.post(path, router)` leaves the full request path in place,
 * so `"/"` never matches and the delivery falls through to whatever comes next.
 * Nothing in the request looks wrong from the provider's side, which is why a
 * mismatch here is invisible until events silently stop arriving.
 *
 * The first test measures that difference on a real Express app rather than
 * asserting it from memory; the second holds the production mounts to it.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createServer } from "http";
import type { AddressInfo } from "net";
import express, { Router } from "express";
import { describe, expect, it } from "vitest";

async function statusFor(
  mount: (app: express.Express, router: Router) => void,
): Promise<{ status: number; body: string }> {
  const app = express();
  const router = Router();
  router.post("/", (_req, res) => {
    res.status(200).send("handler-reached");
  });
  mount(app, router);
  app.use((_req, res) => {
    res.status(404).send("fell-through");
  });

  const server = createServer(app);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/provider/webhook`, {
      method: "POST",
    });
    return { status: res.status, body: (await res.text()).trim() };
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
  }
}

describe("Express router mounting", () => {
  it("app.use reaches a router's own '/' handler", async () => {
    const res = await statusFor((app, router) =>
      app.use("/api/provider/webhook", router),
    );
    expect(res).toEqual({ status: 200, body: "handler-reached" });
  });

  it("app.post does not reach it — the delivery falls through", async () => {
    const res = await statusFor((app, router) =>
      app.post("/api/provider/webhook", router),
    );
    expect(res.body).toBe("fell-through");
  });
});

describe("production webhook mounts", () => {
  const index = readFileSync(
    resolve(__dirname, "../..", "server/index.ts"),
    "utf8",
  );
  const routers = readFileSync(
    resolve(__dirname, "../..", "server/routes/webhooks.router.ts"),
    "utf8",
  );

  const providers = [
    { router: "livekitWebhookRouter", path: "/api/livekit/webhook" },
    { router: "googlePlayRtdnRouter", path: "/api/webhooks/google-play" },
    { router: "appleIapNotifyRouter", path: "/api/webhooks/apple-iap" },
    { router: "stripeWebhookRouter", path: "/api/stripe-webhook" },
  ];

  for (const { router, path } of providers) {
    it(`${router} is mounted with app.use at ${path}`, () => {
      expect(routers).toContain(`const ${router} = Router()`);
      expect(index).toContain(`app.use("${path}", ${router})`);
      expect(index).not.toContain(`app.post("${path}", ${router})`);
    });
  }

  it("raw-body webhook routes are registered before express.json()", () => {
    const jsonAt = index.indexOf('app.use(express.json(');
    expect(jsonAt).toBeGreaterThan(-1);
    for (const { path } of providers) {
      const mountAt = index.indexOf(`app.use("${path}"`);
      expect(mountAt, `${path} is not mounted`).toBeGreaterThan(-1);
      // A parsed body cannot be re-read as bytes, and every one of these
      // providers signs the raw bytes.
      expect(mountAt, `${path} must be mounted before express.json()`).toBeLessThan(
        jsonAt,
      );
    }
  });
});
