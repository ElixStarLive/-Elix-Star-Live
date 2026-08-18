# Release audit — UI/layout lock inventory

Baseline SHA: `0eea163fcb7f8d38a39f84ef4a850907bd30d116` (branch `main`).

This is the protected inventory for the full production release audit. No visual change
is authorised in that audit. Files listed here may be edited **only** for logic, typing,
imports, wiring, or dead-code removal, and only when the rendered layout is byte-identical
in result. If a correctness fix cannot be made without a visible change, it stops and the
owner is asked first.

Every entry names the file that actually renders or styles the element, so "do not change"
is checkable rather than a slogan.

## Live screens

| Protected element | Owning file(s) |
| --- | --- |
| Live host screen | `src/features/live/host/LiveHostScreen.tsx` |
| Spectator live screen | `src/features/live/spectator/SpectatorLiveScreen.tsx` |
| Inline live card (For You) | `src/features/live/inline/InlineLiveViewer.tsx` |
| Live room background / glass | `src/index.css` — `.elix-live-room`, `.elix-page-glass`, `.app-live-column` |

## Co-host stage

| Protected element | Owning file(s) |
| --- | --- |
| Co-host layout, host big pane, 8 seats | `LiveHostScreen.tsx`, `SpectatorLiveScreen.tsx` |
| Seat geometry constants | `src/features/live/cohost/cohostStageGeometry.ts` |
| Transparent/glass square seats, silver seat frame | `src/index.css` — `.elix-cohost-pill`, `.elix-cohost-cut-corner`, `.elix-cohost-layout-thumb`, `.elix-cohost-layout-thumb-host` |
| Speaking pulse | `src/index.css` — `.elix-speaking-pulse`, `.elix-cohost-pill.elix-speaking-pulse`; `src/features/live/cohost/liveFeaturedSpeaking.ts` |
| Featured / big-screen swap controls | `LiveHostScreen.tsx`, `SpectatorLiveScreen.tsx`, `src/features/live/cohost/useLiveCohostFeaturedControls.ts` |

## Battle

| Protected element | Owning file(s) |
| --- | --- |
| Battle layouts and slots | `LiveHostScreen.tsx`, `SpectatorLiveScreen.tsx`, `src/index.css` — `.elix-battle-slot` |
| Red touch ring | `LiveHostScreen.tsx`, `SpectatorLiveScreen.tsx` |
| Battle score tiles | `src/features/live/battle/BattleCreatorTileScore.tsx` |
| Battle VFX / taunt overlays | `src/components/BattleVfxOverlays.tsx`, `src/components/BattleTauntOverlays.tsx` |
| MVP circles | `src/components/LiveMarkedTopUi.tsx`, `src/components/ChatOverlay.tsx` |

## Profile capsule, Follow and Join

Covered by an existing standing lock (`lock-live-follow-on-join-never-touch`).

| Protected element | Owning file(s) |
| --- | --- |
| Live user capsule (oval) | `src/components/LiveMarkedTopUi.tsx` — `LiveHostProfileHeader` |
| Capsule CSS | `src/index.css` — `#root .elix-live-host-oval`, `.elix-live-name-text`, `[data-elix-profile-name]` |
| Follow box | `src/index.css` — `#root button[data-elix-follow='true']`, `.elix-live-follow-join-lock` |
| Join capsule | `src/index.css` — `#root button.elix-live-join-capsule`, `button[data-elix-join='true']`, `.elix-join-heart` |

## Gift UI

Covered by existing standing locks (`lock-gift-overlay-never-touch`,
`lock-top-red-gift-banner-never-touch`, `lock-chat-gift-capsule-never-touch`).

| Protected element | Owning file(s) |
| --- | --- |
| Gift video overlay + framing | `src/components/GiftOverlay.tsx` |
| Top red global gift banner | `src/components/GiftAnimationOverlay.tsx` |
| Above-chat gift capsule | `src/components/LiveGiftFeedStack.tsx` |
| Gift panel | `src/components/GiftPanel.tsx` |
| Gift goal gallery | `src/components/GiftGoalGallery.tsx` |

## Chat and controls

| Protected element | Owning file(s) |
| --- | --- |
| Live chat overlay | `src/components/ChatOverlay.tsx` |
| Top controls (live) | `src/components/LiveMarkedTopUi.tsx` |
| Top nav | `src/components/TopNav.tsx` |
| Bottom nav | `src/components/BottomNav.tsx` |
| Bottom live controls | `LiveHostScreen.tsx`, `SpectatorLiveScreen.tsx` |
| Side mission stack | `src/components/LiveSideMissionStack.tsx` |
| Engagement drawer | `src/components/engagement/EngagementDrawer.tsx` |

## Global visual system

| Protected element | Owning file(s) |
| --- | --- |
| Backgrounds, panels, surfaces | `src/index.css` — `.elix-page-glass`, `.elix-surface`, `.elix-panel`, `.elix-glass`, `.elix-full-page-panel` |
| Writing system (silver/red) | `src/index.css` — `.elix-silver-red-text`, `#root` text colour remaps |
| Icon sizing rules | `src/index.css` — `#root button:has(> svg:only-child)`, `svg.lucide` rules |
| Safe areas | `src/index.css` (9 `safe-area-inset` rules) plus per-component insets in `GiftAnimationOverlay.tsx`, `LiveMarkedTopUi.tsx`, `ElixCameraLayout.tsx`, `VideoViewChromeShell.tsx`, `LiveSideMissionStack.tsx`, `Create.tsx`, `Upload.tsx`, `VideoView.tsx`, `MediaEditorPanel.tsx`, `SoundPickerPanel.tsx`, `SoundMixPanel.tsx`, `EngagementDrawer.tsx` |
| Avatar rings / profile frames | `src/components/AvatarRing.tsx`, `src/lib/profileFrame.ts`, `src/index.css` — `.elix-profile-ring`, `.elix-story-live-ring` |

## Additional files under pre-existing owner locks

Do not edit for any reason in this audit without an explicit new owner order:

- `src/pages/VideoCall.tsx`, `src/components/IncomingCallModal.tsx`
- `src/pages/Inbox.tsx`
- `src/pages/ChatThread.tsx`
- `src/components/EnhancedCommentsModal.tsx`
- `src/components/ElixCameraLayout.tsx`, `src/pages/Create.tsx`, `src/components/CaptureShutterButton.tsx`
  and their Create-camera CSS (`.camera-rail-disc`, `.camera-right-rail`, `.capture-shutter-ring`, `.elix-silver-red-text`)

## Verification rule

A change to any file above is acceptable in this audit only if it is one of:
logic, typing, import, wiring, error handling, dead-code removal, or test change,
**and** the rendered DOM/CSS result is unchanged. Anything that alters layout, spacing,
sizing, colour, typography, iconography, z-index, or visual hierarchy is out of scope.
