"""Find Knip unused src exports with no external importers."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
text = (ROOT / "docs/_cleanup_audit_raw/knip-pass6.txt").read_text(encoding="utf-16", errors="ignore")
# strip npm warn header if present
start = text.find("Unused exports")
if start >= 0:
    text = text[start:]
for stop in ("Unused exported types", "Duplicate exports"):
    j = text.find(stop)
    if j > 0:
        text = text[:j]

# NAME ... function PATH:line:col  OR  NAME ... PATH:line:col
# Columns are space-padded; path always starts with src/ or server/
line_re = re.compile(
    r"^(\S+)\s+(?:function|class)\s+(src/\S+?):(\d+)",
    re.M,
)
line_re2 = re.compile(
    r"^(\S+)\s+(src/\S+?):(\d+)",
    re.M,
)

items: list[tuple[str, str]] = []
for m in line_re.finditer(text):
    items.append((m.group(1), m.group(2)))
for m in line_re2.finditer(text):
    pair = (m.group(1), m.group(2))
    if pair not in items:
        items.append(pair)

print(f"parsed src exports: {len(items)}")
safe: list[tuple[str, str, int]] = []
for name, path in items:
    if "testCoins" in path:
        print(f"SKIP testCoins {name}")
        continue
    r = subprocess.run(
        ["rg", "-l", "--glob", "*.{ts,tsx}", rf"\b{re.escape(name)}\b", "src"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )
    files = [Path(f.strip()).as_posix() for f in (r.stdout or "").splitlines() if f.strip()]
    defn = Path(path).as_posix()
    others = [f for f in files if Path(f).as_posix() != defn]
    if not others:
        safe.append((name, path, len(files)))

print(f"no external importers: {len(safe)}")
for name, path, n in safe:
    print(f"OK\t{name}\t{path}\tmentions={n}")
