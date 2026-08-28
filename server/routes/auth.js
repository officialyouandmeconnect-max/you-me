// One login for the whole site — customers and admins both authenticate here. `role` decides
// where the caller lands (the frontend redirects to /account or /admin), but the *authority*
// on role is always this server + the users table, never anything the client claims.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/init');

const router = express.Router();

function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }
function isValidEmail(v) { return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

function publicUser(row) {
  return { email: row.email, name: row.name, role: row.role };
}

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidEmail(email) || !isNonEmptyString(password)) {
    return res.status(400).json({ error: 'A valid email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.email = user.email;
  req.session.name = user.name;
  res.json({ ok: true, user: publicUser(user) });
});

// Customer self-signup only — this is the ONLY way a new account is created through the public
// API, and it can never create anything but role = 'customer'. Admin accounts are provisioned
// directly in the database (see db/seed.js), not through this endpoint.
router.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!isNonEmptyString(name)) return res.status(400).json({ error: 'Full name is required' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (!isNonEmptyString(password) || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const normalizedEmail = email.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'customer')")
    .run(normalizedEmail, hash, name.trim());

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.email = user.email;
  req.session.name = user.name;
  res.status(201).json({ ok: true, user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/session', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ authenticated: true, user: { email: req.session.email, name: req.session.name, role: req.session.role } });
  }
  res.json({ authenticated: false });
});

module.exports = router;
