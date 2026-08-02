import fs from 'fs';

const path = 'src/features/live/spectator/SpectatorLiveScreen.tsx';
let t = fs.readFileSync(path, 'utf8');
// strip BOM
if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);

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

// Replace raw Room construction with LiveRoomLifecycle (new owner path)
if (!t.includes("from '../../../lib/live'") && !t.includes('from "../index"') && !t.includes("from '../index'")) {
  t = t.replace(
    "import { Room, RoomEvent, LocalVideoTrack, LocalAudioTrack, ConnectionState } from 'livekit-client';",
    `import type { Room } from 'livekit-client';
import { RoomEvent, ConnectionState } from 'livekit-client';
import { apiLiveStreams, apiLiveToken, LiveRoomLifecycle } from '../../../lib/live';
import { giftSendErrorToast } from '../../../lib/giftSend';
import { sendLivePaidGift, useLiveGiftsCatalog } from '../index';`,
  );
}

// If old sendGift import remains, swap
t = t.replace(
  /import \{[^}]*sendGift[^}]*\} from '\\.\\./g,
  (m) => m,
);

fs.writeFileSync(path, t);
console.log('fixed paths', {
  lines: t.split(/\r?\n/).length,
  lifecycle: t.includes('LiveRoomLifecycle'),
  newRoom: (t.match(/new Room/g) || []).length,
});
