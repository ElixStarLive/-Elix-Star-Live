# Google Play — Policy declarations (copy/paste)

Forms in **Policy → App content**. Fill each section once before production.

---

## 1. Privacy policy

| Field | Value |
|-------|-------|
| Privacy policy URL | `https://www.elixstarlive.co.uk/privacy.html` |

Verify: opens in browser, HTTPS, matches Data safety form.

---

## 2. App access

| Question | Answer |
|----------|--------|
| Does your app require login for all features? | **Yes** (or “Most features require an account”) |
| Instructions for reviewers | Provide a **test Google account** email + password in the Play Console field (do not commit passwords to git). Example text: |

```
Sign in with the test account provided.
Feed, live viewing, profile, settings, and coin purchase (license tester) are available after login.
Registration requires confirming age 13+ and accepting Terms/Privacy.
```

Add your account under **Setup → License testing** for IAP review.

---

## 3. Ads

| Question | Answer |
|----------|--------|
| Does your app contain ads? | **No** |
| Advertising ID | **Not used** (removed from AndroidManifest) |

---

## 4. Financial features

| Question | Answer |
|----------|--------|
| In-app purchases | **Yes** |
| Virtual currency | **Yes** — coins (consumable, Google Play Billing) |
| Cryptocurrency / blockchain | **No** |
| Real-money gambling | **No** |
| Shop physical goods | **Yes** — Stripe checkout in shop flow (web payment), separate from coin IAP |

Disclosure text (already in app Terms + Purchase Coins screen):
- Coins are digital items with no real-world cash value
- Purchases are final and non-refundable except where required by law
- Restore purchases available on Get Coins screen (native)

---

## 5. User-generated content (UGC)

| Question | Answer |
|----------|--------|
| Does the app allow UGC? | **Yes** |
| Moderation | In-app reporting, blocking, guidelines, manual review |
| Terms requiring lawful content | **Yes** — Terms + Community Guidelines |
| In-app report mechanism | **Yes** — Report on videos, profiles, live, messages |
| Contact for abuse | support@elixstarlive.co.uk / info@elixstarlive.co.uk |

---

## 6. Child safety standards (required for social/UGC)

| Field | Value |
|-------|-------|
| Published standards URL | `https://www.elixstarlive.co.uk/child-safety.html` |
| Designated contact | info@elixstarlive.co.uk |
| Minimum age | 13+ (registration checkbox) |

---

## 7. Account deletion

| Field | Value |
|-------|-------|
| In-app deletion | Settings → Delete Account → confirm → `POST /api/auth/delete` |
| Web deletion URL | `https://www.elixstarlive.co.uk/delete-account.html` |
| Processing time | Within 30 days (stated on web page) |

---

## 8. Target audience and content

| Question | Answer |
|----------|--------|
| Target age group | **13 and older** |
| Appeal to children | **No** |
| Play Families / Designed for children | **No** |

---

## 9. News app

**No** — not a news app.

---

## 10. COVID-19 contact tracing / status apps

**No**

---

## 11. Government apps

**No**

---

## 12. Health apps

**No** (unless you add health features later)

---

## 13. Permissions (declare if Console prompts)

| Permission | Why |
|------------|-----|
| Camera | Record video, go live |
| Microphone | Record audio, live |
| Billing | Coin packs, membership, promote IAP |
| Notifications | Push alerts |
| Internet | App functionality |
| WAKE_LOCK / MODIFY_AUDIO_SETTINGS | Live streaming audio |

No location, no contacts, no SMS.

---

## 14. Support URL (store listing)

| Field | Value |
|-------|-------|
| Email | support@elixstarlive.co.uk |
| Website / support page | `https://www.elixstarlive.co.uk/support.html` |

Also live at `https://www.elixstarlive.co.uk/support` (in-app route).

---

## 15. Before you hit Submit on Production

- [ ] Data safety form saved and matches privacy policy
- [ ] Content rating certificate active
- [ ] Child safety URL live
- [ ] Account deletion URL live
- [ ] All coin product IDs created and **Active** in Play Console
- [ ] License tester account added
- [ ] Reviewer test login provided in App access
- [ ] Screenshots uploaded from `store-assets/android/screenshots/`
- [ ] Feature graphic uploaded from `store-assets/android/feature-graphic.png`
- [ ] AAB **1.0.235+** uploaded
