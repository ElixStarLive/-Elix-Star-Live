import fs from 'fs';

let t = fs.readFileSync('src/features/live/spectator/_restore_SpectatorPage.tsx', 'utf8');
const pairs = [
  ["from '../lib/", "from '../../../lib/"],
  ['from "../lib/', 'from "../../../lib/'],
  ["from '../components/", "from '../../../components/"],
  ['from "../components/', 'from "../../../components/'],
  ["from '../store/", "from '../../../store/"],
  ['from "../store/', 'from "../../../store/'],
  ["from '../hooks/", "from '../../../hooks/"],
  ['from "../hooks/', 'from "../../../hooks/'],
  ["from '../config/", "from '../../../config/"],
  ['from "../config/', 'from "../../../config/'],
];
for (const [a, b] of pairs) t = t.split(a).join(b);
t = t.replace(
  'export default function SpectatorPage()',
  'export default function SpectatorLiveScreen()',
);

// Wire feature owners (paid gifts + catalog + shared ids)
if (!t.includes("from '../index'")) {
  t = t.replace(
    "import { sendGift, giftSendErrorToast } from '../../../lib/giftSend';",
    `import { giftSendErrorToast } from '../../../lib/giftSend';
import {
  type LiveMessage,
  normalizeUserId,
  sameUserId,
  useLiveGiftsCatalog,
  sendLivePaidGift,
} from '../index';`,
  );
}

// Prefer sendLivePaidGift if still using sendGift
t = t.replace(
  /const \{ result, error: giftErr \} = await sendGift\(\{/g,
  'const paid = await sendLivePaidGift({',
);
t = t.replace(
  /if \(giftErr \|\| !result\) \{\s*const msg = giftSendErrorToast\(giftErr \|\| ''\);/g,
  `const result = paid.result;
        if (!paid.ok || !result) {
          const msg = paid.errorToast || giftSendErrorToast('');`,
);

fs.writeFileSync('src/features/live/spectator/SpectatorLiveScreen.tsx', t);
fs.rmSync('src/features/live/spectator/useLiveSpectatorController.ts', { force: true });
fs.rmSync('src/features/live/spectator/_restore_SpectatorPage.tsx', { force: true });
console.log('SpectatorLiveScreen restored', t.split(/\r?\n/).length);
