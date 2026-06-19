// server.js
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const jwt     = require('jsonwebtoken');
const { initDB } = require('./lib/db');

const app = express();

app.use(cors({
  origin: [
    'https://mikes-constructions.co.uk',
    'https://www.mikes-constructions.co.uk',
    'https://mikes-crm.vercel.app',
    'https://crm.mikes-constructions.co.uk',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
  ],
  credentials: true,
}));
app.use(express.json());

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorised — please log in' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired — please log in again' });
  }
}

// ── Public routes ─────────────────────────────────────────────────────────────
app.post('/api/enquiry',            require('./api/enquiry'));
app.post('/api/webhooks/calendly',  require('./api/calendly-webhook'));

const auth = require('./api/auth');
app.post('/api/login', auth.login);

// ── Protected routes ──────────────────────────────────────────────────────────
app.get('/api/stats',                       requireAuth, require('./api/stats'));
app.get('/api/enquiries',                   requireAuth, require('./api/enquiries'));
app.get('/api/enquiries/:id',               requireAuth, require('./api/enquiry-detail'));
app.patch('/api/enquiries/:id/status',      requireAuth, require('./api/enquiry-detail'));
app.post('/api/enquiries/:id/reply',        requireAuth, require('./api/reply'));
app.post('/api/enquiries/:id/ai-draft',     requireAuth, require('./api/ai-draft'));
app.get('/api/bookings',                    requireAuth, require('./api/bookings'));
app.post('/api/change-password',            requireAuth, auth.changeOwnPassword);
app.get('/api/users',                       requireAuth, auth.getUsers);
app.post('/api/users',                      requireAuth, auth.createNewUser);
app.post('/api/users/:id/reset-password',   requireAuth, auth.resetUserPassword);
app.post('/api/users/:id/deactivate',       requireAuth, auth.deactivateUser);
app.post('/api/users/:id/activate',         requireAuth, auth.activateUser);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, service: 'mikes-crm-api' }));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Mikes CRM running on http://localhost:${PORT}`);
    require('./lib/calendly-sync').startSync();
  });
}).catch(err => {
  console.error('Failed to initialise database:', err.message);
  process.exit(1);
});