// backend/src/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_EXPIRES = '7d';

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// POST /auth/signup
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.length) {
    return res.status(409).json({ error: 'Email already in use' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await query(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
    [email.toLowerCase(), passwordHash]
  );

  const user = rows[0];
  const token = generateToken(user);

  res.status(201).json({ token, user: { id: user.id, email: user.email } });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!rows.length) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken(user);
  res.json({ token, user: { id: user.id, email: user.email } });
});

// GET /auth/me
router.get('/me', authMiddleware, async (req, res) => {
  const { rows } = await query('SELECT id, email, created_at FROM users WHERE id = $1', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json({ user: rows[0] });
});

module.exports = router;
