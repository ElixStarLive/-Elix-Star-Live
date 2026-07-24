# 06 — Native, Environment and External Services

Sources: [`capacitor.config.ts`](../capacitor.config.ts), [`android/app/build.gradle`](../android/app/build.gradle), `ios/App/`, [`server/lib/envValidate.ts`](../server/lib/envValidate.ts), `package.json` at commit `013c722`.

## Application identity — LOCKED

Changing either identity breaks store continuity, existing installs, IAP entitlements and deep links.

| Platform | Field | Value |
|----------|-------|-------|
| Capacitor | `appId` | `com.elixstarlive.app` |
| Capacitor | `appName` | `Elix Star Live` |
| Capacitor | `webDir` | `dist` |
| Android | `namespace` / `applicationId` | `com.elixstarlive.app` |
| Android | `versionCode` / `versionName` | `488` / `1.0.441` at snapshot |
| Deep link scheme | iOS + Android | `elixstar` |
| Web hosts | | `www.elixstarlive.co.uk`, `elixstarlive.co.uk` |

## Capacitor plugin configuration

From `capacitor.config.ts`:

| Plugin | Config | Note |
|--------|--------|------|
| `CapacitorHttp` | `enabled: true` | native HTTP so phone login reaches the real API, bypassing WebView CORS/CORP |
| `SplashScreen` | duration 0, autoHide, `#000000`, no spinner | |
| `PushNotifications` | badge, sound, alert | |
| `Keyboard` | `resize: 'native'`, `resizeOnFullScreen: true` | affects live chat input layout |
| `App` | deep linking, scheme `elixstar` | |

**`server.androidScheme: 'http'` with no `hostname` set.** The source carries an explicit warning: setting `hostname` to `www.elixstarlive.co.uk` makes Capacitor intercept that host so login `/api` calls never reach the real backend. This is a hard-won constraint — carry the comment forward with the config.

Android also sets `allowMixedContent: false`; iOS sets `contentInset: 'automatic'`.

## Installed native plugins

| Package | Used in |
|---------|---------|
| `@capacitor/core`, `/android`, `/ios`, `/cli` | build |
| `@capacitor/app` | `src/lib/deepLinks.ts`, `src/pages/LiveStream.tsx` |
| `@capacitor/preferences` | `src/store/useAuthStore.ts` (session persistence) |
| `@capacitor/push-notifications` | `src/lib/notifications.ts` |
| `@capacitor/share` | `src/lib/platform.ts` |
| `@capgo/capacitor-social-login` | `src/store/useAuthStore.ts` |
| `@capgo/native-purchases` | `src/lib/iap.ts` |
| `@capacitor/clipboard` | **dependency present, no import found** — REVIEW |

## iOS project state

Present: `ios/App/App/Info.plist`, `AppDelegate.swift`, `App.entitlements`, `AppDebug.entitlements`, `PrivacyInfo.xcprivacy`, `Podfile`, assets and launch storyboards.

`PrivacyInfo.xcprivacy` exists — required for App Store submission. Preserve it.

## Server environment variables

### Fatal if missing in production

From `server/lib/envValidate.ts`. The server **exits** rather than booting in a broken state:

| Variable | Guards |
|----------|--------|
| `DATABASE_URL` | Neon |
| `JWT_SECRET` or `AUTH_SECRET` | must be ≥32 chars |
| `VALKEY_URL` or `REDIS_URL` | realtime + cache |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Android IAP verification |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | shop checkout |
| `LIVEKIT_URL` + `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` | live streaming |
| `BUNNY_STORAGE_ZONE` + `BUNNY_STORAGE_API_KEY` | media uploads |

### Fatal if present in production

| Variable | Reason |
|----------|--------|
| `ELIX_SKIP_MIGRATION_CHECK=1` | migration checks are mandatory |
| `ALLOW_LOADTEST_IN_PROD=1` | would enable rate-limit bypass against live traffic |

### Conditionally required

