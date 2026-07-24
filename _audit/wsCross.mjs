import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
function walk(dir, exts, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git", "coverage", "_aab_peek", "build"].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, exts, acc);
    else if (exts.some((e) => ent.name.endsWith(e))) acc.push(p);
  }
  return acc;
}
function read(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return ""; }
}

const handlers = read(path.join(root, "server/websocket/handlers.ts"));
const serverEvents = [...handlers.matchAll(/case\s+["']([a-z0-9_]+)["']/g)].map((m) => m[1]);
fs.writeFileSync(path.join(root, "_audit/ws_server_events.txt"), [...new Set(serverEvents)].sort().join("\n") + "\n");

const clientSends = new Set();
const clientListens = new Set();
for (const f of walk(path.join(root, "src"), [".ts", ".tsx"])) {
  const t = read(f);
  for (const m of t.matchAll(/websocket\.send\(\s*["']([a-z0-9_]+)/gi)) clientSends.add(m[1]);
  for (const m of t.matchAll(/\.send\(\s*["']([a-z0-9_]+)/gi)) clientSends.add(m[1]);
  for (const m of t.matchAll(/on\(\s*["']([a-z0-9_]+)/gi)) clientListens.add(m[1]);
  for (const m of t.matchAll(/addListener\(\s*["']([a-z0-9_]+)/gi)) clientListens.add(m[1]);
}
fs.writeFileSync(path.join(root, "_audit/ws_client_sends.txt"), [...clientSends].sort().join("\n") + "\n");
fs.writeFileSync(path.join(root, "_audit/ws_client_listens.txt"), [...clientListens].sort().join("\n") + "\n");

const missingOnServer = [...clientSends].filter((e) => !serverEvents.includes(e));
const unusedOnClient = [...serverEvents].filter((e) => !clientSends.has(e));

console.log(JSON.stringify({
  serverEvents: serverEvents.length,
  clientSends: clientSends.size,
  clientListens: clientListens.size,
  clientSendMissingOnServer: missingOnServer,
  serverEventsNeverSentByClient: unusedOnClient,
}, null, 2));

// Backend routes that look unused: compare be_full to fe_api
const be = fs.readFileSync(path.join(root, "_audit/be_full_paths.txt"), "utf8").trim().split(/\n/).filter(Boolean);
const fe = fs.readFileSync(path.join(root, "_audit/fe_api_paths.txt"), "utf8").trim().split(/\n/).filter(Boolean);
function norm(p) {
  return p.replace(/\$\{[^}]+\}/g, ":p").replace(/:[a-zA-Z_]+/g, ":p").replace(/\/+/g, "/");
}
const feNorm = fe.map(norm);
const unusedBe = [];
for (const line of be) {
  const method = line.split(" ")[0];
  const p = line.slice(method.length + 1);
  if (method === "USE") continue;
  const n = norm(p);
  const used = feNorm.some((f) => f === n || f.startsWith(n + "/") || n.startsWith(f) || f.split("/").slice(0, 4).join("/") === n.split("/").slice(0, 4).join("/"));
  if (!used) unusedBe.push(line);
}
fs.writeFileSync(path.join(root, "_audit/be_possibly_unused.txt"), unusedBe.join("\n") + "\n");
console.log("BE_POSSIBLY_UNUSED=" + unusedBe.length);
unusedBe.slice(0, 50).forEach((x) => console.log(x));
