# Google Play Console — submission checklist (Elix Star Live)

**Package:** `com.elixstarlive.app`  
**Current AAB:** `1.0.235` (versionCode **282**)  
**AAB path:** `android/app/build/outputs/bundle/release/app-release.aab`

This folder is the **complete Play policy + listing package**. Copy answers from the linked docs into Play Console — we cannot submit on your Google account for you.

---

## Quick links (policy docs)

| Doc | Use for |
|-----|---------|
| [PLAY_POLICY_DECLARATIONS.md](./PLAY_POLICY_DECLARATIONS.md) | App access, ads, financial features, UGC, child safety, account deletion |
| [PLAY_DATA_SAFETY_FORM.md](./PLAY_DATA_SAFETY_FORM.md) | Data safety questionnaire |
| [PLAY_IARC_ANSWERS.md](./PLAY_IARC_ANSWERS.md) | Content rating / IARC |
| [../store-assets/android/STORE_LISTING_COPY.txt](../store-assets/android/STORE_LISTING_COPY.txt) | Title, short + full description |

---

## 1. Upload AAB

1. Play Console → **Testing → Internal testing** (first) or **Production**
2. Create release → upload `app-release.aab`
3. Release name: `1.0.235 (282)`

---

## 2. Store listing (Grow → Store presence → Main store listing)

| Field | Value |
|-------|-------|
| App name | Elix Star Live |
| Short description | See `store-assets/android/STORE_LISTING_COPY.txt` |
| Full description | See `store-assets/android/STORE_LISTING_COPY.txt` |
| App icon | `store-assets/android/icon-512.png` |
| Feature graphic | `store-assets/android/feature-graphic.png` |
| Phone screenshots | `store-assets/android/screenshots/` (9 images) |
| Category | Social |
| Email | support@elixstarlive.co.uk |
| Website | https://www.elixstarlive.co.uk |
| Privacy policy | https://www.elixstarlive.co.uk/privacy.html |

---

## 3. Required public URLs (must return 200 HTTPS)

| Purpose | URL | Status |
|---------|-----|--------|
| Privacy policy | https://www.elixstarlive.co.uk/privacy.html | Live |
| Terms | https://www.elixstarlive.co.uk/terms.html | Live |
| Account deletion | https://www.elixstarlive.co.uk/delete-account.html | Live |
| Child safety standards | https://www.elixstarlive.co.uk/child-safety.html | Live |
| Support | https://www.elixstarlive.co.uk/support.html | Deploy with next web release |

---

## 4. Policy forms (Policy → App content)

Fill using **[PLAY_POLICY_DECLARATIONS.md](./PLAY_POLICY_DECLARATIONS.md)**:

- [ ] Privacy policy URL  
- [ ] Data safety → **[PLAY_DATA_SAFETY_FORM.md](./PLAY_DATA_SAFETY_FORM.md)**  
- [ ] Content rating → **[PLAY_IARC_ANSWERS.md](./PLAY_IARC_ANSWERS.md)**  
- [ ] Target audience (13+, **not** for children)  
- [ ] Financial features (virtual currency / IAP)  
- [ ] UGC declaration  
- [ ] Child safety standards URL + contact  
- [ ] Account deletion  
- [ ] App access (reviewer test login — **you** add credentials in Console)  
- [ ] Ads: **No**

---

## 5. In-app products (Monetize → Products)

Consumable coin packs — IDs must match exactly:

```
coins100, coins500a, coins1000, coins5000, coins10000,
coins50000, coins100000, coins150000, coins200000
```

Promote SKUs: see `src/lib/iap.ts` → `PROMOTE_PRODUCTS`  
Membership: server-derived per creator (`/api/membership/...`)

**Setup → License testing:** add your Google account for IAP testing.

---

## 6. In-app compliance (already in app)

| Requirement | Where |
|-------------|-------|
| Age 13+ at registration | Register screen checkbox |
| Privacy + Terms links | Register, Purchase Coins, Settings → Legal |
| Account deletion | Settings → Delete Account |
| Restore purchases | Get Coins → restore icon (native) |
| Virtual currency disclosure | Purchase Coins footer |
| Report / block | In-app on content and profiles |

---

## 7. Pre-submit smoke test

- [ ] Login / register (13+ checkbox)  
- [ ] Feed plays  
- [ ] Join and leave live  
- [ ] Buy coins (license tester) — twice in a row  
- [ ] Restore purchases  
- [ ] Settings → Privacy, Terms, Delete Account (cancel)  
- [ ] No Test Coins menu in store build  

---

## 8. Deploy web policy pages

After pulling this commit, **redeploy** `www.elixstarlive.co.uk` so `support.html` is live (new file). Other policy URLs are already live.

---

## Honest status

**Code + policy docs + assets:** ready for Play Console submission.  
**You still must:** paste forms in Console, upload screenshots, add reviewer login, activate IAP products, and submit the release.
