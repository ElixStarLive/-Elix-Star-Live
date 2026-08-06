# Dead-code removal ledger

Labels used only: **VERIFIED** | **FAILED** | **BLOCKED_EXTERNAL** | **NOT_TESTED**

Only removals proven via static analysis (ESLint `no-unused-vars`, cross-file grep, TypeScript build) and behaviour-preserving are recorded here. No wholesale sweep was performed — that would violate `minimal-diff`, `respect-existing-code-patterns`, `ask-before-risky` and `no-ui-change` rules.

## Removals — session 2026-08-06

| # | File | Symbol | Type | Evidence it was dead | Replacement | Post-check |
|---|------|--------|------|----------------------|-------------|------------|
| 1 | `src/pages/SearchPage.tsx` | `request` (import from `../lib/apiClient`) | Unused import | Grep across file: only occurrence was the import line itself. ESLint `no-unused-vars` flagged. | None — API calls in the page use `apiFetchProfiles` and other feature APIs. | **VERIFIED** — `tsc -b` exit 0, ESLint file-scoped exit 0. |
| 2 | `src/pages/Upload.tsx` | `ORIGINAL_SOUND_TRACK` (named import from `../lib/soundLibrary`) | Unused named import | Grep across file: only occurrence was the import line. `ORIGINAL_SOUND_TRACK` remains defined in `src/lib/soundLibrary.ts` and used by `src/components/SoundPickerPanel.tsx`. | None — Upload page never referenced the constant. | **VERIFIED** — `tsc -b` exit 0, ESLint file-scoped exit 0. |
| 3 | `src/pages/Inbox.tsx` | `openUserProfile` (local `useCallback`) | Unused local callback | Grep across file: only definition, no reference. `openUserOrLive` (the actually-used callback) is retained and unchanged. | None — no caller to migrate. | **VERIFIED** — `tsc -b` exit 0, ESLint file-scoped exit 0. |

Rendered output on all three pages is unchanged (no JSX or style edits).

## Candidates NOT removed this session — reason

- 700+ remaining ESLint warnings (`no-explicit-any`, `no-non-null-assertion`, `react-hooks/exhaustive-deps`, etc.) require code-shape decisions and could mask behaviour bugs. Owner sign-off required before batch sweep.
- Untracked evidence JSON in `docs/evidence/*` — retained as monetisation proof.
- Historical `server/scripts/*.ts` — retained as ops tooling.
- `_live_rebuild_ref/` — outside repository (parent Desktop folder). Not touched.
- No package removed from `package.json` this session — every listed dependency still has a proven runtime, native (Capacitor), or build import; `npm audit --omit=dev` reports 0 critical, 2 high in `react-router@7.18.1` (RSC advisory **NOT_APPLICABLE** to this Vite SPA).

## Rule compliance

- Focused commit, single concern (dead-code removal only).
- No UI, layout, spacing, style, icon, colour or navigation change.
- No infrastructure (Coolify / Neon / LiveKit / Bunny / Stripe) file touched.
- Create-camera locked files untouched.
