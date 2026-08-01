# 01 — Full backup manifest (2026-08-02)

Created: 2026-08-02  
Purpose: full restore point of the production old app after Codemagic iOS CocoaPods fix.  
Status: **Working app was not modified to create this backup** (tag + folder copy only).

## Reference commit

| Field | Value |
|-------|-------|
| Commit | `249b19af461a9dfb707974ef362b2eea541e8382` |
| Short | `249b19a` |
| Date | 2026-08-02 00:16:13 +0100 |
| Subject | Rewrite Codemagic iOS for CocoaPods workspace, drop New-app SPM hacks. |
| Branch | `main` |
| Android version at snapshot | versionName `1.0.442`, versionCode `489` |

## Git tag (remote safety net)

| Field | Value |
|-------|-------|
| Tag | `full-backup-20260802` |
| Type | annotated |
| Points at | `249b19a` |
| Remote | pushed to `origin` (`refs/tags/full-backup-20260802`) |

Restore from tag:

```
git fetch origin tag full-backup-20260802
git checkout full-backup-20260802
```

## Folder backup

| Field | Value |
|-------|-------|
| Path | `C:\Users\Absm Construction\Desktop\Elix-Star-Live-BACKUP-20260802` |
| Files | 1,660 |
| Size | 177.4 MB |
| Dirs | 383 |
| Failures | 0 |
| Git history | included (`HEAD` = `249b19a`) |

Verified present: `src/App.tsx`, `server/index.ts`, `package.json`, `android/app/build.gradle`, `ios/App/Podfile`, `codemagic.yaml`, `.git/HEAD`.

## Exclusions (intentional)

Generated / reproducible:

- `node_modules/`
- `dist/`
- `build/` / `android/app/build/` / `android/build/`
- `.gradle/`
- `Pods/`
- `_aab_peek/`
- `.git-rewrite/`
- `.turbo/` / `coverage/`

Secret dumps (never copied):

- `_audit/coolify_ENV_KEYS.txt`
- `_audit/coolify_FIREBASE_SERVICE_ACCOUNT_BASE64.txt`
- `_audit/coolify_GOOGLE_SERVICE_ACCOUNT_BASE64.txt`
- `_audit/firebase_base64_ONE_LINE.txt`

> Note: Android release keystore / `android/gradle.properties` signing passwords remain in the live working folder only if present locally — treat as secrets; re-point signing after restore if needed.

## Recovery

1. **Remote tag** — full history from GitHub.  
2. **Local folder** — `Elix-Star-Live-BACKUP-20260802` including `.git`, offline restore.

Prior backup (unchanged): `Elix-Star-Live-BACKUP-20260724` / tag `pre-clean-rebuild-reference-20260724`.
