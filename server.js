const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Initialize Firebase Admin with service account from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── POST /api/signin ──────────────────────────────────────────────────────────
// Creates or retrieves a player session
app.post('/api/signin', async (req, res) => {
  try {
    const { name, classNumber } = req.body;
    if (!name || !classNumber) return res.status(400).json({ error: 'Name and class number required' });

    const playerId = `${name.trim().toLowerCase().replace(/\s+/g,'-')}-${classNumber}`;
    const ref = db.collection('players').doc(playerId);
    const snap = await ref.get();

    if (!snap.exists) {
      await ref.set({
        name: name.trim(),
        classNumber,
        allTimeScore: 0,
        gamesPlayed: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    const data = snap.exists ? snap.data() : { name: name.trim(), classNumber, allTimeScore: 0, gamesPlayed: 0 };
    res.json({ playerId, ...data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Sign-in failed' });
  }
});

// ── POST /api/score ───────────────────────────────────────────────────────────
// Submits a game score and updates all-time total
app.post('/api/score', async (req, res) => {
  try {
    const { playerId, name, classNumber, sessionScore, grade } = req.body;
    if (!playerId || sessionScore === undefined) return res.status(400).json({ error: 'Missing fields' });

    const playerRef = db.collection('players').doc(playerId);
    await playerRef.update({
      allTimeScore: admin.firestore.FieldValue.increment(sessionScore),
      gamesPlayed: admin.firestore.FieldValue.increment(1),
      lastGrade: grade,
      lastPlayed: admin.firestore.FieldValue.serverTimestamp()
    });

    // Also log this session
    await db.collection('sessions').add({
      playerId, name, classNumber, sessionScore, grade,
      playedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Score submission failed' });
  }
});

// ── GET /api/leaderboard ──────────────────────────────────────────────────────
// Returns top 5 all-time leaders + optional class filter
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { classNumber } = req.query;
    let query = db.collection('players').orderBy('allTimeScore', 'desc').limit(10);
    if (classNumber) query = query.where('classNumber', '==', classNumber);

    const snap = await query.get();
    const leaders = snap.docs.map((d, i) => ({
      rank: i + 1,
      playerId: d.id,
      ...d.data(),
      lastPlayed: d.data().lastPlayed?.toDate?.() || null
    }));
    res.json(leaders);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Leaderboard fetch failed' });
  }
});

// ── GET /api/leaderboard/session ─────────────────────────────────────────────
// Top 5 from current session (passed in as query param sessionIds)
app.get('/api/leaderboard/session', async (req, res) => {
  try {
    const { ids } = req.query; // comma-separated playerIds
    if (!ids) return res.json([]);
    const idList = ids.split(',').slice(0, 20);
    const snaps = await Promise.all(idList.map(id => db.collection('players').doc(id).get()));
    const leaders = snaps
      .filter(s => s.exists)
      .map(s => ({ playerId: s.id, ...s.data() }))
      .sort((a, b) => b.allTimeScore - a.allTimeScore)
      .slice(0, 5)
      .map((p, i) => ({ ...p, rank: i + 1 }));
    res.json(leaders);
  } catch (e) {
    res.status(500).json({ error: 'Session leaderboard failed' });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Grammar Quest API running on port ${PORT}`));
