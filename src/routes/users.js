const express = require('express');
const router = express.Router();
const db = require('../db/database');
const authMiddleware = require('../middleware/authMiddleware');
const validationService = require('../services/validationService');
const notificationService = require('../services/notificationService');
const auditLogger = require('../utils/auditLogger');

// GET /api/users/:id — get user profile (spec: "both")
async function getUser(req, res) {
  const auth = await authMiddleware.authenticateRequest(req.headers);

  if (!auth.authenticated) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const user = await db.scalar('SELECT * FROM users WHERE id = $1', [req.params.id]);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.status(200).json(user);
}

// POST /api/users — register user (spec: "both")
// Flow: validate → db.execute → db.scalar → notify(→axios→db) → audit
async function registerUser(req, res) {
  const { email, password, name } = req.body;

  const validation = await validationService.validateUserInput(email, password, name);

  if (!validation.valid) {
    if (validation.conflict) {
      return res.status(409).json({ error: validation.errors[0] });
    }
    return res.status(400).json({ error: validation.errors.join(', ') });
  }

  await db.execute(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)',
    [email, password, name]
  );

  const user = await db.scalar('SELECT * FROM users WHERE email = $1', [email]);

  // Send welcome email (depth +1 → notificationService → axios → db)
  await notificationService.sendWelcomeEmail(user);

  // Audit trail
  await auditLogger.logEvent('user_registered', { userId: user.id, email });

  res.status(201).json(user);
}

// PUT /api/users/:id — update user profile (spec: "both")
async function updateUser(req, res) {
  const auth = await authMiddleware.authenticateRequest(req.headers);

  if (!auth.authenticated) {
    return res.status(401).json({ error: 'Unauthorized — token required' });
  }

  const user = await db.scalar('SELECT * FROM users WHERE id = $1', [req.params.id]);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (auth.user.id !== req.params.id && !auth.user.is_admin) {
    return res.status(403).json({ error: 'Forbidden — can only update own profile' });
  }

  await db.execute(
    'UPDATE users SET name = $1, email = $2 WHERE id = $3',
    [req.body.name || user.name, req.body.email || user.email, req.params.id]
  );

  const updated = await db.scalar('SELECT * FROM users WHERE id = $1', [req.params.id]);

  await auditLogger.logEvent('user_updated', { userId: req.params.id });

  res.status(200).json(updated);
}

// DELETE /api/users/:id — delete user (admin only) (spec: "both")
async function deleteUser(req, res) {
  const auth = await authMiddleware.requireAdmin(req.headers);

  if (!auth.authorized) {
    if (auth.reason === 'not_admin') {
      return res.status(403).json({ error: 'Forbidden — admin access required' });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const target = await db.scalar('SELECT * FROM users WHERE id = $1', [req.params.id]);

  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }

  await db.execute('DELETE FROM users WHERE id = $1', [req.params.id]);

  await auditLogger.logEvent('user_deleted', { userId: req.params.id, deletedBy: auth.user.id });

  res.status(204).send();
}

router.get('/:id', getUser);
router.post('/', registerUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

module.exports = router;
