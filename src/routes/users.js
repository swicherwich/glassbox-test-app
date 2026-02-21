const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/users/:id — get user profile (spec: "both")
router.get('/:id', async (req, res) => {
  const user = await db.scalar('SELECT * FROM users WHERE id = $1', [req.params.id]);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.status(200).json(user);
});

// POST /api/users — register user (spec: "both")
router.post('/', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  if (!password) {
    return res.status(400).json({ error: 'password is required' });
  }

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const existing = await db.scalar('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) {
    return res.status(409).json({ error: 'User with this email already exists' });
  }

  await db.execute(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)',
    [email, password, name]
  );

  const user = await db.scalar('SELECT * FROM users WHERE email = $1', [email]);
  res.status(201).json(user);
});

// PUT /api/users/:id — update user profile (spec: "both")
router.put('/:id', async (req, res) => {
  const user = await db.scalar('SELECT * FROM users WHERE id = $1', [req.params.id]);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Unauthorized — token required' });
  }

  const tokenUserId = parseToken(req.headers.authorization);
  if (tokenUserId !== req.params.id && !user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden — can only update own profile' });
  }

  await db.execute(
    'UPDATE users SET name = $1, email = $2 WHERE id = $3',
    [req.body.name || user.name, req.body.email || user.email, req.params.id]
  );

  const updated = await db.scalar('SELECT * FROM users WHERE id = $1', [req.params.id]);
  res.status(200).json(updated);
});

// DELETE /api/users/:id — delete user (admin only) (spec: "both")
router.delete('/:id', async (req, res) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const requestingUser = await getAuthenticatedUser(req.headers.authorization);

  if (!requestingUser.isAdmin) {
    return res.status(403).json({ error: 'Forbidden — admin access required' });
  }

  const target = await db.scalar('SELECT * FROM users WHERE id = $1', [req.params.id]);

  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }

  await db.execute('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.status(204).send();
});

module.exports = router;
