// mikes-crm-api/api/auth.js
const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {
  getUserByUsername, getUserById, listUsers,
  createUser, setUserActive,
  changePassword, adminResetPassword,
} = require('../lib/db');

// ── Login ────────────────────────────────────────────────────────────────────
async function login(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = await getUserByUsername(username);
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });

  if (user.active === 0) return res.status(401).json({ error: 'Invalid username or password' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

  const token = jwt.sign(
    { id: user.id, username: user.username, name: user.display_name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    name:               user.display_name,
    role:               user.role,
    mustChangePassword: user.must_change_password === 1,
  });
}

// ── Change own password ──────────────────────────────────────────────────────
async function changeOwnPassword(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

  const user = await getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = bcrypt.compareSync(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  await changePassword(user.id, newPassword);
  res.json({ ok: true, message: 'Password changed successfully' });
}

// ── List users (admin only) ──────────────────────────────────────────────────
async function getUsers(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  res.json(await listUsers());
}

// ── Create new user (admin only) ─────────────────────────────────────────────
async function createNewUser(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  const { username, display_name, role, tempPassword } = req.body || {};

  if (!username || !display_name || !tempPassword) {
    return res.status(400).json({ error: 'username, display_name and tempPassword are required' });
  }
  if (!/^[a-z0-9_]+$/.test(username.toLowerCase())) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers and underscores' });
  }
  if (tempPassword.length < 8) {
    return res.status(400).json({ error: 'Temporary password must be at least 8 characters' });
  }
  if (!['admin', 'staff'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or staff' });
  }

  try {
    const id = await createUser({ username: username.toLowerCase(), display_name, role, password: tempPassword });
    res.json({ ok: true, id, message: `User "${display_name}" created. They must change their password on first login.` });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
}

// ── Admin reset another user's password ──────────────────────────────────────
async function resetUserPassword(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  const { tempPassword } = req.body || {};
  if (!tempPassword || tempPassword.length < 8) {
    return res.status(400).json({ error: 'tempPassword must be at least 8 characters' });
  }

  const target = await getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  await adminResetPassword(target.id, tempPassword);
  res.json({ ok: true, message: `Password reset for ${target.display_name}. They must change it on next login.` });
}

// ── Deactivate / Activate user (admin only) ───────────────────────────────────
async function deactivateUser(req, res) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  const target = await getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  await setUserActive(target.id, false);
  res.json({ ok: true, message: `${target.display_name} has been deactivated and can no longer log in.` });
}

async function activateUser(req, res) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  const target = await getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  await setUserActive(target.id, true);
  res.json({ ok: true, message: `${target.display_name} has been reactivated.` });
}

module.exports = { login, changeOwnPassword, getUsers, createNewUser, resetUserPassword, deactivateUser, activateUser };