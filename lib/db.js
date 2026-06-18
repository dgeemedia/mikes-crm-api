// lib/db.js
// Cloud SQLite via Turso (free tier) — no persistent disk needed
// Turso uses the same SQL syntax as SQLite, so queries are identical
// Docs: https://docs.turso.tech/sdk/js/quickstart

const { createClient } = require('@libsql/client');
const bcrypt           = require('bcryptjs');
const { v4: uuid }     = require('uuid');

const db = createClient({
  url:       process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

// ── Schema ───────────────────────────────────────────────────────────────────
// Run once on startup — CREATE IF NOT EXISTS is safe to repeat
async function initSchema() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id                   TEXT PRIMARY KEY,
      username             TEXT NOT NULL UNIQUE,
      display_name         TEXT NOT NULL,
      role                 TEXT NOT NULL DEFAULT 'staff',
      password_hash        TEXT NOT NULL,
      must_change_password INTEGER DEFAULT 1,
      active               INTEGER DEFAULT 1,
      created_at           INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS enquiries (
      id          TEXT PRIMARY KEY,
      first_name  TEXT NOT NULL,
      last_name   TEXT NOT NULL,
      email       TEXT NOT NULL,
      phone       TEXT DEFAULT '',
      project     TEXT DEFAULT '',
      message     TEXT NOT NULL,
      status      TEXT DEFAULT 'new',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replies (
      id          TEXT PRIMARY KEY,
      enquiry_id  TEXT NOT NULL,
      from_name   TEXT NOT NULL,
      from_type   TEXT NOT NULL,
      body        TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id            TEXT PRIMARY KEY,
      enquiry_id    TEXT,
      invitee_name  TEXT NOT NULL,
      invitee_email TEXT NOT NULL,
      event_type    TEXT DEFAULT 'Site Visit',
      start_time    TEXT,
      status        TEXT DEFAULT 'confirmed',
      created_at    INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
    CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries(created_at);
    CREATE INDEX IF NOT EXISTS idx_replies_enquiry   ON replies(enquiry_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_start    ON bookings(start_time);
  `);
}

// ── Seed users on first run ──────────────────────────────────────────────────
async function seedUsers() {
  const seeds = [
    { username: 'admin',    display_name: 'Admin',    role: 'admin', env: 'ADMIN_PASSWORD'    },
    { username: 'mike',     display_name: 'Mike',     role: 'admin', env: 'MIKE_PASSWORD'     },
    { username: 'blessing', display_name: 'Blessing', role: 'staff', env: 'BLESSING_PASSWORD' },
    { username: 'mo',       display_name: 'Mo',       role: 'staff', env: 'MO_PASSWORD'       },
  ];

  for (const s of seeds) {
    const existing = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [s.username] });
    if (existing.rows.length) continue;

    const rawPassword = process.env[s.env];
    if (!rawPassword) {
      console.warn(`[DB] Warning: ${s.env} not set — skipping user "${s.username}"`);
      continue;
    }

    const hash = bcrypt.hashSync(rawPassword, 10);
    await db.execute({
      sql:  `INSERT INTO users (id, username, display_name, role, password_hash, must_change_password, active, created_at)
             VALUES (?, ?, ?, ?, ?, 1, 1, ?)`,
      args: [uuid(), s.username, s.display_name, s.role, hash, Date.now()],
    });
    console.log(`[DB] Created user: ${s.username} (${s.role})`);
  }
}

// Boot: schema + seed (called from server.js)
async function initDB() {
  await initSchema();
  await seedUsers();
  console.log('[DB] Turso ready');
}

// ── Helpers — convert Turso ResultSet rows to plain objects ──────────────────
function rows(result) {
  return result.rows.map(r => Object.fromEntries(Object.entries(r)));
}
function row(result) {
  return result.rows[0] ? Object.fromEntries(Object.entries(result.rows[0])) : null;
}

// ── User helpers ─────────────────────────────────────────────────────────────

async function getUserByUsername(username) {
  const r = await db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username?.toLowerCase()] });
  return row(r);
}

async function getUserById(id) {
  const r = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
  return row(r);
}

async function listUsers() {
  const r = await db.execute('SELECT id, username, display_name, role, must_change_password, active, created_at FROM users ORDER BY created_at ASC');
  return rows(r);
}

async function createUser({ username, display_name, role, password }) {
  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username.toLowerCase()] });
  if (existing.rows.length) throw new Error(`Username "${username}" is already taken`);
  const hash = bcrypt.hashSync(password, 10);
  const id   = uuid();
  await db.execute({
    sql:  `INSERT INTO users (id, username, display_name, role, password_hash, must_change_password, active, created_at)
           VALUES (?, ?, ?, ?, ?, 1, 1, ?)`,
    args: [id, username.toLowerCase(), display_name, role, hash, Date.now()],
  });
  return id;
}

async function setUserActive(userId, active) {
  await db.execute({ sql: 'UPDATE users SET active = ? WHERE id = ?', args: [active ? 1 : 0, userId] });
}

async function changePassword(userId, newPassword) {
  const hash = bcrypt.hashSync(newPassword, 10);
  await db.execute({ sql: 'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', args: [hash, userId] });
}

async function adminResetPassword(userId, tempPassword) {
  const hash = bcrypt.hashSync(tempPassword, 10);
  await db.execute({ sql: 'UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', args: [hash, userId] });
}

// ── Enquiry helpers ──────────────────────────────────────────────────────────

async function saveEnquiry({ id, first_name, last_name, email, phone, project, message, now }) {
  await db.execute({
    sql:  `INSERT INTO enquiries (id, first_name, last_name, email, phone, project, message, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
    args: [id, first_name, last_name, email, phone, project, message, now, now],
  });
}

async function listEnquiries({ status, search } = {}) {
  let sql    = 'SELECT * FROM enquiries';
  const args = [];

  if (status && status !== 'all') {
    sql += ' WHERE status = ?';
    args.push(status);
  }
  if (search) {
    const clause = args.length ? ' AND' : ' WHERE';
    const q = `%${search}%`;
    sql += `${clause} (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR project LIKE ? OR message LIKE ?)`;
    args.push(q, q, q, q, q);
  }
  sql += ' ORDER BY created_at DESC';

  const r = await db.execute({ sql, args });
  return rows(r);
}

async function getEnquiry(id) {
  const r = await db.execute({ sql: 'SELECT * FROM enquiries WHERE id = ?', args: [id] });
  return row(r);
}

async function updateStatus(id, status) {
  await db.execute({ sql: 'UPDATE enquiries SET status = ?, updated_at = ? WHERE id = ?', args: [status, Date.now(), id] });
}

// ── Reply helpers ────────────────────────────────────────────────────────────

async function saveReply({ enquiry_id, from_name, from_type, body, now }) {
  await db.execute({
    sql:  `INSERT INTO replies (id, enquiry_id, from_name, from_type, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [uuid(), enquiry_id, from_name, from_type, body, now || Date.now()],
  });
}

async function getReplies(enquiry_id) {
  const r = await db.execute({ sql: 'SELECT * FROM replies WHERE enquiry_id = ? ORDER BY created_at ASC', args: [enquiry_id] });
  return rows(r);
}

// ── Stats ────────────────────────────────────────────────────────────────────

async function getStats() {
  const [total, newC, replied, booked] = await Promise.all([
    db.execute('SELECT COUNT(*) AS n FROM enquiries'),
    db.execute("SELECT COUNT(*) AS n FROM enquiries WHERE status = 'new'"),
    db.execute("SELECT COUNT(*) AS n FROM enquiries WHERE status = 'replied'"),
    db.execute("SELECT COUNT(*) AS n FROM enquiries WHERE status = 'booked'"),
  ]);
  return {
    total:   Number(total.rows[0].n),
    new:     Number(newC.rows[0].n),
    replied: Number(replied.rows[0].n),
    booked:  Number(booked.rows[0].n),
  };
}

// ── Booking helpers ──────────────────────────────────────────────────────────

async function saveBooking({ enquiry_id, invitee_name, invitee_email, event_type, start_time, status }) {
  await db.execute({
    sql:  `INSERT INTO bookings (id, enquiry_id, invitee_name, invitee_email, event_type, start_time, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [uuid(), enquiry_id || null, invitee_name, invitee_email, event_type, start_time, status || 'confirmed', Date.now()],
  });
}

async function cancelBooking(email) {
  await db.execute({ sql: `UPDATE bookings SET status = 'cancelled' WHERE invitee_email = ? AND status = 'confirmed'`, args: [email] });
}

async function getBookings() {
  const r = await db.execute(`
    SELECT b.*, e.first_name, e.last_name, e.project
    FROM bookings b
    LEFT JOIN enquiries e ON b.enquiry_id = e.id
    ORDER BY b.start_time ASC
  `);
  return rows(r);
}

module.exports = {
  initDB,
  // users
  getUserByUsername, getUserById, listUsers, createUser, setUserActive, changePassword, adminResetPassword,
  // enquiries
  saveEnquiry, listEnquiries, getEnquiry, updateStatus,
  // replies
  saveReply, getReplies,
  // stats
  getStats,
  // bookings
  saveBooking, cancelBooking, getBookings,
};
