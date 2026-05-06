# 🎮 Grammar Quest — Full Deployment Guide
## Firebase + GitHub + Render Setup (Free Tier)

---

## OVERVIEW

```
frontend/index.html  ──→  GitHub Pages (free hosting)
        │
        │ API calls
        ▼
backend/server.js   ──→  Render.com (free hosting)
        │
        │ Firestore reads/writes
        ▼
    Firebase Firestore  (free Spark plan)
```

---

## STEP 1 — Firebase Setup (≈10 minutes)

### 1a. Create a Firebase Project
1. Go to https://console.firebase.google.com
2. Click **"Add project"**
3. Name it `grammar-quest` → Continue → Continue (disable Analytics is fine) → Create project

### 1b. Enable Firestore
1. In the left sidebar → **Build → Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in production mode"** → Next
4. Select a location (us-central is fine) → Enable

### 1c. Set Firestore Security Rules
In Firestore → **Rules** tab, paste this and click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /players/{id} {
      allow read: if true;
      allow write: if true;
    }
    match /sessions/{id} {
      allow read: if true;
      allow write: if true;
    }
  }
}
```

> ⚠️ These are open rules for a classroom app. For production, add authentication.

### 1d. Generate a Service Account Key
1. In Firebase console → ⚙️ **Project Settings** (gear icon, top left)
2. Click **"Service accounts"** tab
3. Click **"Generate new private key"** → Confirm
4. A `.json` file downloads — **keep this safe, never commit it to GitHub**
5. Open the file and copy ALL its contents (you'll need it in Step 3)

---

## STEP 2 — GitHub Setup (≈5 minutes)

### 2a. Create a GitHub Repository
1. Go to https://github.com/new
2. Name: `grammar-quest`
3. Set to **Public** (required for free GitHub Pages)
4. Click **"Create repository"**

### 2b. Push Your Files
Open a terminal in your project folder:

```bash
git init
git add .
git commit -m "Initial Grammar Quest setup"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/grammar-quest.git
git push -u origin main
```

### 2c. Enable GitHub Pages (for the frontend)
1. In your GitHub repo → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / folder: `/frontend`
4. Click **Save**
5. Your site will be live at: `https://YOUR-USERNAME.github.io/grammar-quest/`

---

## STEP 3 — Render Backend Deployment (≈10 minutes)

### 3a. Create a Render Account
1. Go to https://render.com and sign up (free)
2. Connect your GitHub account when prompted

### 3b. Create a Web Service
1. Dashboard → **"New +"** → **"Web Service"**
2. Connect your `grammar-quest` GitHub repo
3. Configure:
   - **Name:** `grammar-quest-api`
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** `Free`

### 3c. Add Environment Variable
1. Scroll to **"Environment Variables"** section
2. Click **"Add Environment Variable"**
3. Key: `FIREBASE_SERVICE_ACCOUNT`
4. Value: Paste the **entire JSON content** of your Firebase service account key file
   (paste it as a single line — Render handles it correctly)
5. Click **"Create Web Service"**

### 3d. Get Your API URL
- After deploy (≈2 minutes), Render gives you a URL like:
  `https://grammar-quest-api-xxxx.onrender.com`
- Copy this URL

---

## STEP 4 — Connect Frontend to Backend

### 4a. Update the API URL
Open `frontend/index.html` and find this line near the top of the `<script>`:

```javascript
const API = 'https://YOUR-RENDER-APP.onrender.com'; // ← update this
```

Replace with your actual Render URL:

```javascript
const API = 'https://grammar-quest-api-xxxx.onrender.com';
```

### 4b. Push the Update
```bash
git add frontend/index.html
git commit -m "Add Render API URL"
git push
```

GitHub Pages will auto-redeploy in ~1 minute.

---

## STEP 5 — Test Everything

1. Open your GitHub Pages URL
2. Sign in with a name + class number
3. Play a game and answer questions
4. Check the leaderboard updates after each correct answer
5. Verify in Firebase Console → Firestore → players collection that scores are saving

---

## FIRESTORE DATA STRUCTURE

```
players/
  {playerId}/
    name: "Alex"
    classNumber: "301"
    allTimeScore: 1450
    gamesPlayed: 3
    lastGrade: 6
    lastPlayed: Timestamp
    createdAt: Timestamp

sessions/
  {auto-id}/
    playerId: "alex-301"
    name: "Alex"
    classNumber: "301"
    sessionScore: 350
    grade: 6
    playedAt: Timestamp
```

---

## API ENDPOINTS

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/signin` | Create/retrieve player |
| POST | `/api/score` | Submit points |
| GET | `/api/leaderboard` | Top 10 all-time |
| GET | `/api/leaderboard?classNumber=301` | Filter by class |
| GET | `/health` | Health check |

---

## TROUBLESHOOTING

**Leaderboard shows "offline"**
- Check your Render service is running (free tier sleeps after 15min inactivity)
- First request after sleep takes ~30 seconds to wake up
- Check the Render logs for errors

**Firebase permission denied**
- Verify Firestore Rules are published (Step 1c)
- Check the `FIREBASE_SERVICE_ACCOUNT` env variable is valid JSON

**GitHub Pages not updating**
- Wait 2-3 minutes after pushing
- Check Actions tab in GitHub for deployment status

**CORS errors in browser**
- The backend already has CORS enabled for all origins
- If issues persist, check your Render URL has no trailing slash

---

## UPGRADING LATER

- **Add teacher dashboard:** Create `/admin` route to view all sessions
- **Class filtering:** Leaderboard already supports `?classNumber=` filtering
- **Reset scores:** Add a Firestore batch delete in a new `/api/reset` endpoint
- **Authentication:** Add Firebase Auth for secure sign-in

---

## COSTS

Everything on the free tier:
- **Firebase Spark plan:** 1GB storage, 50k reads/day, 20k writes/day (more than enough)
- **Render Free:** 750 hours/month (enough for 1 service running 24/7)
- **GitHub Pages:** Free for public repos

> Total cost: **$0/month** for a typical classroom
