# 00 — Backup Manifest (reference snapshot)

Created: 2026-07-24
Purpose: durable restore point of the **working production app** taken before any clean-rebuild mapping work.
Status: **Old app remains the production reference and fallback. Nothing was deleted or modified.**

## Reference commit

| Field | Value |
|-------|-------|
| Commit | `013c722e74c3b75395cbe1af35b18eef3eede8f5` |
| Short | `013c722` |
| Date | 2026-07-24 18:23:13 +0100 |
| Subject | Match spectator gift video resolve to creator GiftOverlay path. |
| Branch | `main` |
| Android version at snapshot | versionName `1.0.441`, versionCode `488` |

## Git tag (remote safety net)

| Field | Value |
|-------|-------|
| Tag | `pre-clean-rebuild-reference-20260724` |
| Type | annotated |
| Points at | `013c722` |
| Local | present |
| Remote | pushed to `origin` (`refs/tags/pre-clean-rebuild-reference-20260724`) |

Restore from tag:

```
git checkout pre-clean-rebuild-reference-20260724
```

## Folder backup

| Field | Value |
|-------|-------|
| Path | `C:\Users\Absm Construction\Desktop\Elix-Star-Live-BACKUP-20260724` |
| Files | 15,345 |
| Size | 278.8 MB |
| Dirs | 2,451 copied |
| Failures | 0 |
| Git history | included and verified (`HEAD` = `013c722`, tag present) |

Verified present in backup: `src/App.tsx`, `src/pages/LiveStream.tsx`, `src/pages/SpectatorPage.tsx`, `src/components/GiftOverlay.tsx`, `server/index.ts`, `server/routes/index.ts`, `android/app/build.gradle`, `package.json`, `.git/HEAD`, `_audit/CONNECTION_AUDIT.md`.

## Exclusions (intentional)

Generated / reproducible:

- `node_modules/` (all levels)
- `dist/`
- `android/app/build/`
- `android/build/`
- `android/.gradle/`
- `_aab_peek/`
- `.git-rewrite/`

Secret dumps (never copied, never committed):

- `_audit/coolify_ENV_KEYS.txt`
- `_audit/coolify_FIREBASE_SERVICE_ACCOUNT_BASE64.txt`
- `_audit/coolify_GOOGLE_SERVICE_ACCOUNT_BASE64.txt`
- `_audit/firebase_base64_ONE_LINE.txt`

Exclusion of secrets was verified after the copy (all four absent from the backup folder).

> Note: `android/gradle.properties` (signing passwords) and the release keystore remain **only** in the live working folder, as before. They were not added to git and are not part of this document.

## What this snapshot protects

Recovery is possible from either source independently:

1. **Remote tag** — full source history from GitHub, no local dependency.
2. **Local folder** — complete working tree including untracked local files and `.git`, no network dependency.

## Guarantees at time of backup

- No product source file was modified to create this backup.
- No UI, layout, navigation, API, WebSocket, database or deployment change was made.
- No files were deleted from the working project.
- No database migration was run.
- No deployment was triggered.
