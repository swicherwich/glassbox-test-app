const db = require('../db/database');

async function logEvent(eventType, payload) {
  await db.execute(
    'INSERT INTO audit_log (event_type, payload, created_at) VALUES ($1, $2, NOW())',
    [eventType, JSON.stringify(payload)]
  );
}

async function logOrderEvent(orderId, action, details) {
  await auditLogger.logEvent('order', {
    orderId,
    action,
    details,
    timestamp: new Date().toISOString(),
  });
}

async function logInventoryEvent(productId, action, quantityChange) {
  await auditLogger.logEvent('inventory', {
    productId,
    action,
    quantityChange,
    timestamp: new Date().toISOString(),
  });
}

const auditLogger = module.exports = {
  logEvent,
  logOrderEvent,
  logInventoryEvent,
};
