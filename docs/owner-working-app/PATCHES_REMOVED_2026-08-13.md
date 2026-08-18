# Patches / workarounds — 2026-08-13

Owner order: remove patches, workarounds, leftovers. Do not `git restore`.
This file is the record in the app folder. It is not a legal filing.

## Honest status

The last 4 hours on `main` was **mostly patched work**. That is not confirmed clean.

This pass **does not** rewind named asks (Invite spinner, host/opponent join sides, coin+0 removal, tile gift icons, Weekly Ranking banner, profile+Join 2mm, verified tick, fundal millimetre moves the owner named at the time). Undoing those would put leftovers back.

## Workarounds that were in the app (strip / chat / circles)

| Workaround | What it did | Status |
|------------|-------------|--------|
| `LIVE_BATTLE_CHAT_HEIGHT` minus `56px` | Reserved a hole under cameras “for circles” | **Removed.** Chat formula is the pre-strip height (no `56px`, no leftover `4mm`). |
| `LIVE_BATTLE_CHAT_HEIGHT_SETUP` | Second chat height so setup had no strip | Already deleted earlier. Must not return. |
| Hide MVP until `IN_BATTLE` | Hid bottom circles on Add creator | Already deleted earlier. Must not return. |
| `.elix-battle-mvp-row` `min-height: 56px` + fundal | Fake panel between cameras and chat | CSS already deleted. Must not return. |
| Names + points + empty rings on battle MVP | Different from header top 3 | Battle join circles use the same overlapping 28px `AvatarRing` as the header. No names, no points, no empty rings. |
| `__mvp-empty-*` id filters | Leftover from padded placeholder slots | **Removed.** Lists are joiners only. |
| Unfinished `.clean-border { border-0 }` | Leftover from an interrupted white-line pass | **Reverted** to `border-white/10`. |

## Must never be done again

- Do not change chat height to “make room” for circles.
- Do not hide a row to protect layout.
- Do not invent a second chat height.
- Do not pad empty placeholder rings.
- Do not put names/points on battle join circles unless the owner names that.
- Do not `git restore`.
- Do not patch around a named change. Do the named thing only.

## Circle contract (the named ask)

Header top 3 and battle join circles are the **same circle**:

- Appear when a person has joined. One joiner = one circle. Max 3 per side.
- Overlap `marginLeft: -1.5mm`. Size `LIVE_MVP_PROFILE_RING_PX` (28).
- Gold ring + MVP pill only if #1 gifted.
- Battle: 3 host-side on the host camera, 3 opponent-side on the opponent camera.
- SPEED stays with that row when the challenge is on — not next to VS.
- Not inside chat. Chat is not a circle panel.
