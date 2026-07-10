import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '..', 'src');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.tsx')) files.push(full);
  }
  return files;
}

const replacements = [
  ['border-t border-gold/30', ''],
  ['border-b border-gold/25', ''],
  ['border-t border-[#C9A227]/20', ''],
  ['border-t border-[#C9A227]/30', ''],
  ['border-2 border-b-0 border-[#C9A227]', ''],
  ['border border-b-0 border-[#C9A227]/30', ''],
  ['border-b border-[#C9A227]/10', ''],
  ['border-b border-[#C9A227]/20', ''],
];

for (const file of walk(srcRoot)) {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  for (const [from, to] of replacements) {
    content = content.replaceAll(from, to);
  }
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('updated', path.relative(srcRoot, file));
  }
}

console.log('done');
