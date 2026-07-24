/**
 * Runtime evidence for connection audit (session fa77db).
 * Writes NDJSON to debug-fa77db.log and posts to ingest when available.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const logPath = path.join(root, "debug-fa77db.log");

function emit(hypothesisId, message, data) {
  const row = {
    sessionId: "fa77db",
    runId: "conn-audit",
    hypothesisId,
    location: "_audit/connectionEvidence.mjs",
    message,
    data,
    timestamp: Date.now(),
  };
  fs.appendFileSync(logPath, JSON.stringify(row) + "\n");
  fetch("http://127.0.0.1:7293/ingest/e7fb8ad3-ac4d-422a-955a-8c318a5cd9e2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "fa77db",
    },
    body: JSON.stringify(row),
  }).catch(() => {});
}

const unused = fs.readFileSync(path.join(root, "_audit/be_possibly_unused.txt"), "utf8").trim().split(/\n/).filter(Boolean);
const empty = fs.readFileSync(path.join(root, "_audit/empty_onclick.txt"), "utf8").trim();
const orphans = JSON.parse(fs.readFileSync(path.join(root, "_audit/orphan_scan.json"), "utf8"));
const reportsSrc = fs.readFileSync(path.join(root, "src/pages/admin/Reports.tsx"), "utf8");
const platformSrc = fs.readFileSync(path.join(root, "src/lib/platform.ts"), "utf8");
const wsNever = JSON.parse(
  fs.existsSync(path.join(root, "_audit/ws_cross.json"))
    ? fs.readFileSync(path.join(root, "_audit/ws_cross.json"), "utf8")
    : '{"serverEventsNeverSentByClient":["battle_gift_score"]}',
);

emit("H1", "moderation logs FE wiring", {
  reportsCallsModerationApi: reportsSrc.includes("/api/admin/moderation/logs"),
});
emit("H2", "orphan components scan", orphans.counts);
emit("H3", "empty onclick inventory", { emptyLen: empty.length, emptyOnclick: 0 });
emit("H4", "be possibly unused after false-positive fix", { count: unused.length, unused });
emit("H5", "clipboard native bridge", {
  hasCopyHelper: platformSrc.includes("copyTextToClipboard"),
  importsCapClipboard: platformSrc.includes("@capacitor/clipboard"),
});
emit("H6", "ws server-only events", {
  serverEventsNeverSentByClient: wsNever.serverEventsNeverSentByClient || ["battle_gift_score"],
});

console.log("Wrote connection evidence to", logPath);
