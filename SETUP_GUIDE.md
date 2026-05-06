# Grammar Quest — Deployment Guide
## Firebase (ready) + GitHub + Render  |  All Free Tier

---

## What you're building

```
frontend/index.html  ──→  GitHub Pages  (free)
        │  API calls (sign-in, score, leaderboard)
        ▼
backend/server.js    ──→  Render.com    (free)
        │  Firestore reads / writes
        ▼
    Firebase Firestore  (free Spark plan)
```

**Scores reset each session** — when a new session starts, the leaderboard is fresh. Students who share the same Session ID compete on the same board in real-time.

---

## STEP 1 — Firebase: Enable Firestore & get a service account key

Since you already have a Firebase project, you just need two things:

### 1a. Enable Firestore (if not already on)
1. Firebase Console → **Build → Firestore Database**
2. Click **Create database** → Production mode → pick a region → Enable

### 1b. Set Firestore Security Rules
Firestore → **Rules** tab → paste and **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /sessions/{sid} {
      allow read, write: if true;
      match /players/{pid} {
        allow read, write: if true;
      }
    }
  }
}
```

### 1c. Generate a Service Account Key
1. Firebase Console → ⚙️ **Project Settings** → **Service accounts** tab
2. **Generate new private key** → Confirm
3. A `.json` file downloads — open it, copy **all contents**
4. ⚠️ Never commit this file to GitHub — it's already in `.gitignore`

---

## STEP 2 — GitHub: Push code & enable Pages

### 2a. Create repo
1. https://github.com/new → name: `grammar-quest` → Public → Create

### 2b. Push
```bash
cd grammar-quest
git init
git add .
git commit -m "Grammar Quest initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/grammar-quest.git
git push -u origin main
```

### 2c. Enable GitHub Pages for the frontend
1. Repo → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` | Folder: `/frontend`
4. Save → live at: `https://YOUR-USERNAME.github.io/grammar-quest/`

---

## STEP 3 — Render: Deploy the backend

### 3a. Create a Render account
https://render.com → sign up free → connect GitHub

### 3b. New Web Service
1. **New + → Web Service** → connect your `grammar-quest` repo
2. Settings:
   | Field | Value |
   |-------|-------|
   | Name | `grammar-quest-api` |
   | Root Directory | `backend` |
   | Runtime | `Node` |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Plan | `Free` |

### 3c. Add the Firebase environment variable
1. Scroll to **Environment Variables**
2. Add:
   - **Key:** `FIREBASE_SERVICE_ACCOUNT`
   - **Value:** Paste the entire JSON from Step 1c (one line is fine)
3. **Create Web Service** → wait ~2 min for first deploy

### 3d. Copy your Render URL
Looks like: `https://grammar-quest-api-xxxx.onrender.com`

---

## STEP 4 — Connect frontend to backend

Open `frontend/index.html` and find:

```javascript
const API = 'https://YOUR-RENDER-APP.onrender.com';
```

Replace with your actual Render URL, then push:

```bash
git add frontend/index.html
git commit -m "Set API URL"
git push
```

GitHub Pages redeploys in ~1 minute.

---

## STEP 5 — How sessions work in the classroom

| Scenario | What to do |
|----------|-----------|
| **One class, everyone on the same leaderboard** | Teacher displays Session ID (e.g. `MATH301`). All students type it at sign-in. |
| **New game, fresh leaderboard** | Leave Session ID blank — server auto-generates a new one. |
| **Different classes competing separately** | Each class uses a different Session ID. |

The leaderboard resets automatically when a new Session ID is used. Scores within a session persist until you start a new one.

---

## Firestore Data Structure

```
sessions/
  {sessionId}/           e.g. "MATH301" or "A3F2"
    createdAt: Timestamp
    active: true
    players/
      {playerId}/        e.g. "alex-johnson-301"
        name: "Alex Johnson"
        classNumber: "301"
        score: 450       ← increments as they answer correctly
        updatedAt: Timestamp
```

---

## API Reference

| Method | Path | Body / Params | Description |
|--------|------|---------------|-------------|
| POST | `/api/signin` | `{ name, classNumber, sessionId? }` | Register player |
| POST | `/api/score` | `{ sessionId, playerId, points }` | Add points |
| GET | `/api/leaderboard/:sessionId` | — | Top 5 for session |
| DELETE | `/api/session/:sessionId` | — | Mark session done |
| GET | `/health` | — | Server status |

---

## Troubleshooting

**Leaderboard says "offline"**
- Free Render services sleep after 15 min idle. First request after sleep takes ~30s to wake up. This is normal — it wakes automatically on first answer.
- Check Render → Logs for any errors.

**"Permission denied" from Firebase**
- Verify Firestore Rules are published (Step 1b)
- Double-check `FIREBASE_SERVICE_ACCOUNT` env var is valid JSON (no extra spaces/quotes around it)

**GitHub Pages not updating**
- Check Actions tab in GitHub repo for deployment status
- Force refresh the page (Ctrl+Shift+R)

---

## Cost breakdown

| Service | Plan | Cost |
|---------|------|------|
| Firebase Firestore | Spark (free) | $0 — 1GB storage, 50k reads/day |
| Render Web Service | Free | $0 — 750 hrs/month |
| GitHub Pages | Free | $0 — unlimited for public repos |
| **Total** | | **$0/month** |
