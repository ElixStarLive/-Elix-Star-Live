# Auth connection map

**Status:** COMPLETE (feature 2) — all client `/api/auth/*` calls owned by `authSession`  
**UI:** Login, Register, AuthCallback, Forgot/Reset password, Settings delete — frozen (no layout/style changes)  
**Server:** unchanged `/api/auth/*` contracts  

## Owners

| Concern | Owner |
| --- | --- |
| Response parse (`user` + `session`) | `src/lib/authApiContract.ts` (`parseAuthLoginRegisterResponse`) |
| Auth HTTP + contract calls | `src/features/auth/authSession.ts` |
| Session UI state | `src/store/useAuthStore.ts` (thin; maps users, persists, enriches profile) |
| Transport | `src/lib/apiClient.ts` |

## `authSession` exports (wired)

| Function | Endpoint | Callers |
| --- | --- | --- |
| `authLoginWithPassword` | `POST /api/auth/login` | `useAuthStore.signInWithPassword` |
| `authRegister` | `POST /api/auth/register` | `useAuthStore.signUpWithPassword` |
| `authVerifyEmail` | `POST /api/auth/verify-email` | `AuthCallback.tsx` |
| `authLogout` | `POST /api/auth/logout` | `useAuthStore.signOut` |
| `authGetMe` | `GET /api/auth/me` | `useAuthStore.checkUser` |
| `authResendConfirmation` | `POST /api/auth/resend-confirmation` | `useAuthStore.resendSignupConfirmation` |
| `authAppleNative` | `POST /api/auth/apple/native` | `useAuthStore.signInWithApple` (native plugin stays in store) |
| `authForgotPassword` | `POST /api/auth/forgot-password` | `ForgotPassword.tsx` |
| `authResetPassword` | `POST /api/auth/reset-password` | `ResetPassword.tsx` |
| `authDeleteAccount` | `POST /api/auth/delete` | `Settings.tsx` (delete handler only) |

## REST contracts (preserved)

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/verify-email`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/resend-confirmation`
- `POST /api/auth/apple/native`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/delete`

## Remaining gaps (honest)

| Item | Status | Notes |
| --- | --- | --- |
| `src/lib/apiClient.ts` | **NOT MOVED** | Internal `/api/auth/me` probes for token refresh / connectivity — not part of feature-2 page/store wiring |
| `POST /api/auth/apple/start` | **UNUSED** | Legacy; server returns “update app”; native path used instead |
| `POST /api/auth/guest` | **NOT IN CLIENT** | Server route exists; no UI wired in this rebuild |
| Profile create on signup | **STORE** | `useAuthStore.signUpWithPassword` still calls `POST /api/profiles` directly (profiles domain, not auth) |
| Profile enrich | **STORE** | `enrichUserWithProfile` uses `GET /api/profiles/:id` (profiles domain) |
| `authApiContract.ts` location | **DEFERRED** | Doc originally noted move under `features/auth/`; still in `lib/` — no behavior change |

## Out of scope

- Live / feed / payments  
- Server route edits  
- UI or navigation changes  
