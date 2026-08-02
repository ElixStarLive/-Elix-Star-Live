import fs from 'fs';

const path = 'src/features/live/spectator/SpectatorLiveScreen.tsx';
const src = fs.readFileSync(path, 'utf8');
const lines = src.split(/\r?\n/);

let fnStart = -1;
let loadingReturn = -1;
let offlineReturn = -1;
let mainReturn = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('export default function SpectatorLiveScreen')) fnStart = i;
  if (
    lines[i].trim() === 'if (streamIsLive === null) {' &&
    lines[i + 1]?.trim() === 'return ('
  ) {
    loadingReturn = i;
  }
  if (
    lines[i].trim() === 'if (streamIsLive === false) {' &&
    lines[i + 1]?.trim() === 'return ('
  ) {
    offlineReturn = i;
  }
  if (
    lines[i].trim() === 'return (' &&
    (lines[i + 1]?.includes('fixed inset-0 flex justify-center transition-transform') ||
      lines[i + 2]?.includes('fixed inset-0 flex justify-center transition-transform'))
  ) {
    mainReturn = i;
  }
}

if (fnStart < 0 || loadingReturn < 0 || offlineReturn < 0 || mainReturn < 0) {
  console.error('split markers not found', {
    fnStart,
    loadingReturn,
    offlineReturn,
    mainReturn,
  });
  process.exit(1);
}

// Extract early JSX blocks (inside the if bodies)
function extractReturnJsx(startIfLine) {
  // startIfLine points at `if (...) {`
  // next is `return (`
  let i = startIfLine + 1; // return (
  if (lines[i].trim() !== 'return (') {
    throw new Error('expected return ( after if at ' + (startIfLine + 1));
  }
  i += 1;
  const jsxLines = [];
  let depth = 1; // inside return (
  for (; i < lines.length; i++) {
    const t = lines[i];
    // crude paren depth on trimmed lines ending with ); for closing return
    for (const ch of t) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
    }
    if (depth === 0) {
      // line has the closing ); of return (
      // don't include the closing );
      break;
    }
    jsxLines.push(t);
  }
  // find closing brace of if
  let j = i;
  while (j < lines.length && lines[j].trim() !== '}') j += 1;
  return { jsx: jsxLines.join('\n'), endIf: j };
}

const loading = extractReturnJsx(loadingReturn);
const offline = extractReturnJsx(offlineReturn);

const preamble = lines.slice(0, fnStart).join('\n');
// Logic = body until loadingReturn (exclusive), then skip early returns, then until mainReturn
const logicBefore = lines.slice(fnStart + 1, loadingReturn).join('\n');
const logicAfterEarly = lines.slice(offline.endIf + 1, mainReturn).join('\n');
const jsxBlock = lines.slice(mainReturn).join('\n');

const logicBody = `${logicBefore}

  const spectatorGate =
    streamIsLive === null ? 'loading' : streamIsLive === false ? 'offline' : 'live';

${logicAfterEarly}`;

const names = new Set(['spectatorGate']);
const logicLines = logicBody.split(/\r?\n/);
for (const line of logicLines) {
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

const sorted = [...names].sort();
const returnObj = sorted.map((n) => `    ${n},`).join('\n');
const destructure = sorted.map((n) => `    ${n},`).join('\n');

const controller = `${preamble}
export function useLiveSpectatorController() {
${logicBody}

  return {
${returnObj}
  };
}
`;

const screen = `${preamble}
import { useLiveSpectatorController } from './useLiveSpectatorController';

/** Thin Live spectator UI shell — orchestration owns useLiveSpectatorController. */
export default function SpectatorLiveScreen() {
  const {
${destructure}
  } = useLiveSpectatorController();

  if (spectatorGate === 'loading') {
    return (
${loading.jsx}
    );
  }

  if (spectatorGate === 'offline') {
    return (
${offline.jsx}
    );
  }

${jsxBlock}
`;

fs.writeFileSync(
  'src/features/live/spectator/useLiveSpectatorController.tsx',
  controller,
);
fs.writeFileSync(path, screen);
console.log('Wrote spectator controller + thin screen', {
  fnStart: fnStart + 1,
  loadingReturn: loadingReturn + 1,
  offlineReturn: offlineReturn + 1,
  mainReturn: mainReturn + 1,
  bindings: sorted.length,
});
