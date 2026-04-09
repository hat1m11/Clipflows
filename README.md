# 🎬 ClipFlow

> **Upload once. Distribute everywhere.**

A platform-agnostic video distribution engine for solo creators. Upload your video, add captions, and post to TikTok (and soon Instagram, X, LinkedIn) in one click.

---

## ✨ Features

- 🔐 **Auth** — Secure JWT-based sign up / login
- 🔗 **TikTok OAuth** — Connect your TikTok account (mock mode included for dev)
- 📹 **Video Upload** — Drag-and-drop, up to 500MB, local storage with easy cloud upgrade path
- 🎯 **Platform Selector** — Choose platforms individually or "Post to All"
- ✏️ **Caption Engine** — Global caption OR per-platform captions with toggle
- ⚡ **Async Queue** — BullMQ + Redis background processing (never blocks the UI)
- 🔄 **Auto Retry** — 3 attempts with exponential backoff on failure
- 🔁 **Manual Retry** — Retry failed posts from the dashboard
- 📊 **Live Dashboard** — Real-time post status (🟡 Pending → 🟢 Live / 🔴 Failed), auto-polls while jobs are active
- 🗑️ **Post Delete** — Removes from ClipFlow DB (with clear warning it stays on TikTok)
- 💰 **Ad Modal** — Non-blocking ad shown after posting (4s countdown)

---

## 🏗 Architecture

```
┌──────────────┐     REST API      ┌─────────────────┐
│   React App  │ ◄──────────────► │  Express Server  │
│  (port 3000) │                  │   (port 4000)    │
└──────────────┘                  └────────┬─────────┘
                                           │
                              ┌────────────┼────────────┐
                              │            │            │
                        ┌─────▼────┐ ┌────▼────┐ ┌────▼────┐
                        │PostgreSQL│ │  Redis  │ │  Local  │
                        │   (DB)   │ │ (Queue) │ │ Storage │
                        └──────────┘ └────┬────┘ └─────────┘
                                          │
                                   ┌──────▼──────┐
                                   │  BullMQ     │
                                   │  Worker     │
                                   │ (postWorker)│
                                   └──────┬──────┘
                                          │
                              ┌───────────▼──────────┐
                              │   Platform Adapters  │
                              │  tiktok.js           │
                              │  instagram.js (soon) │
                              │  twitter.js   (soon) │
                              └──────────────────────┘
```

---

## 🚀 Quick Start

### Option A: Docker Compose (recommended)

```bash
git clone <your-repo>
cd clipflow

# Start everything
docker-compose up

# Open http://localhost:3000
```

### Option B: Run locally

**Prerequisites:** Node 18+, PostgreSQL, Redis

```bash
# 1. Start Postgres + Redis (or install locally)
docker-compose up postgres redis

# 2. Backend setup
cd backend
cp .env.example .env
npm install
npm run migrate      # Creates all DB tables
npm run dev          # API on :4000

# 3. Worker (separate terminal)
cd backend
npm run worker

# 4. Frontend
cd frontend
npm install
npm start            # React on :3000
```

---

## 🔑 Environment Variables

See `backend/.env.example`. Key variables:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | local |
| `REDIS_URL` | Redis connection string | local |
| `JWT_SECRET` | Long random string for JWT signing | **change this!** |
| `TIKTOK_CLIENT_KEY` | From TikTok Developer Portal | `mock` |
| `TIKTOK_CLIENT_SECRET` | From TikTok Developer Portal | `mock` |

> **Mock mode:** Leave `TIKTOK_CLIENT_KEY=mock` to simulate posting without real TikTok credentials. All posts will succeed after a 2-second delay.

---

## 🔮 Adding a New Platform

1. Create `backend/src/platforms/instagram.js`:

```js
async function post(videoPath, caption, credentials) {
  // Call Instagram API
  return { success: true, externalPostId: 'ig_123' };
}

async function exchangeCodeForTokens(code, redirectUri) { ... }
async function getUserProfile(accessToken) { ... }

module.exports = { post, exchangeCodeForTokens, getUserProfile };
```

2. Register it in `backend/src/platforms/index.js`:

```js
const instagram = require('./instagram');
const platforms = { tiktok, instagram };
```

3. Add it to the UI in `frontend/src/pages/UploadPage.js`:

```js
{ id: 'instagram', name: 'Instagram', icon: '📸', available: true },
```

That's it. The queue, retry logic, status tracking, and dashboard all work automatically.

---

## 📁 Project Structure

```
clipflow/
├── docker-compose.yml
├── backend/
│   ├── src/
│   │   ├── index.js              # Express entry point
│   │   ├── db/
│   │   │   ├── index.js          # PostgreSQL pool
│   │   │   └── migrate.js        # Schema (users, social_accounts, posts, post_targets)
│   │   ├── queue/
│   │   │   └── index.js          # BullMQ queue factory
│   │   ├── platforms/
│   │   │   ├── index.js          # Platform registry
│   │   │   └── tiktok.js         # TikTok adapter (mock + real)
│   │   ├── workers/
│   │   │   └── postWorker.js     # Background job processor
│   │   ├── middleware/
│   │   │   └── auth.js           # JWT auth middleware
│   │   └── routes/
│   │       ├── auth.js           # POST /auth/signup, /login, GET /me
│   │       ├── accounts.js       # OAuth connect/disconnect
│   │       └── posts.js          # Upload, create, list, retry, delete
│   └── .env.example
└── frontend/
    └── src/
        ├── App.js                # Routes
        ├── styles.css            # Design system
        ├── context/AuthContext.js
        ├── services/api.js       # Axios client
        ├── components/
        │   ├── Layout.js         # Sidebar shell
        │   ├── StatusBadge.js    # 🟡🟢🔴 badges
        │   └── AdModal.js        # Post-publish ad
        └── pages/
            ├── LoginPage.js
            ├── SignupPage.js
            ├── DashboardPage.js  # Post list + stats + polling
            ├── UploadPage.js     # Full upload + post flow
            └── AccountsPage.js   # Connect/disconnect platforms
```

---

## 📋 API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/signup` | — | Create account |
| POST | `/auth/login` | — | Sign in |
| GET | `/auth/me` | ✓ | Get current user |
| GET | `/accounts` | ✓ | List connected accounts |
| GET | `/accounts/tiktok/oauth-url` | ✓ | Get TikTok OAuth URL |
| POST | `/accounts/tiktok/callback` | ✓ | Handle OAuth callback |
| DELETE | `/accounts/:platform` | ✓ | Disconnect account |
| POST | `/posts/upload` | ✓ | Upload video file |
| POST | `/posts` | ✓ | Create post (queues jobs) |
| GET | `/posts` | ✓ | List all posts |
| GET | `/posts/:id` | ✓ | Get single post |
| POST | `/posts/:id/retry/:targetId` | ✓ | Retry failed target |
| DELETE | `/posts/:id` | ✓ | Delete post |

---

## 🗺 Roadmap

- [ ] Real TikTok OAuth flow
- [ ] Instagram Reels support
- [ ] X / Twitter video support
- [ ] LinkedIn video support
- [ ] Scheduled posting
- [ ] Post analytics
- [ ] AI caption suggestions
- [ ] Cloud storage (S3) upgrade path
- [ ] Mobile app
