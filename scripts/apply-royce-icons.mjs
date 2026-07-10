import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '..', 'src');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

function royceImportPath(filePath) {
  const rel = path.relative(path.dirname(filePath), path.join(srcRoot, 'components', 'royce.tsx'));
  return rel.replace(/\\/g, '/').replace(/\.tsx$/, '');
}

function ensureRoyceImport(content, filePath) {
  if (content.includes("components/royce'") || content.includes('components/royce"')) return content;
  if (content.includes('RoyceBackIcon') || content.includes('RoyceCloseIcon')) {
    const importLine = `import { RoyceBackIcon, RoyceCloseIcon } from '${royceImportPath(filePath)}';\n`;
    const match = content.match(/^import .+;\n/m);
    if (match) {
      const idx = content.indexOf(match[0]) + match[0].length;
      if (!content.includes(importLine.trim())) {
        return content.slice(0, idx) + importLine + content.slice(idx);
      }
    }
  }
  return content;
}

const files = walk(srcRoot).filter((f) => !f.endsWith('royce.tsx') && !f.endsWith('royceAssets.ts'));

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  content = content.replaceAll("'/Icons/Profile icon.png'", "'/royce/default-avatar.svg'");
  content = content.replaceAll('"/Icons/Profile icon.png"', '"/royce/default-avatar.svg"');
  content = content.replaceAll('/Icons/Profile icon.png', '/royce/default-avatar.svg');
  content = content.replaceAll("'/Icons/elix-logo.png'", "'/royce/elix-mark.svg'");
  content = content.replaceAll('"/Icons/elix-logo.png"', '"/royce/elix-mark.svg"');
  content = content.replaceAll('/Icons/elix-logo.png', '/royce/elix-mark.svg');

  content = content.replace(
    /<img\s+src="\/Icons\/Gold power buton\.png"[^>]*alt="Close"[^>]*\/>/gi,
    '<RoyceCloseIcon />'
  );
  content = content.replace(
    /<img\s+src="\/Icons\/Gold power buton\.png"[^>]*alt=""[^>]*\/>/gi,
    '<RoyceBackIcon />'
  );
  content = content.replace(
    /<img\s+src="\/Icons\/Gold power buton\.png"[^>]*alt="Back"[^>]*\/>/gi,
    '<RoyceBackIcon />'
  );
  content = content.replace(
    /<img\s+src="\/Icons\/Gold power buton\.png"[^>]*alt="Leave stream"[^>]*\/>/gi,
    '<RoyceBackIcon />'
  );
  content = content.replace(
    /<img\s+src="\/Icons\/Gold power buton\.png"[^>]*\/>/gi,
    '<RoyceBackIcon />'
  );

  // ElixCameraLayout / StemFeed: src= on img without full tag in one line
  content = content.replace(
    /src="\/Icons\/Gold power buton\.png"/g,
    '/* replaced */'
  );

  if (content !== original) {
    content = ensureRoyceImport(content, file);
    fs.writeFileSync(file, content, 'utf8');
    console.log('updated', path.relative(srcRoot, file));
  }
}

console.log('done');
