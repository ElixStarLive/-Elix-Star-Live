# 🌟 Elix Star - Live Streaming & Video Platform

A full-featured social video platform with live streaming, battles, virtual gifts, and more.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

---

## ✨ Features

### 🎥 Core Features
- **Short-Form Videos** - vertical video feed
- **Live Streaming** - Real-time broadcasting with chat
- **Live Battles** - Head-to-head gift battles between streamers
- **Virtual Gifts** - Send animated gifts during streams
- **Comments & Likes** - Social engagement on videos
- **Direct Messages** - Private messaging between users
- **Push Notifications** - Real-time alerts for likes, comments, follows

### 💰 Monetization
- **Virtual Currency** - Coins & diamonds system
- **In-App Purchases** - Buy coin packages via Stripe/Apple/Google
- **Battle Boosters** - Power-ups for live battles (2x, steal, freeze)
- **Wallet System** - Immutable transaction ledger

### 🔍 Discovery
- **For You Feed** - AI-powered personalized recommendations
- **Following Feed** - Videos from creators you follow
- **Trending** - Hot videos and hashtags
- **Search** - Find users, videos, and hashtags
- **Hashtags** - Categorize and discover content

### 👤 User Experience
- **User Profiles** - Customizable with bio, avatar, social links
- **Follower System** - Follow/unfollow creators
- **Leveling System** - XP-based progression with badges
- **Privacy Controls** - Block users, report content
- **Settings Hub** - Account, preferences, safety center

### 🛡️ Safety & Moderation
- **Content Reports** - Report videos, comments, users
- **User Blocking** - Block unwanted users
- **Admin Dashboard** - Moderate content and manage users
- **Role-Based Access** - User, creator, moderator, admin roles
- **Ban System** - Temporary and permanent bans

### 📊 Analytics
- **Event Tracking** - Comprehensive analytics for all actions
- **Trending Algorithm** - Smart scoring based on engagement
- **Performance Monitoring** - Track app performance

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm 9+
- Stripe account (for payments; optional)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/elix-star.git
   cd elix-star
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   npm run setup:env
   ```
   This creates `.env` from `.env.example` if missing. Edit `.env` with your values (e.g. `PORT=8080`, LiveKit, Bunny, Stripe). In production (e.g. Coolify) set variables in the dashboard—no `.env` file is used.

4. **Start development server:**
   ```bash
   npm run dev
   ```
   App runs at: http://localhost:5173

5. **Start backend (API + WebSocket)** in another terminal:
   ```bash
   npm run start
   ```
   Serves API and static build; for dev you can use `npm run ws:server` or `npm run start` after building.

---

## 📁 Project Structure

```
elix-star/
├── src/
│   ├── components/       # React components
│   │   ├── BottomNav.tsx
│   │   ├── CommentsDrawer.tsx
│   │   ├── LiveChat.tsx
│   │   ├── LiveBattleUI.tsx
│   │   └── ...
│   ├── pages/            # Page components
│   │   ├── Home.tsx
│   │   ├── Live.tsx
│   │   ├── Profile.tsx
│   │   ├── Settings.tsx
│   │   └── ...
│   ├── lib/              # Services & utilities
│   │   ├── noopClient.ts
│   │   ├── websocket.ts
│   │   ├── analytics.ts
│   │   ├── videoUpload.ts
│   │   └── ...
│   └── types/            # TypeScript definitions
├── api/                  # API endpoints
│   ├── stripe-webhook.ts
│   ├── verify-purchase.ts
│   ├── send-notification.ts
│   └── ...
├── server/               # Backend (Express + WebSocket)
│   ├── index.ts
│   └── routes/
├── android/              # Android app
├── ios/                  # iOS app
└── public/               # Static assets
```

---

## 🛠️ Development

### Available Scripts

```bash
# Development
npm run dev              # Start dev server
npm run ws:server        # Start WebSocket server
npm run build            # Build for production
npm run preview          # Preview production build

# Type Checking
npm run check            # TypeScript type checking
npm run lint             # ESLint

# Testing
npm run test             # Run tests
npm run test:ui          # Test UI

# Mobile
npm run build:mobile     # Build for mobile
npx cap sync             # Sync with Capacitor
npx cap open ios         # Open iOS project
npx cap open android     # Open Android project
```

### Tech Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS, Vite
- **Backend:** Node.js (Express), WebSocket (ws) — e.g. Hetzner
- **Streaming:** LiveKit
- **Storage/CDN:** Bunny (or your choice)
- **Mobile:** Capacitor
- **Payments:** Stripe
- **Build Tool:** Vite
- **Deployment:** Single server (e.g. Hetzner); build with `npm run build` then `npm run start`

---

## 📚 Documentation

- **Setup Guide:** `SETUP_GUIDE.md` - Complete setup instructions
- **Implementation Summary:** `IMPLEMENTATION_SUMMARY.md` - What's built
- **Quick Reference:** `QUICK_REFERENCE.md` - Code snippets
- **Deployment Guide:** `DEPLOYMENT_GUIDE.md` - Production deployment
- **Database Setup:** `RUN_THESE_IN_ORDER.md` - Database migrations

---

## 🔐 Security

- **API rate limiting** to prevent abuse
- **JWT** for WebSocket/auth where configured
- **HTTPS only** in production
- **CORS protection** on API endpoints

---

## 🌍 Deployment (e.g. Hetzner)

1. Build: `npm run build`
2. On your server (Hetzner or any Node host): set env vars from `.env.example`, then run `npm run start` (or `npm run start:prod`).
3. Point your domain to the server; set `VITE_WS_URL` and `VITE_API_URL` to your public URL so the client connects to the same host.
4. Mobile: build with Capacitor and submit to App Store/Play Store.

---

## 📊 Key Features Detail

### Live Battles
Two streamers compete for gifts. Features include:
- Real-time score tracking
- Battle timer (1-10 minutes)
- Power-up boosters (2x multiplier, steal points, freeze)
- Winner announcement
- Automatic rewards distribution

### Virtual Gifts
Users can send animated gifts:
- Small gifts: Roses, hearts, stars (10-50 coins)
- Large gifts: Full-screen animations (100-5000 coins)
- Gift animations overlay on stream
- Creator earns diamonds (convertible to real money)

### Coin System
- Users buy coins with real money
- Coins used for gifts and boosters
- Creators earn diamonds from gifts
- Transparent wallet with transaction history

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📝 License

This project is licensed under the MIT License.

---

## 🆘 Support

- **Documentation:** Check docs in `/docs` folder
- **Issues:** Open an issue on GitHub
- **Email:** support@elixstar.com (example)

---

## 🎯 Roadmap

- [ ] AI content moderation
- [ ] Live stream recording/replay
- [ ] Multi-streaming to other platforms
- [ ] NFT collectibles
- [ ] Advanced analytics dashboard
- [ ] Creator monetization tools

---

**Built with ❤️ by the Elix Star Team**
