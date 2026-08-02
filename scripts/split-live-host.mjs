import fs from 'fs';

const hostPath = 'src/features/live/host/LiveHostScreen.tsx';
const src = fs.readFileSync(hostPath, 'utf8');
const lines = src.split(/\r?\n/);

let fnStart = -1;
let mainReturn = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('export default function LiveHostScreen')) fnStart = i;
  // return ( then <div then className="fixed inset-0 ...
  if (
    lines[i].trim() === 'return (' &&
    (lines[i + 1]?.includes('fixed inset-0') ||
      lines[i + 2]?.includes('fixed inset-0'))
  ) {
    mainReturn = i;
  }
}
if (fnStart < 0 || mainReturn < 0) {
  console.error('split markers not found', { fnStart, mainReturn });
  process.exit(1);
}

const preamble = lines.slice(0, fnStart).join('\n');
const logicBody = lines.slice(fnStart + 1, mainReturn).join('\n');
const jsxBlock = lines.slice(mainReturn).join('\n');

const names = new Set();
for (let i = fnStart + 1; i < mainReturn; i++) {
  const line = lines[i];
  let m;
  if ((m = line.match(/^  (?:const|let) \[([^\]]+)\]/))) {
    for (const part of m[1].split(',')) {
      const n = part.trim().replace(/\s+/g, ' ').split(/[\s=]/)[0];
      if (n && /^[A-Za-z_]/.test(n)) names.add(n);
    }
  } else if ((m = line.match(/^  (?:const|let) ([A-Za-z_][A-Za-z0-9_]*)/))) {
    names.add(m[1]);
  } else if ((m = line.match(/^  (?:async )?function ([A-Za-z_][A-Za-z0-9_]*)/))) {
    names.add(m[1]);
  }
}

// Always include common refs that may be assigned without const pattern edge cases
const sorted = [...names].sort();
const returnObj = sorted.map((n) => `    ${n},`).join('\n');

const controller = `${preamble}
export function useLiveHostController() {
${logicBody}

  return {
${returnObj}
  };
}
`;

// Thin screen keeps UI helpers from preamble + JSX; orchestration via hook.
const destructure = sorted.map((n) => `    ${n},`).join('\n');
const screen = `${preamble}
import { useLiveHostController } from './useLiveHostController';

/** Thin Live host UI shell — orchestration owns useLiveHostController. */
export default function LiveHostScreen() {
  const {
${destructure}
  } = useLiveHostController();

${jsxBlock}
`;

fs.writeFileSync('src/features/live/host/useLiveHostController.ts', controller);
fs.writeFileSync('src/features/live/host/LiveHostScreen.tsx', screen);
console.log('Wrote controller + thin screen', {
  fnStart: fnStart + 1,
  mainReturn: mainReturn + 1,
  bindings: sorted.length,
});
