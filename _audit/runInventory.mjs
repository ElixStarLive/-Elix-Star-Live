import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "_audit");
fs.mkdirSync(outDir, { recursive: true });

function walk(dir, exts, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name === ".git" || ent.name === "coverage" || ent.name === "_aab_peek" || ent.name === "build") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, exts, acc);
    else if (exts.some((e) => ent.name.endsWith(e))) acc.push(p);
  }
  return acc;
}

function rel(p) {
  return path.relative(root, p).replace(/\\/g, "/");
}

function read(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

const srcFiles = walk(path.join(root, "src"), [".ts", ".tsx"]);
const serverFiles = walk(path.join(root, "server"), [".ts", ".tsx"]).filter((p) => !p.includes(`${path.sep}node_modules${path.sep}`));
const androidSrc = walk(path.join(root, "android", "app", "src"), [".java", ".kt", ".xml", ".gradle"]);
const migrations = walk(path.join(root, "server", "migrations"), [".sql"]);
const tests = [...srcFiles, ...serverFiles].filter((p) => /\.(test|spec)\.(ts|tsx)$/.test(p));
const iosFiles = walk(path.join(root, "ios"), [".swift", ".m", ".h", ".plist"]).slice(0, 500);
const scripts = walk(path.join(root, "scripts"), [".ts", ".js", ".mjs", ".sh", ".ps1"]);
const docs = walk(path.join(root, "docs"), [".md"]);

const inventory = {
  src_ts: srcFiles.length,
  server_ts: serverFiles.length,
  android_src: androidSrc.length,
  migrations: migrations.length,
  tests: tests.length,
  ios_sampled: iosFiles.length,
  scripts: scripts.length,
  docs: docs.length,
  inspected_total:
    srcFiles.length +
    serverFiles.length +
    androidSrc.length +
    migrations.length +
    tests.length +
    Math.min(iosFiles.length, 50) +
    scripts.length,
};

fs.writeFileSync(path.join(outDir, "counts.json"), JSON.stringify(inventory, null, 2));

// Frontend routes
const appTsx = read(path.join(root, "src", "App.tsx"));
const feRoutes = [...appTsx.matchAll(/path=["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
const uniqueFeRoutes = [...new Set(feRoutes)].sort();
fs.writeFileSync(path.join(outDir, "fe_routes.txt"), uniqueFeRoutes.join("\n") + "\n");

const pages = walk(path.join(root, "src", "pages"), [".tsx"]).map(rel).sort();
fs.writeFileSync(path.join(outDir, "fe_pages.txt"), pages.join("\n") + "\n");

// Frontend /api paths
const feApi = new Set();
for (const f of srcFiles) {
  const t = read(f);
  for (const m of t.matchAll(/["'`](\/api\/[^"'`]+)["'`]/g)) feApi.add(m[1].split("?")[0]);
  for (const m of t.matchAll(/api\.(?:get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)[`'"]/gi)) {
    const p = m[1].startsWith("/") ? m[1] : `/api/${m[1]}`;
    feApi.add(p.split("?")[0]);
  }
}
const feApiList = [...feApi].sort();
fs.writeFileSync(path.join(outDir, "fe_api_paths.txt"), feApiList.join("\n") + "\n");

// Backend method paths
const bePaths = new Set();
const beMounts = [];
for (const f of serverFiles) {
  const t = read(f);
  for (const m of t.matchAll(/\.(get|post|put|patch|delete|use)\(\s*[`'"]([^`'"]+)[`'"]/g)) {
    bePaths.add(`${m[1].toUpperCase()} ${m[2]}`);
  }
  for (const m of t.matchAll(/app\.use\(\s*[`'"]([^`'"]+)[`'"]/g)) {
    beMounts.push(m[1]);
  }
}
fs.writeFileSync(path.join(outDir, "be_methods.txt"), [...bePaths].sort().join("\n") + "\n");
fs.writeFileSync(path.join(outDir, "be_mounts.txt"), [...new Set(beMounts)].sort().join("\n") + "\n");

// Router mount prefixes from routes/index.ts
const routeIndex = read(path.join(root, "server", "routes", "index.ts"));
const mounts = [...routeIndex.matchAll(/app\.use\(\s*[`'"]([^`'"]+)[`'"]/g)].map((m) => m[1]);
fs.writeFileSync(path.join(outDir, "api_mounts.txt"), mounts.join("\n") + "\n");

// Expand backend full paths roughly: mount + router paths
function collectRouterPaths(file) {
  const t = read(file);
  const paths = [];
  for (const m of t.matchAll(/router\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)[`'"]/g)) {
    paths.push({ method: m[1].toUpperCase(), path: m[2] });
  }
  // also express.Router files using .get without router. prefix in destructuring rare
  return paths;
}

const routerFiles = serverFiles.filter((p) => /routes[\\/].*\.ts$/.test(p) && !p.endsWith(".test.ts"));
const fullBe = new Set();
const mountMap = {
  "auth.router.ts": "/api/auth",
  "live.router.ts": "/api/live",
  "gifts.router.ts": "/api/gifts",
  "feed.router.ts": "/api/feed",
  "chat.router.ts": "/api/chat",
  "profiles.router.ts": "/api/profiles",
  "wallet.router.ts": "/api/wallet",
  "shop.router.ts": "/api/shop",
  "payout.router.ts": "/api/creator|/api/admin",
  "videos.router.ts": "/api/videos",
  "media.router.ts": "/api/media",
  "misc.router.ts": "/api",
  "adminActions.ts": "/api/admin",
  "music.router.ts": "/api/music",
  "stories.router.ts": "/api/stories",
  "risingStars.router.ts": "/api/rising-stars",
  "adminRisingStars.router.ts": "/api/admin/rising-stars",
  "progression.router.ts": "/api/progression",
  "adminProgression.router.ts": "/api/admin/progression",
  "engagement.router.ts": "/api/engagement",
  "webhooks.router.ts": "/api",
};

for (const f of routerFiles) {
  const base = path.basename(f);
  const prefixes = (mountMap[base] || "").split("|").filter(Boolean);
  const t = read(f);
  // payout.router.ts uses creatorRouter / adminPayoutRouter — handled below (skip generic).
  // Match word-boundary `router.` only — bare `r.` false-matches inside `*Router.get`.
  if (base !== "payout.router.ts") {
    for (const m of t.matchAll(/\brouter\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)[`'"]/g)) {
      const method = m[1].toUpperCase();
      const p = m[2];
      if (prefixes.length === 0) fullBe.add(`${method} ${p}`);
      for (const pref of prefixes) {
        const full = (pref + (p === "/" ? "" : p)).replace(/\/+/g, "/");
        fullBe.add(`${method} ${full}`);
      }
    }
  }
  // gifts soundsRouter special
  if (base === "gifts.router.ts") {
    for (const m of t.matchAll(/soundsRouter\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)[`'"]/g)) {
      fullBe.add(`${m[1].toUpperCase()} /api/sounds${m[2] === "/" ? "" : m[2]}`);
    }
  }
  if (base === "shop.router.ts") {
    for (const m of t.matchAll(/coinPackagesRouter\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)[`'"]/g)) {
      fullBe.add(`${m[1].toUpperCase()} /api/coin-packages${m[2] === "/" ? "" : m[2]}`);
    }
  }
  if (base === "payout.router.ts") {
    for (const m of t.matchAll(/creatorRouter\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)[`'"]/g)) {
      fullBe.add(`${m[1].toUpperCase()} /api/creator${m[2] === "/" ? "" : m[2]}`);
    }
    for (const m of t.matchAll(/adminPayoutRouter\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)[`'"]/g)) {
      fullBe.add(`${m[1].toUpperCase()} /api/admin${m[2] === "/" ? "" : m[2]}`);
    }
  }
}

// misc may use router at /api
fs.writeFileSync(path.join(outDir, "be_full_paths.txt"), [...fullBe].sort().join("\n") + "\n");

// Cross match: normalize fe paths (strip :params roughly)
function normalizeApi(p) {
  return p
    .replace(/\$\{[^}]+\}/g, ":param")
    .replace(/\/\d+/g, "/:id")
    .replace(/\/[0-9a-f-]{8,}/gi, "/:id");
}

const bePathOnly = new Set([...fullBe].map((x) => x.split(" ").slice(1).join(" ")));
const matched = [];
const unmatchedFe = [];
for (const p of feApiList) {
  const n = normalizeApi(p);
  let ok = false;
  for (const b of bePathOnly) {
    const bn = normalizeApi(b);
    if (bn === n || n.startsWith(bn + "/") || bn.startsWith(n) || n.replace(/\/:param/g, "") === bn.replace(/\/:[^/]+/g, "")) {
      ok = true;
      break;
    }
    // prefix mount match: /api/auth/login vs /api/auth
    const segs = n.split("/");
    for (let i = segs.length; i >= 3; i--) {
      const prefix = segs.slice(0, i).join("/");
      if ([...bePathOnly].some((bp) => normalizeApi(bp) === prefix || normalizeApi(bp).startsWith(prefix))) {
        // weak
      }
    }
  }
  // Better: check if any be path shares same static prefix
  const feStatic = n.replace(/\/:[^/]+/g, "/:x");
  for (const b of bePathOnly) {
    const bs = normalizeApi(b).replace(/\/:[^/]+/g, "/:x");
    if (feStatic === bs || feStatic.startsWith(bs + "/") || bs.startsWith(feStatic.split("/").slice(0, 4).join("/"))) {
      // check first 3 segments match
      const a = feStatic.split("/");
      const c = bs.split("/");
      if (a[1] === c[1] && a[2] === c[2]) {
        ok = true;
        break;
      }
    }
  }
  if (ok) matched.push(p);
  else unmatchedFe.push(p);
}

fs.writeFileSync(path.join(outDir, "fe_api_unmatched.txt"), unmatchedFe.join("\n") + "\n");
fs.writeFileSync(path.join(outDir, "fe_api_matched_count.txt"), String(matched.length));

// Debt scan
const debt = [];
const debtRe = /TODO|FIXME|XXX\b|HACK\b|not implemented|coming soon|placeholder|mock(?:ed)?\b|demo only|fake success|throw new Error\(['\"]Not implemented/gi;
for (const f of [...srcFiles, ...serverFiles]) {
  if (/\.(test|spec)\./.test(f)) continue;
  const lines = read(f).split(/\r?\n/);
  lines.forEach((line, i) => {
    if (debtRe.test(line)) {
      debtRe.lastIndex = 0;
      debt.push(`${rel(f)}:${i + 1}:${line.trim().slice(0, 200)}`);
    }
  });
}
fs.writeFileSync(path.join(outDir, "debt.txt"), debt.join("\n") + "\n");

// WS types
const wsFiles = [...srcFiles, ...serverFiles].filter((p) => /websocket|LiveStream|Spectator|ChatOverlay|handlers|battle|giftDelivery|call/i.test(p));
const wsTypes = new Set();
for (const f of wsFiles) {
  const t = read(f);
  for (const m of t.matchAll(/type\s*:\s*['"]([a-z0-9_]+)['"]/gi)) wsTypes.add(m[1]);
  for (const m of t.matchAll(/['"]type['"]\s*:\s*['"]([a-z0-9_]+)['"]/gi)) wsTypes.add(m[1]);
}
fs.writeFileSync(path.join(outDir, "ws_types.txt"), [...wsTypes].sort().join("\n") + "\n");

// onClick handlers that are empty or console only
const emptyActions = [];
for (const f of srcFiles) {
  if (!f.endsWith(".tsx")) continue;
  const t = read(f);
  for (const m of t.matchAll(/onClick=\{[^}]*\}/g)) {
    const s = m[0];
    if (/onClick=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/.test(s) || /onClick=\{\s*\(\)\s*=>\s*undefined\s*\}/.test(s) || /onClick=\{\s*\(\)\s*=>\s*console\./.test(s)) {
      emptyActions.push(`${rel(f)}:${s.slice(0, 120)}`);
    }
  }
}
fs.writeFileSync(path.join(outDir, "empty_onclick.txt"), emptyActions.join("\n") + "\n");

// CREATE TABLE from migrations
const tables = new Set();
for (const f of migrations) {
  const t = read(f);
  for (const m of t.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/gi)) tables.add(m[1]);
  for (const m of t.matchAll(/CREATE TABLE\s+([a-z0-9_]+)/gi)) tables.add(m[1]);
  for (const m of t.matchAll(/ALTER TABLE\s+([a-z0-9_]+)/gi)) tables.add(m[1]);
}
fs.writeFileSync(path.join(outDir, "tables.txt"), [...tables].sort().join("\n") + "\n");

console.log(JSON.stringify({
  ...inventory,
  fe_routes: uniqueFeRoutes.length,
  fe_pages: pages.length,
  fe_api: feApiList.length,
  fe_api_unmatched: unmatchedFe.length,
  be_full: fullBe.size,
  debt: debt.length,
  ws_types: wsTypes.length,
  tables: tables.length,
  empty_onclick: emptyActions.length,
}, null, 2));
console.log("UNMATCHED_FE_SAMPLE:");
unmatchedFe.slice(0, 40).forEach((p) => console.log(p));
console.log("DEBT_SAMPLE:");
debt.slice(0, 40).forEach((p) => console.log(p));
