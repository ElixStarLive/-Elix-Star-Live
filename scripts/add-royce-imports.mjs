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

function royceImportPath(filePath) {
  const rel = path.relative(path.dirname(filePath), path.join(srcRoot, 'components', 'royce.tsx'));
  return rel.replace(/\\/g, '/').replace(/\.tsx$/, '');
}

for (const file of walk(srcRoot)) {
  if (file.endsWith(`${path.sep}royce.tsx`)) continue;
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('RoyceBackIcon') && !content.includes('RoyceCloseIcon') && !content.includes('RoyceIcon')) continue;
  if (content.includes("from '") && /from ['\"].*\/royce['\"]/.test(content)) continue;

  const needs = [];
  if (content.includes('RoyceBackIcon')) needs.push('RoyceBackIcon');
  if (content.includes('RoyceCloseIcon')) needs.push('RoyceCloseIcon');
  if (content.includes('RoyceIcon')) needs.push('RoyceIcon');
  const unique = [...new Set(needs)];
  const importLine = `import { ${unique.join(', ')} } from '${royceImportPath(file)}';\n`;
  const firstImport = content.match(/^import .+;\r?\n/m);
  if (!firstImport) continue;
  const idx = content.indexOf(firstImport[0]) + firstImport[0].length;
  content = content.slice(0, idx) + importLine + content.slice(idx);
  fs.writeFileSync(file, content, 'utf8');
  console.log('import', path.relative(srcRoot, file));
}

console.log('done');
