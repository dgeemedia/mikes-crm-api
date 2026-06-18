// lib/db.js
// Single database connection shared across all API routes
// Uses better-sqlite3 (synchronous, zero-config, perfect for a single-server CRM)

const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const { v4: uuid } = require('uuid');

// Render's persistent disk mounts at /var/data — fall back to local for dev
const DB_PATH = process.env.DB_PATH || './enquiries.db';
const db = new Database(DB_PATH);

// ── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    username     TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'staff',  -- 'admin' | 'staff'
    password_hash TEXT NOT NULL,
    must_change_password INTEGER DEFAULT 1,      -- 1 = forced change on next login
    active       INTEGER DEFAULT 1,               -- 0 = deactivated (cannot log in)
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS enquiries (
    id          TEXT PRIMARY KEY,
    first_name  TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    email       TEXT NOT NULL,
    phone       TEXT    DEFAULT '',
    project     TEXT    DEFAULT '',
    message     TEXT NOT NULL,
    status      TEXT    DEFAULT 'new',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS replies (
    id          TEXT PRIMARY KEY,
    enquiry_id  TEXT NOT NULL,
    from_name   TEXT NOT NULL,
    from_type   TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (enquiry_id) REFERENCES enquiries(id)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id            TEXT PRIMARY KEY,
    enquiry_id    TEXT,
    invitee_name  TEXT NOT NULL,
    invitee_email TEXT NOT NULL,
    event_type    TEXT DEFAULT 'Site Visit',
    start_time    TEXT,
    status        TEXT DEFAULT 'confirmed',
    created_at    INTEGER NOT NULL,
    FOREIGN KEY (enquiry_id) REFERENCES enquiries(id)
  );

  CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
  CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_replies_enquiry ON replies(enquiry_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_start ON bookings(start_time);
`);

// ── Seed users on first run ──────────────────────────────────────────────────
// Reads initial passwords from env vars, hashes them, stores in DB
// Users can change their own password after first login
function seedUsers() {
  const seeds = [
    { username: 'admin',    display_name: 'Admin',    role: 'admin', env: 'ADMIN_PASSWORD'    },
    { username: 'mike',     display_name: 'Mike',     role: 'admin', env: 'MIKE_PASSWORD'     },
    { username: 'blessing', display_name: 'Blessing', role: 'staff', env: 'BLESSING_PASSWORD' },
    { username: 'mo',       display_name: 'Mo',       role: 'staff', env: 'MO_PASSWORD'       },
  ];

  for (const s of seeds) {
    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(s.username);
    if (exists) continue; // never overwrite an existing user

    const rawPassword = process.env[s.env];
    if (!rawPassword) {
      console.warn(`[DB] Warning: ${s.env} not set — skipping user "${s.username}"`);
      continue;
    }

    const hash = bcrypt.hashSync(rawPassword, 10);
    db.prepare(`
      INSERT INTO users (id, username, display_name, role, password_hash, must_change_password, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(uuid(), s.username, s.display_name, s.role, hash, Date.now());

    console.log(`[DB] Created user: ${s.username} (${s.role})`);
  }
}

seedUsers();

// ── User helpers ─────────────────────────────────────────────────────────────

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username?.toLowerCase());
}

function createUser({ username, display_name, role, password }) {
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username.toLowerCase());
  if (exists) throw new Error(`Username "${username}" is already taken`);
  const hash = bcrypt.hashSync(password, 10);
  const id   = uuid();
  db.prepare(`
    INSERT INTO users (id, username, display_name, role, password_hash, must_change_password, active, created_at)
    VALUES (?, ?, ?, ?, ?, 1, 1, ?)
  `).run(id, username.toLowerCase(), display_name, role, hash, Date.now());
  return id;
}

function setUserActive(userId, active) {
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, userId);
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function listUsers() {
  return db.prepare('SELECT id, username, display_name, role, must_change_password, active, created_at FROM users ORDER BY created_at ASC').all();
}

function changePassword(userId, newPassword) {
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(hash, userId);
}

// Admin only — reset another user's password and force change on next login
function adminResetPassword(userId, tempPassword) {
  const hash = bcrypt.hashSync(tempPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')
    .run(hash, userId);
}

// ── Enquiry helpers ──────────────────────────────────────────────────────────

function saveEnquiry({ id, first_name, last_name, email, phone, project, message, now }) {
  db.prepare(`
    INSERT INTO enquiries (id, first_name, last_name, email, phone, project, message, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)
  `).run(id, first_name, last_name, email, phone, project, message, now, now);
}

function listEnquiries({ status, search } = {}) {
  let sql    = 'SELECT * FROM enquiries';
  const params = [];

  if (status && status !== 'all') {
    sql += ' WHERE status = ?';
    params.push(status);
  }

  if (search) {
    const clause = params.length ? ' AND' : ' WHERE';
    const q = `%${search}%`;
    sql += `${clause} (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR project LIKE ? OR message LIKE ?)`;
    params.push(q, q, q, q, q);
  }

  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params);
}

function getEnquiry(id) {
  return db.prepare('SELECT * FROM enquiries WHERE id = ?').get(id);
}

function updateStatus(id, status) {
  db.prepare('UPDATE enquiries SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, Date.now(), id);
}

// ── Reply helpers ────────────────────────────────────────────────────────────

function saveReply({ enquiry_id, from_name, from_type, body, now }) {
  db.prepare(`
    INSERT INTO replies (id, enquiry_id, from_name, from_type, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuid(), enquiry_id, from_name, from_type, body, now || Date.now());
}

function getReplies(enquiry_id) {
  return db.prepare('SELECT * FROM replies WHERE enquiry_id = ? ORDER BY created_at ASC').all(enquiry_id);
}

// ── Stats ────────────────────────────────────────────────────────────────────

function getStats() {
  const total    = db.prepare('SELECT COUNT(*) AS n FROM enquiries').get().n;
  const newCount = db.prepare("SELECT COUNT(*) AS n FROM enquiries WHERE status = 'new'").get().n;
  const replied  = db.prepare("SELECT COUNT(*) AS n FROM enquiries WHERE status = 'replied'").get().n;
  const booked   = db.prepare("SELECT COUNT(*) AS n FROM enquiries WHERE status = 'booked'").get().n;
  return { total, new: newCount, replied, booked };
}

// ── Booking helpers ──────────────────────────────────────────────────────────

function saveBooking({ enquiry_id, invitee_name, invitee_email, event_type, start_time, status }) {
  db.prepare(`
    INSERT INTO bookings (id, enquiry_id, invitee_name, invitee_email, event_type, start_time, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuid(), enquiry_id || null, invitee_name, invitee_email, event_type, start_time, status || 'confirmed', Date.now());
}

function cancelBooking(email) {
  db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE invitee_email = ? AND status = 'confirmed'`)
    .run(email);
}

function getBookings() {
  return db.prepare(`
    SELECT b.*, e.first_name, e.last_name, e.project
    FROM bookings b
    LEFT JOIN enquiries e ON b.enquiry_id = e.id
    ORDER BY b.start_time ASC
  `).all();
}

module.exports = {
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
