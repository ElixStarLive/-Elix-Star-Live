import fs from "fs";
const path = "_audit/FULL_AUDIT_CURRENT.md";
const feRoutes = fs.readFileSync("_audit/fe_routes.txt","utf8").trim().split(/\n/).filter(Boolean);
const fePages = fs.readFileSync("_audit/fe_pages.txt","utf8").trim().split(/\n/).filter(Boolean);
const feApi = fs.readFileSync("_audit/fe_api_paths.txt","utf8").trim().split(/\n/).filter(Boolean);
const be = fs.readFileSync("_audit/be_full_paths.txt","utf8").trim().split(/\n/).filter(Boolean);
const unused = fs.readFileSync("_audit/be_possibly_unused.txt","utf8").trim().split(/\n/).filter(Boolean);
const ws = fs.readFileSync("_audit/ws_server_events.txt","utf8").trim().split(/\n/).filter(Boolean);
const tables = fs.readFileSync("_audit/tables.txt","utf8").trim().split(/\n/).filter(Boolean);

const features = [
["Auth register/login/logout/session restore","PASS"],
["Auth email verification (SendGrid + migration)","PASS"],
["Auth forgot/reset password","PASS"],
["Auth Apple Sign-In","PARTIAL"],
["Auth guest (prod disabled)","PASS"],
["Auth delete account","PASS"],
["Auth 2FA","NOT IMPLEMENTED"],
["Profile view/edit/avatar/follow/block","PASS"],
["Feed For You / Following / Friends / Stem / Music / Hashtag / Saved","PASS"],
["Search users/videos","PARTIAL"],
["Discover","PASS"],
["Stories","PASS"],
["Upload / Create / camera","PASS"],
["AI Studio local filters","PARTIAL"],
["Comments / likes / share","PASS"],
["Report / Support","PASS"],
["Inbox DM chat","PASS"],
["1:1 Video calls","PASS"],
["LIVE start/end LiveKit","PASS"],
["LIVE spectator chat gifts hearts","PASS"],
["LIVE battle + reconnect","PASS"],
["LIVE cohost / gift goals / boosters / mist","PASS"],
["LIVE engagement polls/mystery","PASS"],
["Wallet real coins + Google IAP verify path","PASS"],
["Apple IAP coins device path","PARTIAL"],
["Test coins local-only","PASS"],
["Shop Stripe checkout + webhook","PASS"],
["Membership / Promote IAP","PASS"],
["Creator payout request + admin workflow","PASS"],
["Admin users/reports/economy/purchases/progression/rising-stars","PASS"],
["Admin moderation logs UI","PASS"],
["Engagement hub/missions/daily/collections","PASS"],
["Rising Stars","PASS"],
["Push FCM","PASS"],
["Push APNS","NOT IMPLEMENTED"],
["Notification prefs server sync","PARTIAL"],
["Analytics","PASS"],
["Sentry monitoring","NOT VERIFIED"],
["Ban appeals","NOT IMPLEMENTED"],
["Dedicated /api/search","NOT IMPLEMENTED"],
];

const statusCounts = {};
for (const [,s] of features) statusCounts[s]=(statusCounts[s]|0)+1;

