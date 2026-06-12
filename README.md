# SHIELD — Women Safety App v2.1.0

## Setup & Run

```bash
npm install
npx expo start
```

## Build APK
```bash
npx eas build --platform android --profile preview
```

## New Features in v2.1.0

### 🚔 Police Station Locator
- Shows nearby police stations using OpenStreetMap data (no API key needed)
- Tap any station card to get directions via Google Maps
- One-tap call button to dial 112 immediately

### 📞 Emergency Helplines
- Complete list of TN emergency numbers (Ambulance 108, Fire 101, Women 181, etc.)
- Tap any number → confirms and dials directly
- WhatsApp/SMS complaint options for TN Police

### 👥 Contact Book Integration
- Add emergency contacts directly from your phone's contact book
- Search by name in the picker
- Manual entry still available as fallback

## All Features
- 🆘 SOS Button (tap to confirm, hold 2s for instant)
- 🎤 Voice trigger (background listening for secret phrase)
- 📞 Fake Call (custom caller name + voice message)
- 🗂️ Evidence Vault (audio + photo evidence capture)
- 📍 Live GPS tracking during SOS
- 📱 Auto-SMS to all emergency contacts
- ⚙️ Full settings & profile management
- 🚔 Nearby Police Station Locator
- ☎️ Emergency Helplines directory
- 📒 Phone contact book integration

# SHIELD Safety App v2.0
### React Native + Expo SDK 54 | Android | Phase 1 + Phase 2

---

## Run on Phone — 3 Commands

```
cd D:\SHIELD_COMPLETE
npm install --legacy-peer-deps
npx expo start --clear
```

Scan QR code with **Expo Go** app (SDK 54).

If QR scan fails:
```
npx expo start --tunnel --clear
```

Or turn on **Mobile Hotspot** on phone → connect PC to it → run above.

---
## Build Real APK (for automatic silent SMS)

```
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

Download APK link → install on phone.
**In APK: SMS sends automatically — no manual tap needed.**

set EAS_NO_VCS=1&& eas build --platform android --profile preview

---
