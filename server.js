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
if (missing.length) { console.error('Missing env vars:', missing.join(', ')); process.exit(1); }

admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey:  FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const db = admin.firestore();

const sessionRef = (sid)      => db.collection('sessions').doc(sid);
const playerRef  = (sid, pid) => db.collection('sessions').doc(sid).collection('players').doc(pid);

// ── POST /api/signin ──────────────────────────────────────────────────────────
app.post('/api/signin', async (req, res) => {
  try {
    const { name, classNumber, sessionId, mode } = req.body;
    if (!name?.trim() || !classNumber?.trim())
      return res.status(400).json({ error: 'Name and class number required.' });

    const sid = sessionId?.trim() || crypto.randomBytes(4).toString('hex').toUpperCase();

    // Create session if it doesn't exist
    const sSnap = await sessionRef(sid).get();
    if (!sSnap.exists) {
      await sessionRef(sid).set({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        active: true, currentQuestion: 0, phase: 'waiting',
      });
    }

    const playerId = name.trim().toLowerCase().replace(/\s+/g, '-') + '-' + classNumber.trim();

    // KEY FIX: only set score/crowdBonus if document doesn't exist yet
    const pSnap = await playerRef(sid, playerId).get();
    if (!pSnap.exists) {
      await playerRef(sid, playerId).set({
        name: name.trim(), classNumber: classNumber.trim(),
        score: 0, crowdBonus: 0, mode: mode || 'crowd',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    res.json({ playerId, sessionId: sid, name: name.trim(), classNumber: classNumber.trim() });
  } catch (e) {
    console.error('signin:', e);
    res.status(500).json({ error: 'Sign-in failed.' });
  }
});

// ── POST /api/score ───────────────────────────────────────────────────────────
app.post('/api/score', async (req, res) => {
  try {
    const { sessionId, playerId, points, field = 'score' } = req.body;
    if (!sessionId || !playerId || points === undefined)
      return res.status(400).json({ error: 'Missing fields.' });

    const safeField = field === 'crowdBonus' ? 'crowdBonus' : 'score';

    // Use set with merge so it works even if doc doesn't exist yet
    await playerRef(sessionId, playerId).set({
      [safeField]: admin.firestore.FieldValue.increment(points),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    res.json({ success: true });
  } catch (e) {
    console.error('score:', e);
    res.status(500).json({ error: 'Score update failed.' });
  }
});

// ── POST /api/next-question ───────────────────────────────────────────────────
app.post('/api/next-question', async (req, res) => {
  try {
    const { sessionId, questionIndex } = req.body;
    await sessionRef(sessionId).set({
      currentQuestion: questionIndex, phase: 'question',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to advance question.' });
  }
});

// ── GET /api/session/:sessionId ───────────────────────────────────────────────
app.get('/api/session/:sessionId', async (req, res) => {
  try {
    const snap = await sessionRef(req.params.sessionId).get();
    if (!snap.exists) return res.status(404).json({ error: 'Session not found.' });
    res.json(snap.data());
  } catch (e) {
    res.status(500).json({ error: 'Session fetch failed.' });
  }
});

// ── GET /api/leaderboard/:sessionId ──────────────────────────────────────────
// Returns ALL players so frontend can group by class
app.get('/api/leaderboard/:sessionId', async (req, res) => {
  try {
    const snap = await db
      .collection('sessions').doc(req.params.sessionId)
      .collection('players').get();
    res.json(snap.docs.map(d => ({ playerId: d.id, ...d.data(),
      updatedAt: d.data().updatedAt?.toDate?.() || null })));
  } catch (e) {
    console.error('leaderboard:', e);
    res.status(500).json({ error: 'Leaderboard fetch failed.' });
  }
});

// ── GET /api/class-scores/:sessionId ─────────────────────────────────────────
// Returns score + crowdBonus grouped by class
app.get('/api/class-scores/:sessionId', async (req, res) => {
  try {
    const snap = await db
      .collection('sessions').doc(req.params.sessionId)
      .collection('players').get();
    const byClass = {};
    snap.docs.forEach(d => {
      const { classNumber, score = 0, crowdBonus = 0 } = d.data();
      if (!classNumber || classNumber === 'host') return;
      if (!byClass[classNumber]) byClass[classNumber] = { score: 0, crowdBonus: 0 };
      byClass[classNumber].score      += score;
      byClass[classNumber].crowdBonus += crowdBonus;
    });
    res.json(byClass);
  } catch (e) {
    res.status(500).json({ error: 'Class scores failed.' });
  }
});

// ── POST /api/apply-bonus ─────────────────────────────────────────────────────
app.post('/api/apply-bonus', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const snap = await db.collection('sessions').doc(sessionId).collection('players').get();

    const bonusByClass = {};
    snap.docs.forEach(d => {
      const { classNumber, crowdBonus = 0 } = d.data();
      if (classNumber && classNumber !== 'host')
        bonusByClass[classNumber] = (bonusByClass[classNumber] || 0) + crowdBonus;
    });

    const batch = db.batch();
    snap.docs.forEach(d => {
      const bonus = bonusByClass[d.data().classNumber] || 0;
      if (bonus > 0) batch.update(d.ref, {
        score: admin.firestore.FieldValue.increment(bonus), crowdBonus: 0,
      });
    });
    await batch.commit();
    res.json({ success: true, bonusByClass });
  } catch (e) {
    console.error('apply-bonus:', e);
    res.status(500).json({ error: 'Bonus failed.' });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Grammar Quest API running on port ${PORT}`));
