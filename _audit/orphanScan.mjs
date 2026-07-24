import fs from "fs";
import path from "path";

const SKIP = new Set(["node_modules", "dist", "android", "ios", "_audit", ".git", "coverage", "build"]);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts)$/.test(e.name) && !e.name.endsWith(".d.ts")) acc.push(p.split(path.sep).join("/"));
  }
  return acc;
}

const files = walk("src");
const app = fs.readFileSync("src/App.tsx", "utf8");
const pages = files.filter((f) => f.startsWith("src/pages/") && !f.includes(".test."));
const unreachablePages = [];
for (const p of pages) {
  const base = path.basename(p).replace(/\.tsx?$/, "");
  const relNoExt = p.replace(/^src\//, "").replace(/\.tsx?$/, "");
  const hit =
    app.includes(relNoExt) ||
    app.includes(`pages/${base}`) ||
    app.includes(`/${base}"`) ||
    app.includes(`'${base}'`) ||
    // engagement shell is imported by siblings
    base === "EngagementShell";
  if (!hit) unreachablePages.push(p);
}

const comps = files.filter((f) => f.startsWith("src/components/"));
const contents = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const orphanComps = [];
for (const c of comps) {
  const stem = path.basename(c).replace(/\.tsx?$/, "");
  let refs = 0;
  for (const [f, text] of contents) {
    if (f === c) continue;
    if (text.includes(stem)) refs += 1;
  }
  if (refs === 0) orphanComps.push(c);
}

const libFiles = files.filter((f) => f.startsWith("src/lib/") && !f.includes(".test."));
const orphanLibs = [];
for (const c of libFiles) {
  const stem = path.basename(c).replace(/\.tsx?$/, "");
  let refs = 0;
  for (const [f, text] of contents) {
    if (f === c) continue;
    if (text.includes(stem)) refs += 1;
  }
  if (refs === 0) orphanLibs.push(c);
}

const out = {
  unreachablePages,
  orphanComps,
  orphanLibs,
  counts: {
    pages: pages.length,
    unreachablePages: unreachablePages.length,
    orphanComps: orphanComps.length,
    orphanLibs: orphanLibs.length,
  },
};
fs.writeFileSync("_audit/orphan_scan.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.counts, null, 2));
console.log("UNREACHABLE_PAGES", unreachablePages);
console.log("ORPHAN_COMPS", orphanComps);
console.log("ORPHAN_LIBS_SAMPLE", orphanLibs.slice(0, 40));
