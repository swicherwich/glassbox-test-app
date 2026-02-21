const db = require('../db/database');

async function authenticateRequest(headers) {
  const token = headers.authorization;

  if (!token) {
    return { authenticated: false, reason: 'missing_token' };
  }

  const session = await db.scalar(
    'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()',
    [token]
  );

  if (!session) {
    return { authenticated: false, reason: 'invalid_token' };
  }

  const user = await db.scalar('SELECT * FROM users WHERE id = $1', [session.user_id]);

  return { authenticated: true, user };
}

async function requireAdmin(headers) {
  const auth = await authMiddleware.authenticateRequest(headers);

  if (!auth.authenticated) {
    return { authorized: false, reason: auth.reason };
  }

  if (!auth.user.is_admin) {
    return { authorized: false, reason: 'not_admin' };
  }

  return { authorized: true, user: auth.user };
}

const authMiddleware = module.exports = {
  authenticateRequest,
  requireAdmin,
};
