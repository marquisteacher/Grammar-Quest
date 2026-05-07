const express = require('express');
const cors    = require('cors');
const admin   = require('firebase-admin');
const crypto  = require('crypto');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

const missing = [
  !FIREBASE_PROJECT_ID   && 'FIREBASE_PROJECT_ID',
  !FIREBASE_CLIENT_EMAIL && 'FIREBASE_CLIENT_EMAIL',
  !FIREBASE_PRIVATE_KEY  && 'FIREBASE_PRIVATE_KEY',
].filter(Boolean);

if (missing.length) {
  console.error('Missing environment variables:', missing.join(', '));
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

const sessionRef = (sid)      => db.collection('sessions').doc(sid);
const playerRef  = (sid, pid) => db.collection('sessions').doc(sid).collection('players').doc(pid);

app.post('/api/signin', async (req, res) => {
  try {
    const { name, classNumber, sessionId } = req.body;
    if (!name?.trim() || !classNumber?.trim())
      return res.status(400).json({ error: 'Name and class number are required.' });
    const sid = sessionId?.trim() || crypto.randomBytes(4).toString('hex').toUpperCase();
    const sSnap = await sessionRef(sid).get();
    if (!sSnap.exists) {
      await sessionRef(sid).set({ createdAt: admin.firestore.FieldValue.serverTimestamp(), active: true });
    }
    const playerId = name.trim().toLowerCase().replace(/\s+/g, '-') + '-' + classNumber.trim();
    await playerRef(sid, playerId).set({
      name: name.trim(), classNumber: classNumber.trim(), score: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    res.json({ playerId, sessionId: sid, name: name.trim(), classNumber: classNumber.trim() });
  } catch (e) {
    console.error('signin:', e);
    res.status(500).json({ error: 'Sign-in failed.' });
  }
});

app.post('/api/score', async (req, res) => {
  try {
    const { sessionId, playerId, points } = req.body;
    if (!sessionId || !playerId || points === undefined)
      return res.status(400).json({ error: 'sessionId, playerId and points required.' });
    await playerRef(sessionId, playerId).update({
      score:     admin.firestore.FieldValue.increment(points),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (e) {
    console.error('score:', e);
    res.status(500).json({ error: 'Score update failed.' });
  }
});

app.get('/api/leaderboard/:sessionId', async (req, res) => {
  try {
    const snap = await db
      .collection('sessions').doc(req.params.sessionId)
      .collection('players')
      .orderBy('score', 'desc').limit(5).get();
    res.json(snap.docs.map((d, i) => ({
      rank: i + 1, playerId: d.id, ...d.data(),
      updatedAt: d.data().updatedAt?.toDate?.() || null
    })));
  } catch (e) {
    console.error('leaderboard:', e);
    res.status(500).json({ error: 'Leaderboard fetch failed.' });
  }
});

app.delete('/api/session/:sessionId', async (req, res) => {
  try {
    await sessionRef(req.params.sessionId).update({
      active: false, endedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to close session.' });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Grammar Quest API running on port ${PORT}`));
