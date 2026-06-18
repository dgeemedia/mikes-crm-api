// server.js
// Entry point — mounts all API routes and serves the CRM frontend
// Deploy this to Render as a Web Service (Node.js)

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const jwt     = require('jsonwebtoken');

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    // Main website
    'https://mikes-constructions.co.uk',
    'https://www.mikes-constructions.co.uk',
    // CRM frontend on Vercel — update this once you have the Vercel URL
    'https://mikes-crm.vercel.app',
    // If you add a custom domain e.g. crm.mikes-constructions.co.uk
    'https://crm.mikes-constructions.co.uk',
    // Local dev
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
  ],
  credentials: true,
}));
app.use(express.json());

// ── Auth middleware — applied to all /api/* except /api/enquiry and /api/login ──
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

// ── Public routes (no auth) ──────────────────────────────────────────────────

// Website contact form → CRM intake
app.post('/api/enquiry', require('./api/enquiry'));

// Calendly webhook — called automatically when a customer books or cancels
// Must be public (no auth) so Calendly can reach it
app.post('/api/webhooks/calendly', express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString(); }
}), require('./api/calendly-webhook'));

// CRM login & user management
const auth = require('./api/auth');
app.post('/api/login', auth.login);

// ── Protected routes ─────────────────────────────────────────────────────────
app.get('/api/stats',                          requireAuth, require('./api/stats'));
app.get('/api/enquiries',                      requireAuth, require('./api/enquiries'));
app.get('/api/enquiries/:id',                  requireAuth, (req, res) => require('./api/enquiry-detail')(req, res));
app.patch('/api/enquiries/:id/status',         requireAuth, (req, res) => {
  req.path = req.path;
  require('./api/enquiry-detail')(req, res);
});
app.post('/api/enquiries/:id/reply',           requireAuth, require('./api/reply'));
app.post('/api/enquiries/:id/ai-draft',        requireAuth, require('./api/ai-draft'));
app.get('/api/bookings',                       requireAuth, require('./api/bookings'));

// User self-service — any logged-in user can change their own password
app.post('/api/change-password',               requireAuth, auth.changeOwnPassword);

// Admin only — full user management
app.get('/api/users',                          requireAuth, auth.getUsers);
app.post('/api/users',                         requireAuth, auth.createNewUser);
app.post('/api/users/:id/reset-password',      requireAuth, auth.resetUserPassword);
app.post('/api/users/:id/deactivate',          requireAuth, auth.deactivateUser);
app.post('/api/users/:id/activate',            requireAuth, auth.activateUser);

// ── Health check — Render pings this to confirm service is up ────────────────
app.get('/health', (req, res) => res.json({ ok: true, service: 'mikes-crm-api' }));



// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Mikes CRM running on http://localhost:${PORT}`);
  // Start Calendly booking sync (polls every 30 min)
  require('./lib/calendly-sync').startSync();
});
