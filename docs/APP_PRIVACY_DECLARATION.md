# Elix Star Live — App Store Privacy Declaration

> **OWNER ACTION REQUIRED**
>
> This document provides a factual basis for the App Privacy questionnaire in App Store Connect.
> The owner must review all entries and complete the form in App Store Connect.
> Fields marked **[OWNER: ...]** require owner input before submission.

---

## Privacy Practices

### Data Used to Track You

**Does the app track users across other companies' apps and websites?**  
**No.** The app does not use advertising identifiers or cross-app tracking.

---

### Data Linked to You

The following data types are collected and linked to the user's identity:

| Category | Data Type | Use |
|---|---|---|
| Contact Info | Email Address | Authentication, notifications |
| Contact Info | Name / Username | Profile |
| Identifiers | User ID | Account management |
| Purchases | Purchase History | Coin balance, creator payout |
| Usage Data | App Interactions | Analytics, engagement |
| Usage Data | Other Actions (gifts sent, streams watched) | Engagement features |
| User Content | Videos | Content platform |
| User Content | Messages | Messaging feature |
| User Content | Photos / Images | Profile picture |
| Diagnostics | Crash Data | Stability |

---

### Data Not Linked to You

| Category | Data Type | Use |
|---|---|---|
| Location | None | Not collected |
| Health & Fitness | None | Not collected |
| Financial Info | None | Purchase is through Apple IAP; card data stays with Apple |
| Contacts | None | Not collected |
| Browsing History | None | Not collected |
| Search History | Device-only | Not sent to server |

---

## Permission Usage (iOS Info.plist)

| Permission | Usage Description |
|---|---|
| Camera (`NSCameraUsageDescription`) | Elix Star Live uses your camera to record videos, go live, and make video calls. |
| Microphone (`NSMicrophoneUsageDescription`) | Elix Star Live uses your microphone to capture audio when recording videos, going live, and during video calls. |
| Photo Library (`NSPhotoLibraryUsageDescription`) | We use your photo library to let you pick videos and photos to upload. |
| Photo Library Add (`NSPhotoLibraryAddUsageDescription`) | We use your photo library to save videos and photos you create. |
| Notifications (`NSUserNotificationsUsageDescription`) | We send you notifications about live streams, new followers, and messages. |

---

## Privacy Manifest (PrivacyInfo.xcprivacy)

> **OWNER ACTION REQUIRED — CRITICAL**
>
> Apple requires a `PrivacyInfo.xcprivacy` file for apps that use certain APIs.
> This file is missing from the current Xcode project.
>
> **Required APIs to declare:**
> - `NSPrivacyAccessedAPIType: NSPrivacyAccessedAPICategoryUserDefaults`  
>   Reason: Store user preferences (settings, session tokens)  
>   Required reason: `CA92.1` (App functionality)
>
> **Action:** Create `ios/App/App/PrivacyInfo.xcprivacy` with the correct entries and add it to the Xcode target before building the final IPA.
>
> Reference: https://developer.apple.com/documentation/bundleresources/privacy_manifest_files

---

## Privacy Policy URL

**[OWNER: Confirm the privacy policy URL]**  
Current: `https://www.elixstarlive.co.uk/privacy`

The privacy policy must be publicly accessible (no login required) and describe all data collection practices.

---

## Export Compliance

The app uses only standard HTTPS/TLS encryption provided by the operating system.  
`ITSAppUsesNonExemptEncryption` is set to `false` in `Info.plist`.  
No custom encryption algorithms are used.

---

## COPPA / Children's Privacy

The app is not directed at children under 13. Account creation requires acceptance of Terms of Service which includes an age confirmation.
