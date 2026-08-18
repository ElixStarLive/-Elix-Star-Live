# One named change. Nothing around it.

The owner **will** ask to touch something. That is allowed.

What is forbidden:

1. **Patch around** the asked change (hide a row, second chat height, steal a socket, extra CSS kill, “protect layout”).
2. **Break the rest of that page** — nearby controls, layout, other rows on the same screen.
3. **Spill into 3–4 other pages** that were not named (host + spectator + CSS theme + another live screen, etc.).

Do the one asked thing, in place, on the files that already own it. Stop.

Default if nothing is named: **stop**. Do not “improve”, match another screen, restore from git, or debug by editing nearby files.

## Never git restore

Do not run `git restore` or `git checkout <commit> -- <files>` unless the owner types **restore** in that message. Fix in place only.

## Locked screens (do not edit)

| Area | Files |
|------|--------|
| Gift overlay / size / framing | `src/components/GiftOverlay.tsx`, `GiftAnimationOverlay.tsx`, `LiveGiftFeedStack.tsx` |
| Inbox | `src/pages/Inbox.tsx` |
| Chat thread | `src/pages/ChatThread.tsx` |
| Video call + incoming call | `src/pages/VideoCall.tsx`, `src/components/IncomingCallModal.tsx` |
| Create camera | `src/components/ElixCameraLayout.tsx`, `src/pages/Create.tsx`, `src/components/CaptureShutterButton.tsx` + Create-only CSS in `src/index.css` |
| Comments sheet | `src/components/EnhancedCommentsModal.tsx` |

Creator live and spectator live must keep the **same** gift overlay components and the **same** size-affecting props. Do not fork a second gift video overlay.

## UI freeze

Do not change layout, spacing, color, type, icons, wrappers, or visual hierarchy unless the owner asks for that visual change in the same message.

## Server / infra (no edit without explicit permission)

`.env`, Docker, Coolify, LiveKit secrets, Bunny, Neon, production route handlers, SQL migrations, deploy scripts.

Approved stack only: Hetzner, Coolify, Bunny, LiveKit, Neon.  
Do not introduce Supabase, Appwrite, Railway, Netlify, Ghost, DigitalOcean, Firebase.

## Payments (do not mix)

- In-app coins → platform IAP only (Google / Apple). Never Stripe for in-app coins.
- Shop / web checkout → Stripe only.
- Test coins → battle score + gift animation QA only. Not money. Not IAP. Not Stripe. Not payout. Not real wallet.

## Live / battle layout (already approved — do not reopen)

- Setup (Add creator, VS 5:00, Invite / Start game): chat under cameras. No empty placeholder rings. No reserved 56px hole.
- Battle join circles = header top 3 circle. 3 host left, 3 opponent right. SPEED centered in that row when the challenge is on — not next to the VS timer.
- Do not dump unknown joiners onto the host.
- Do not put coin+0 pills back on battle video tiles.
- Do not change chat height to fit circles.
- Profile + Join stay one group. Do not split them.

## No patches

No `history.back()` instead of named exits. No fake success. No client shim that hides a wrong server contract. No “quick fix now, clean later”.
