# How the working app is specified to work

Grounded in owner rules and current code. If a screen is locked, this describes **behavior**, not permission to restyle it.

## Product

Mobile live app (React + Capacitor). Real backend: Hetzner / Coolify, Neon, Bunny, LiveKit.

## Live (solo)

- Host and spectator share the same gift overlay, red banner, and gift feed stack.
- Header: avatar + name + likes + Join (one group), then ranking / gift-goal / explore capsules.
- Top 3 MVP circles (header, next to viewer count): **1 joined viewer = 1 circle, max 3**. No empty placeholder rings. Gold ring when they gifted.
- Join = daily membership heart after follow rules. Not battle score. Not paid coins.
- Live like tap = +1 like, unlimited, £0, no battle score.
- Chat, gifts, Mission, bottom actions (Co-Host / Battle / Poll / Share / More) stay as built.

## Battle

- Host taps Battle → setup: two tiles (host camera + Add creator), VS 5:00, Invite / Start game.
- Invite opens **Creators**. List is live creators from the **live-room** WebSocket roster (`battle_invite_roster_get` → `battle_invite_roster`). Spinner must clear when the roster event arrives. Empty list = “No other creators live”, not an endless spinner.
- Invite a live creator → they get Join / Reject. Accept seats them. Host taps Start game to fight.
- Battle join circles: **same circle as the header top 3**. Left 3 = host side, right 3 = opponent side. Side from `audienceCreatorId` / gifts. Never default unknown joiners onto host. Seated creators are not in the circles.
- Do **not** reserve chat height for circles. Do not hide circles until Start game. Do not pad empty rings.
- Battle screen tap = +5 battle points once per unique viewer per battle, £0.
- Test-coin gift = animation + battle score, £0 money.
- Real paid-coin gift = animation + battle score + eligible creator revenue.

## Gifts (locked visuals)

Solo framing in `GiftOverlay` is approved (full-width `object-cover`, chat-anchored height). Battle uses the same frame. Red banner is full column width, Weekly Ranking top row (not battle-stage bottom).

## Inbox / chat / call (locked)

- Inbox hub X → For You (`/feed`).
- Anything opened **from** Inbox (or Alerts via Inbox) closes back to `/inbox` via `returnTo: '/inbox'`. Named exit only. No `history.back()`.
- Chat thread and video call: do not edit unless the owner names that screen and the change.

## Money

- Mobile coin buy = IAP only.
- Shop = Stripe only.
- Test coins never mix with real coins or payout.

## Navigation

Do not rename routes, tab order, or stack order unless asked.