Apple IAP: `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`. Fatal only if `APPLE_BUNDLE_ID` is set or `APPLE_IAP_REQUIRED=1`; otherwise warns that iOS purchases will be rejected.

This fail-closed design is deliberate and correct: users must never be charged while verification is broken. `KEEP BEHAVIOUR`, and port it before any payment code.

## Client environment variables

Read via `import.meta.env` or `window.__ENV` (runtime `env.js`):

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | API base; falls back to `https://www.elixstarlive.co.uk` |
| `VITE_WS_URL` | WebSocket base |
| `VITE_LIVEKIT_URL` | LiveKit client |
| `VITE_BUNNY_CDN_HOSTNAME` | media CDN host |
| `VITE_APP_VERSION` | analytics |
| `VITE_ENABLE_CRASH_REPORTING` | Sentry toggle |
| `VITE_EMAIL_CONFIGURED` | auth UI capability |
| `VITE_APPLE_SIGN_IN_ENABLED` | auth UI capability |
| `VITE_DEEPAR_LICENSE_KEY`, `VITE_BANUBA_CLIENT_TOKEN` | face AR (optional, absent = feature off) |

Feature flags: `VITE_ENGAGEMENT_HUB_ENABLED`, `VITE_DAILY_LOGIN_ENABLED`, `VITE_MISSION_REWARDS_ENABLED`, `VITE_PROMOTIONAL_COINS_ENABLED`, `VITE_PROMO_GIFT_SPEND_ENABLED`, `VITE_BATTLE_ENERGY_ENABLED`, `VITE_TREASURE_HUNT_ENABLED`, `VITE_STICKER_COLLECTION_ENABLED`, `VITE_CREATOR_COLLECTIONS_ENABLED`.

Flag defaults are defined in `src/lib/*` and `server/lib/engagementFlags.ts`. Wallet-affecting engagement features default **off**. Preserve the defaults exactly — flipping one on during a rebuild would change economy behaviour silently.

## External services

| Service | Role | Client | Server |
|---------|------|--------|--------|
| **Neon** | Postgres | — | `server/lib/postgres.ts` |
| **Valkey** | cache, WS pub/sub, rate limit | — | `server/lib/valkey.ts` |
| **Bunny Storage / CDN** | media + gift assets | `src/lib/bunnyStorage.ts`, `giftsCatalog.ts` (`https://elixstorage.b-cdn.net`) | `server/services/bunny.ts` |
| **LiveKit** | live video | `livekit-client` | `server/services/livekit.ts` + webhook |
| **Stripe** | shop / web checkout **only** | — | `server/routes/checkout.ts`, `webhook.ts` |
| **Google Play Billing** | Android coins/membership | `@capgo/native-purchases` | `server/lib/googlePlaySubscriptions.ts` |
| **Apple IAP** | iOS coins/membership | `@capgo/native-purchases` | `server/lib/appleIap.ts` |
| **FCM** | push | `@capacitor/push-notifications` | `server/lib/push.ts` |
| **SendGrid/email** | auth mail | — | `server/lib/email.ts` |
| **Epidemic Sound** | music catalog | — | `server/services/epidemicSound.ts` |
| **Sentry** | crash reporting | `src/lib/crashReporting.ts` | `server/lib/sentryInit.ts` |
| **Coolify / Hetzner** | deploy / host | — | env + Traefik proxy trust |

APNS is **not** configured (FCM only) — recorded in the prior connection audit. iOS push is therefore not fully wired. This is a real gap, not a rebuild target: flag it, do not silently "fix" it.

## Payment separation — LOCKED

| Flow | Mechanism |
|------|-----------|
| In-app coin purchases (Android/iOS) | Platform IAP only |
| Shop / web checkout | Stripe only |
| Test coins | Local only — never IAP, never Stripe, never real balance |

`server/routes/index.ts` gates test-coin endpoints out of production entirely. The three systems must remain separate in any rebuild.
