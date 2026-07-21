# Google Play — Data safety form (copy/paste)

Use **Policy → App content → Data safety**. Answers below match the shipped app (`com.elixstarlive.app`).

---

## Overview

| Question | Answer |
|----------|--------|
| Does your app collect or share user data? | **Yes** |
| Is all user data encrypted in transit? | **Yes** |
| Do you provide a way for users to request data deletion? | **Yes** |
| Account deletion URL | `https://www.elixstarlive.co.uk/delete-account.html` |
| Has a data safety form been completed for a different app? | No (unless you reuse) |

---

## Data types to declare

For each type below: **Collected = Yes**, **Shared = as noted**, **Optional = No** unless stated.

### Personal info

| Type | Collected | Shared | Purpose | Required |
|------|-----------|--------|---------|----------|
| Email address | Yes | No* | Account management | Yes |
| Name | Yes | Yes (other users) | App functionality | Yes |
| User IDs | Yes | Yes (other users) | App functionality | Yes |
| Other info (username, bio) | Yes | Yes (other users) | App functionality | Yes |

\*Shared only with service processors (hosting, payments), not sold to third parties for ads.

### Financial info

| Type | Collected | Shared | Purpose |
|------|-----------|--------|---------|
| Purchase history | Yes | With Google Play / Apple | App functionality, Fraud prevention |

We do **not** collect credit card numbers (Google Play / Stripe handle payment).

### Photos and videos

| Type | Collected | Shared | Purpose |
|------|-----------|--------|---------|
| Photos | Yes | Yes (UGC visibility) | App functionality |
| Videos | Yes | Yes (UGC visibility) | App functionality |

### Audio files

| Type | Collected | Shared | Purpose |
|------|-----------|--------|---------|
| Voice or sound recordings | Yes | Yes (live/video UGC) | App functionality |

### Messages

| Type | Collected | Shared | Purpose |
|------|-----------|--------|---------|
| Other in-app messages | Yes | Yes (recipients) | App functionality |

Includes DMs and live chat.

### App activity

| Type | Collected | Shared | Purpose |
|------|-----------|--------|---------|
| App interactions | Yes | No | Analytics, App functionality |
| In-app search history | Yes | No | App functionality |
| Other user-generated content | Yes | Yes (UGC) | App functionality |

### App info and performance

| Type | Collected | Shared | Purpose |
|------|-----------|--------|---------|
| Crash logs | Yes | No | Analytics |
| Diagnostics | Yes | No | Analytics |

### Device or other IDs

| Type | Collected | Shared | Purpose |
|------|-----------|--------|---------|
| Device or other IDs | Yes | No | App functionality, Fraud prevention, Push notifications |

Push notification tokens only.

---

## NOT collected (declare No)

- Precise location
- Approximate location
- Contacts / address book
- Calendar
- SMS / call logs
- Web browsing history
- Health info
- Political or religious beliefs
- Sexual orientation
- Race and ethnicity
- Advertising ID (**removed from manifest**)

---

## Security practices

- Data encrypted in transit: **Yes**
- Users can request deletion: **Yes** (Settings → Delete Account + web URL)
- Independent security review: No (unless you have one)

---

## Purpose labels (when Console asks per type)

Use these consistently:

- **Account management** — registration, login, profile
- **App functionality** — feed, live, chat, gifts, shop
- **Analytics** — crash reporting, optional usage events
- **Fraud prevention, security, and compliance** — abuse, payment verification
- **Developer communications** — push notifications (account / activity)

---

## Third-party SDK note (reviewers)

Payments: Google Play Billing (coins), Stripe (shop web checkout only).  
No ad SDKs. No advertising ID.

After saving, export the Data safety summary and confirm it matches your live Privacy Policy.
