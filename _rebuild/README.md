# `_rebuild/` — clean rebuild assessment

Documentation only. **No file in this folder changes the app.** No product source was modified to produce any of it.

Reference commit `013c722`, backup tag `pre-clean-rebuild-reference-20260724`.

| File | Contents |
|------|----------|
| [`00_BACKUP_MANIFEST.md`](00_BACKUP_MANIFEST.md) | Backup tag + folder copy, verified restorable |
| [`01_SCREENS_ROUTES.md`](01_SCREENS_ROUTES.md) | 77 routes, navigation, chrome rules, app lifecycle |
| [`02_COMPONENTS.md`](02_COMPONENTS.md) | 56 components with usage counts, 7 stores, 59 lib modules |
| [`02_FEATURE_PARITY_SPEC.md`](02_FEATURE_PARITY_SPEC.md) | **The contract.** Every feature: behaviour, deps, edge cases, acceptance criteria |
| [`03_APIS.md`](03_APIS.md) | 212 endpoints, 23 routers, mount-order constraints |
| [`04_WEBSOCKET.md`](04_WEBSOCKET.md) | 36 inbound / 45 outbound events, presence socket, gift delivery paths |
| [`05_DATABASE.md`](05_DATABASE.md) | 91 tables, 43 migrations, caching, integrity guarantees |
| [`06_NATIVE_ENV_SERVICES.md`](06_NATIVE_ENV_SERVICES.md) | Capacitor, Android/iOS identity, env vars, 12 external services |
| [`07_FEATURE_TRACES.md`](07_FEATURE_TRACES.md) | End-to-end traces: auth, gifts, IAP, live, upload, chat, push, feed, calls |
| [`08_LEGACY_CLASSIFICATION.md`](08_LEGACY_CLASSIFICATION.md) | KEEP / REIMPLEMENT / REMOVE / REVIEW + recommendation |
| [`09_FINAL_REPORT.md`](09_FINAL_REPORT.md) | **Start here.** Totals, findings, release decision, approval gate |

## Status

Phases 0–3 complete. Phase 4 not started — blocked on owner approval by design.

Release decision: **NEW CODEBASE NOT READY TO REPLACE OLD APPLICATION** (no new codebase exists).
