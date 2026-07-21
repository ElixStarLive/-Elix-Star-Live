# Google Play Store Assets Guide

## Required Assets for Elix Star Live

### 1. App Icon (512x512 Play; 1024 for source)
- Use the existing Android launcher mipmaps / `store-assets/android/icon-1024.png` when available

### 2. Feature Graphic (1024x500)
- **Location**: `store-assets/android/feature-graphic.png`
- Required by Play Console

### 3. Screenshots (Required)
Capture from a real device or emulator running the release AAB:
- **Location**: `store-assets/android/screenshots/`
- Phone: at least 2 (recommend 4) — feed, live, create, profile
- Min short side ≥ 320px; typical 1080x1920

### 4. App Store Listing Content

#### Title:
Elix Star Live

#### Short Description (≤80 chars):
Create, share & discover short videos. Go live, battle, and connect!

#### Full Description:
Use the short-video / live / gifts / safety features description. Do not claim “millions of users” unless true.

#### Category:
Social

#### Content rating:
Complete the IARC questionnaire in Play Console (UGC, chat, virtual items).

### 5. Required public URLs (use .co.uk — NOT .com)

| Purpose | URL |
|---------|-----|
| Privacy Policy | https://www.elixstarlive.co.uk/privacy.html |
| Terms | https://www.elixstarlive.co.uk/terms.html |
| Support | https://www.elixstarlive.co.uk/support (or in-app Support) |
| Account deletion | https://www.elixstarlive.co.uk/delete-account.html |
| Child safety | https://www.elixstarlive.co.uk/child-safety.html |

### 6. In-app purchase product IDs (must match Play Console)

```
coins100, coins500a, coins1000, coins5000, coins10000,
coins50000, coins100000, coins150000, coins200000
```

Promote / membership SKUs: see `src/lib/iap.ts` (`PROMOTE_PRODUCTS`, `MEMBERSHIP_PRODUCT_ID`).

Create each as **managed / consumable** (coins) or subscription (membership) in Play Console before testing.
