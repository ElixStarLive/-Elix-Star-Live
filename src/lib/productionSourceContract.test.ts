import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/**
 * Release gate: debug instrumentation must never ship.
 *
 * A debugging session left `fetch('http://127.0.0.1:7890/ingest/...')` blocks in
 * App.tsx, websocket.ts, liveRoomLifecycle.ts and VideoFeed.tsx. On a real
 * phone those calls hit the device itself, so every one of them fails and the
 * app ships with dead debug traffic in the hot paths. This test fails the build
 * if any of it comes back.
 */
const SRC_ROOT = resolve(__dirname, "..");
const SERVER_ROOT = resolve(__dirname, "../../server");

/**
 * Reviewed local-host references. Each one reads the *current* page origin or
 * flags a misconfiguration — none of them sends production traffic to a local
 * host. Anything not listed here fails the gate.
 */
const LOCALHOST_REVIEWED: Record<string, string> = {
  "lib/api.ts": "chooses the dev API base; native platforms are excluded first",
  "lib/live/liveKitDiagnostics.ts": "flags a localhost LiveKit URL as a misconfiguration",
  "pages/Create.tsx": "getUserMedia secure-context check (browsers allow https or localhost)",
  "pages/Upload.tsx": "getUserMedia secure-context check (browsers allow https or localhost)",
  "store/useAuthStore.ts": "dev-only wording for an unreachable backend",
};

/**
 * Reviewed `window.location.origin` readers. In the native shell that origin is
 * `http://localhost` (Android) / `capacitor://localhost` (iOS), so a shareable
 * link built from it is unopenable for whoever receives it. Everything that
 * produces a link leaving the app must use `getPublicWebOrigin()` instead.
 */
const PAGE_ORIGIN_REVIEWED: Record<string, string> = {
  "lib/api.ts": "getPublicWebOrigin itself — the browser branch",
  "main.tsx": "resolves a bundled asset, which lives on the WebView origin",
  "lib/notifications.ts": "same-origin check for internal action URLs",
};

const reviewedPath = (relative: string) => relative.split(sep).join("/");

function collectSourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist" || entry === "__snapshots__") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (/\.test\.(ts|tsx)$/.test(entry)) continue;
      if (/\.d\.ts$/.test(entry)) continue;
      out.push(full);
    }
  };
  walk(root);
  return out;
}

describe("production source contains no debug instrumentation", () => {
  const clientFiles = collectSourceFiles(SRC_ROOT);
  const serverFiles = collectSourceFiles(SERVER_ROOT);
  const allFiles = [...clientFiles, ...serverFiles];

  it("finds source files to check", () => {
    expect(clientFiles.length).toBeGreaterThan(100);
    expect(serverFiles.length).toBeGreaterThan(20);
  });

  it("has no debug ingest endpoint anywhere", () => {
    const offenders = allFiles.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("/ingest/") || source.includes(":7890") || source.includes(":7242");
    });
    expect(offenders).toEqual([]);
  });

  it("has no agent log regions", () => {
    const offenders = allFiles.filter((file) =>
      readFileSync(file, "utf8").includes("#region agent log"),
    );
    expect(offenders).toEqual([]);
  });

  it("has no debug session id headers", () => {
    const offenders = allFiles.filter((file) =>
      readFileSync(file, "utf8").includes("X-Debug-Session-Id"),
    );
    expect(offenders).toEqual([]);
  });

  it("only references a local host in reviewed places", () => {
    const offenders = clientFiles
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return source.includes("127.0.0.1") || source.includes("//localhost");
      })
      .map((file) => reviewedPath(file.slice(SRC_ROOT.length + 1)))
      .filter((relative) => !(relative in LOCALHOST_REVIEWED));
    expect(offenders).toEqual([]);
  });

  it("keeps the reviewed list honest — no stale entries", () => {
    const stale = Object.keys(LOCALHOST_REVIEWED).filter((relative) => {
      const source = readFileSync(join(SRC_ROOT, ...relative.split("/")), "utf8");
      return !source.includes("127.0.0.1") && !source.includes("//localhost");
    });
    expect(stale).toEqual([]);
  });

  it("only reads the page origin in reviewed places", () => {
    const offenders = clientFiles
      .filter((file) => readFileSync(file, "utf8").includes("location.origin"))
      .map((file) => reviewedPath(file.slice(SRC_ROOT.length + 1)))
      .filter((relative) => !(relative in PAGE_ORIGIN_REVIEWED));
    expect(offenders).toEqual([]);
  });

  it("keeps the page-origin reviewed list honest — no stale entries", () => {
    const stale = Object.keys(PAGE_ORIGIN_REVIEWED).filter(
      (relative) =>
        !readFileSync(join(SRC_ROOT, ...relative.split("/")), "utf8").includes("location.origin"),
    );
    expect(stale).toEqual([]);
  });

  it("never points production traffic at a local host", () => {
    const offenders = allFiles.filter((file) => {
      const source = readFileSync(file, "utf8");
      return /(?:fetch|axios|EventSource|new WebSocket)\s*\(\s*['"`][^'"`]*(?:127\.0\.0\.1|\/\/localhost)/.test(
        source,
      );
    });
    expect(offenders).toEqual([]);
  });
});