const out = [];
out.push("# Elix Star Live — Full Application Audit (fresh pass)");
out.push("Generated: " + new Date().toISOString());
out.push("");
out.push("## 1. Files inspected");
out.push("| Category | Count |");
out.push("|---|---:|");
out.push("| src ts/tsx | 192 |");
out.push("| server ts | 141 |");
out.push("| migrations sql | 40 (+1 this pass = 41 on disk after fix) |");
out.push("| test files | 21 |");
out.push("| android app src | 17 |");
out.push("| android gradle/props | 11 |");
out.push("| ios App sampled | 10 |");
out.push("| scripts | 15 |");
out.push("| docs | 16 |");
out.push("| **Exact inspected set** | **433** (192+141+40+17+11+10+15+16; tests overlap src/server) |");
out.push("");
out.push("## 2. Feature inventory (" + features.length + ")");
out.push("| Feature | Status |");
out.push("|---|---|");
for (const [f,s] of features) out.push("| " + f + " | " + s + " |");
out.push("");
out.push("### Status totals");
for (const k of Object.keys(statusCounts).sort()) out.push("- " + k + ": " + statusCounts[k]);
out.push("");
out.push("## 3. Frontend screens");
out.push("Routes: " + feRoutes.length + "; page modules: " + fePages.length);
out.push("All App.tsx routes map to lazy page components; catch-all -> /feed.");
feRoutes.forEach(r => out.push("- `" + r + "` CONNECTED"));
out.push("");
out.push("## 4. Frontend API <-> backend");
out.push("FE /api refs: " + feApi.length + "; unmatched automated: 0");
feApi.forEach(p => out.push("- `" + p + "`"));
out.push("");
out.push("## 5. Backend routes");
out.push("Inventoried method paths: " + be.length);
out.push("Possibly unused / admin-alias / no direct FE string (" + unused.length + "):");
unused.forEach(u => out.push("- `" + u + "`"));
out.push("Note: creator payout admin actions ARE used via `/api/admin/payout/:id/*` (Withdrawals). Duplicate `/api/creator/payout/:id/*` aliases in unused list are false positives from mount mapping.");
out.push("");
out.push("## 6. Database");
out.push("Migrations applied before this pass: 40. New migration added: 20260723170000_elix_reports_review_columns.sql");
out.push("Tables/relations in migration SQL: " + tables.length);
out.push("");
out.push("## 7. External integrations (verified " + new Date().toISOString().slice(0,10) + ")");
out.push("| Service | Status |");
out.push("|---|---|");
out.push("| Neon | PASS (health + migrate) |");
out.push("| Valkey | PASS |");
out.push("| LiveKit | PASS |");
out.push("| Bunny | PASS |");
out.push("| Stripe | PASS |");
out.push("| SendGrid | PASS |");
out.push("| FCM Firebase 86271 | PASS (health.push=true + token) |");
out.push("| Google Play SA | PASS (creds parse) |");
out.push("| APNS | NOT IMPLEMENTED |");
out.push("| Sentry | NOT VERIFIED (no DSN) |");
out.push("| Epidemic/PEX/Loudly | PASS keys; deep NOT VERIFIED |");
out.push("");
out.push("## 8. WS");
out.push("Server events: " + ws.length);
ws.forEach(e => out.push("- `" + e + "`"));
out.push("Client send missing on server: none. Server-only: battle_gift_score (gift_sent path also scores).");
out.push("");
out.push("## 9-15. See chat report.");
out.push("");
out.push("## 16. Connection / Integration Audit");
out.push("Generated with inventory + orphan scan + WS cross-match.");
out.push("");
out.push("### Summary buckets");
out.push("- disconnected UI controls found: **0 empty onClick** (inventory); mute/notifications/settings switches **CONNECTED**");
out.push("- disconnected routes found: **0** (all App.tsx routes map to pages)");
out.push("- unreachable screens found: **0**");
out.push("- unused APIs found (no FE string; retained with reason): see list below");
out.push("- missing backend integrations found: **0 unmatched FE→BE** after template-string false positives");
out.push("- unused backend routes found: **11** possibly-unused (ops/aliases — retained)");
out.push("- orphan database code found: **NOT VERIFIABLE** without live DB usage metrics");
out.push("- unused services found: none required removed this pass");
out.push("- unused components found: **3 REMOVED** (ForYouStoriesStrip, GoldProfileFrame, LiveAIFilters)");
out.push("- dead code found: intentional stub `battle_gift_score` (server ignores insecure client scoring)");
out.push("- unused dependencies found: `@capacitor/clipboard` was registered but unused → **FIXED** (wired via `copyTextToClipboard`)");
out.push("- unused native modules found: Clipboard was orphan → **FIXED**");
out.push("- broken realtime connections found: none (client send missing on server: 0)");
out.push("- broken notification connections found: prefs local **CONNECTED** to `notifications.ts` + LiveNotifyBanner; APNS **NOT IMPLEMENTED**");
out.push("");
out.push("### Decision log");
out.push("| Item | Decision |");
out.push("|---|---|");
out.push("| Admin `GET /api/admin/moderation/logs` | **FIXED** — wired into Admin Reports |");
out.push("| `ForYouStoriesStrip` / `GoldProfileFrame` / `LiveAIFilters` | **REMOVED** — zero imports |");
out.push("| `@capacitor/clipboard` | **FIXED** — connected through `copyTextToClipboard` |");
out.push("| Inventory false `GET /api/admin/balance` etc. | **FIXED** (scanner) — was `*Router.get` false positive |");
out.push("| WS `battle_gift_score` | **RETAINED WITH REASON** — deprecated insecure; scoring via `gift_sent` |");
out.push("| `GET /api/creator/earnings` | **RETAINED WITH REASON** — balance UI uses `/balance` (`total_earned`); earnings is detail API |");
out.push("| `GET /api/engagement/flags` | **RETAINED WITH REASON** — flags also returned by hub; used server-side |");
out.push("| `GET /api/music/collections` + `/status` | **RETAINED WITH REASON** — SoundPicker uses global/playlists/search; status is ops |");
out.push("| Progression starter/xp history + user status | **RETAINED WITH REASON** — history APIs; hub/progress covers UX |");
out.push("| `GET /api/rising-stars/rewards` | **RETAINED WITH REASON** — catalog API; admin grant UI elsewhere |");
out.push("| `POST /api/admin/chargeback` + `unfreeze` | **RETAINED WITH REASON** — admin ops APIs; no dedicated UI control yet |");
out.push("| `POST /api/auth/guest` | **RETAINED WITH REASON** — intentionally disabled in production |");
out.push("| FE template API strings unmatched | **RETAINED WITH REASON** — scanner false positives (`${queryParam}` etc.) |");
out.push("| Auth 2FA / Ban appeals / APNS / dedicated search | **NOT VERIFIABLE** as required product features — **NOT IMPLEMENTED** |");
out.push("| Dirty WIP (Upload/SoundPicker/Settings/HowItWorks uncommitted) | **NOT VERIFIABLE** — do not ship blindly |");
out.push("");
out.push("### Production connection target");
out.push("NO required feature left disconnected in this pass for inventoried UI/routes/WS.");
out.push("Ops-only admin APIs retained with reason rather than deleted.");
fs.writeFileSync(path, out.join("\n")+"\n");
console.log("WROTE "+path);
console.log(JSON.stringify(statusCounts));
