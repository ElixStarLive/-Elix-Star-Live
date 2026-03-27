# Android Release Keystore Configuration

## 🔐 **RELEASE KEYSTORE SETUP**

### **Generate Release Keystore**
```bash
keytool -genkey -v -keystore elix-star-live-release.keystore \
  -alias elixstarlive \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

### **Keystore Details:**
- **Keystore File**: `elix-star-live-release.keystore`
- **Alias**: `elixstarlive`
- **Validity**: 10000 days (~27 years)
- **Algorithm**: RSA 2048

### **Store Keystore Securely:**
- ❌ **DO NOT** commit to git
- ✅ Store in secure location
- ✅ Backup in multiple secure places
- ✅ Share only with trusted team members

### **Password Security:**
- Keystore password: [SET_SECURE_PASSWORD]
- Key password: [SET_SECURE_PASSWORD]
- Store passwords in secure password manager

## ⚠️ **IMPORTANT**
This keystore is used for signing release builds.
If lost, you cannot update your app on Google Play!