const express = require('express');
const cors    = require('cors');
const admin   = require('firebase-admin');
const crypto  = require('crypto');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Firebase Init ─────────────────────────────────────────────────────────────
const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
const missing = [
  !FIREBASE_PROJECT_ID   && 'FIREBASE_PROJECT_ID',
  !FIREBASE_CLIENT_EMAIL && 'FIREBASE_CLIENT_EMAIL',
  !FIREBASE_PRIVATE_KEY  && 'FIREBASE_PRIVATE_KEY',
].filter(Boolean);
if (missing.length) {
  console.error('Missing env vars:', missing.join(', '));
  process.exit(1);
}
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey:  FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

// ── Refs ──────────────────────────────────────────────────────────────────────
const sessionRef = (sid)      => db.collection('sessions').doc(sid);
const playerRef  = (sid, pid) => db.collection('sessions').doc(sid).collection('players').doc(pid);

// ── POST /api/signin ──────────────────────────────────────────────────────────
app.post('/api/signin', async (req, res) => {
  try {
    const { name, classNumber, sessionId, mode } = req.body;
    if (!name?.trim() || !classNumber?.trim())
      return res.status(400).json({ error: 'Name and class number required.' });

    const sid = sessionId?.trim() || crypto.randomBytes(4).toString('hex').toUpperCase();
    const sSnap = await sessionRef(sid).get();
    if (!sSnap.exists) {
      await sessionRef(sid).set({
        createdAt:       admin.firestore.FieldValue.serverTimestamp(),
        active:          true,
        currentQuestion: 0,          // synced question index for all devices
        phase:           'waiting',  // waiting | question | reveal
      });
    }

    const playerId = name.trim().toLowerCase().replace(/\s+/g, '-') + '-' + classNumber.trim();
    await playerRef(sid, playerId).set({
      name:        name.trim(),
      classNumber: classNumber.trim(),
      score:       0,
      crowdBonus:  0,
      mode:        mode || 'player', // 'host' | 'team' | 'crowd'
      updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    res.json({ playerId, sessionId: sid, name: name.trim(), classNumber: classNumber.trim() });
  } catch (e) {
    console.error('signin:', e);
    res.status(500).json({ error: 'Sign-in failed.' });
  }
});

// ── POST /api/score ───────────────────────────────────────────────────────────
// field: 'score' for team points, 'crowdBonus' for crowd points
app.post('/api/score', async (req, res) => {
  try {
    const { sessionId, playerId, points, field = 'score' } = req.body;
    if (!sessionId || !playerId || points === undefined)
      return res.status(400).json({ error: 'sessionId, playerId and points required.' });

    const safeField = field === 'crowdBonus' ? 'crowdBonus' : 'score';
    await playerRef(sessionId, playerId).update({
      [safeField]: admin.firestore.FieldValue.increment(points),
      updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch (e) {
    console.error('score:', e);
    res.status(500).json({ error: 'Score update failed.' });
  }
});

// ── POST /api/next-question ───────────────────────────────────────────────────
// Host calls this to advance everyone to the next question
app.post('/api/next-question', async (req, res) => {
  try {
    const { sessionId, questionIndex } = req.body;
    await sessionRef(sessionId).update({
      currentQuestion: questionIndex,
      phase:           'question',
      updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ success: true });
  } catch (e) {
    console.error('next-question:', e);
    res.status(500).json({ error: 'Failed to advance question.' });
  }
});

// ── POST /api/apply-bonus ─────────────────────────────────────────────────────
// At game end — adds each class's crowd bonus into their main score
app.post('/api/apply-bonus', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const snap = await db
      .collection('sessions').doc(sessionId)
      .collection('players').get();

    // Sum crowdBonus per class
    const bonusByClass = {};
    snap.docs.forEach(d => {
      const { classNumber, crowdBonus = 0 } = d.data();
      bonusByClass[classNumber] = (bonusByClass[classNumber] || 0) + crowdBonus;
    });

    // Add bonus to every player's score in that class, reset crowdBonus
    const batch = db.batch();
    snap.docs.forEach(d => {
      const cls = d.data().classNumber;
      const bonus = bonusByClass[cls] || 0;
      batch.update(d.ref, {
        score:      admin.firestore.FieldValue.increment(bonus),
        crowdBonus: 0,
      });
    });
    await batch.commit();

    res.json({ success: true, bonusByClass });
  } catch (e) {
    console.error('apply-bonus:', e);
    res.status(500).json({ error: 'Bonus application failed.' });
  }
});

// ── GET /api/leaderboard/:sessionId ──────────────────────────────────────────
app.get('/api/leaderboard/:sessionId', async (req, res) => {
  try {
    const snap = await db
      .collection('sessions').doc(req.params.sessionId)
      .collection('players')
      .orderBy('score', 'desc').limit(5).get();
    res.json(snap.docs.map((d, i) => ({
      rank: i + 1, playerId: d.id, ...d.data(),
      updatedAt: d.data().updatedAt?.toDate?.() || null,
    })));
  } catch (e) {
    console.error('leaderboard:', e);
    res.status(500).json({ error: 'Leaderboard fetch failed.' });
  }
});

// ── GET /api/session/:sessionId ───────────────────────────────────────────────
// Clients poll this to get current question index + phase
app.get('/api/session/:sessionId', async (req, res) => {
  try {
    const snap = await sessionRef(req.params.sessionId).get();
    if (!snap.exists) return res.status(404).json({ error: 'Session not found.' });
    res.json(snap.data());
  } catch (e) {
    res.status(500).json({ error: 'Session fetch failed.' });
  }
});

// ── GET /api/class-scores/:sessionId ─────────────────────────────────────────
// Returns total score + crowdBonus per class for the scoreboard
app.get('/api/class-scores/:sessionId', async (req, res) => {
  try {
    const snap = await db
      .collection('sessions').doc(req.params.sessionId)
      .collection('players').get();

    const byClass = {};
    snap.docs.forEach(d => {
      const { classNumber, score = 0, crowdBonus = 0 } = d.data();
      if (!byClass[classNumber]) byClass[classNumber] = { score: 0, crowdBonus: 0 };
      byClass[classNumber].score      += score;
      byClass[classNumber].crowdBonus += crowdBonus;
    });
    res.json(byClass);
  } catch (e) {
    res.status(500).json({ error: 'Class scores fetch failed.' });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Grammar Quest API running on port ${PORT}`));
