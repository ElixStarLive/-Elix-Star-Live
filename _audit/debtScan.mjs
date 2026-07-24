import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "_audit");

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
function rel(p) { return path.relative(root, p).replace(/\\/g, "/"); }
function read(p) { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } }

const files = [
  ...walk(path.join(root, "src"), [".ts", ".tsx"]),
  ...walk(path.join(root, "server"), [".ts"]),
].filter((p) => !/\.(test|spec)\./.test(p) && !p.includes(`${path.sep}node_modules${path.sep}`));

const hits = [];
const patterns = [
  { name: "TODO", re: /\bTODO\b/ },
  { name: "FIXME", re: /\bFIXME\b/ },
  { name: "XXX", re: /\bXXX\b/ },
  { name: "HACK", re: /\bHACK\b/ },
  { name: "NOT_IMPLEMENTED", re: /not implemented|NotImplemented|NOT_IMPLEMENTED/i },
  { name: "STUB", re: /\bstub\b|STUB_/i },
  { name: "FAKE_SUCCESS", re: /fake success|pretend.*success|hardcode.*success/i },
  { name: "MOCK_LOGIC", re: /\bmock[A-Z]|isMock|MOCK_|useMock|dummy data|fake data/i },
  { name: "COMING_SOON", re: /coming soon/i },
  { name: "LOCAL_ONLY", re: /localStorage only|in-memory only|dev only|disabled in production/i },
];

for (const f of files) {
  const lines = read(f).split(/\r?\n/);
  lines.forEach((line, i) => {
    // skip UI placeholder= attrs
    if (/placeholder=/.test(line) && !/\bTODO\b|\bFIXME\b/.test(line)) return;
    if (/placeholder:text|placeholder-white|PLACEHOLDER_AVATAR|placeholder labels/i.test(line)) return;
    for (const p of patterns) {
      if (p.re.test(line)) {
        hits.push({ kind: p.name, file: rel(f), line: i + 1, text: line.trim().slice(0, 180) });
        break;
      }
    }
  });
}

const byKind = {};
for (const h of hits) byKind[h.kind] = (byKind[h.kind] || 0) + 1;
fs.writeFileSync(path.join(outDir, "debt_real.json"), JSON.stringify({ byKind, hits }, null, 2));
console.log(JSON.stringify(byKind, null, 2));
hits.slice(0, 80).forEach((h) => console.log(`${h.kind}|${h.file}:${h.line}|${h.text}`));
console.log("TOTAL=" + hits.length);
