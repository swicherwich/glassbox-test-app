const axios = require('axios');
const db = require('../db/database');
const auditLogger = require('../utils/auditLogger');

const NOTIFICATION_API_URL = process.env.NOTIFICATION_API_URL || 'https://notify.external.com';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/xxx';

async function sendOrderConfirmation(order, customer) {
  // External email API → ghost node (NOTIFICATION_API_URL)
  await axios.post(NOTIFICATION_API_URL + '/v1/email', {
    to: customer.email,
    template: 'order_confirmation',
    data: {
      orderId: order.id,
      total: order.total,
      items: order.items,
    },
  });

  // Record notification in DB
  await db.execute(
    'INSERT INTO notifications (type, recipient, order_id, sent_at) VALUES ($1, $2, $3, NOW())',
    ['order_confirmation', customer.email, order.id]
  );

  await auditLogger.logOrderEvent(order.id, 'confirmation_sent', { email: customer.email });
}

async function sendStatusUpdate(order) {
  // Look up customer email
  const customer = await db.scalar('SELECT * FROM users WHERE id = $1', [order.customer_id]);

  // External email API → ghost node (NOTIFICATION_API_URL)
  await axios.post(NOTIFICATION_API_URL + '/v1/email', {
    to: customer.email,
    template: 'order_status_update',
    data: {
      orderId: order.id,
      status: order.status,
    },
  });

  // Slack webhook for internal alerts → ghost node (SLACK_WEBHOOK_URL)
  if (order.status === 'cancelled' || order.status === 'refunded') {
    await axios.post(SLACK_WEBHOOK_URL, {
      text: `Order ${order.id} was ${order.status}`,
    });
  }

  await db.execute(
    'INSERT INTO notifications (type, recipient, order_id, sent_at) VALUES ($1, $2, $3, NOW())',
    ['status_update', customer.email, order.id]
  );
}

async function sendWelcomeEmail(user) {
  // External email API → ghost node (NOTIFICATION_API_URL)
  await axios.post(NOTIFICATION_API_URL + '/v1/email', {
    to: user.email,
    template: 'welcome',
    data: { name: user.name },
  });

  await db.execute(
    'INSERT INTO notifications (type, recipient, sent_at) VALUES ($1, $2, NOW())',
    ['welcome', user.email]
  );
}

async function sendShippingNotification(order, trackingNumber) {
  const customer = await db.scalar('SELECT * FROM users WHERE id = $1', [order.customer_id]);

  // External SMS API → ghost node (NOTIFICATION_API_URL)
  await axios.post(NOTIFICATION_API_URL + '/v1/sms', {
    to: customer.phone,
    message: `Your order ${order.id} has shipped! Tracking: ${trackingNumber}`,
  });

  // Also send email
  await axios.post(NOTIFICATION_API_URL + '/v1/email', {
    to: customer.email,
    template: 'shipping_confirmation',
    data: { orderId: order.id, trackingNumber },
  });

  await db.execute(
    'INSERT INTO notifications (type, recipient, order_id, sent_at) VALUES ($1, $2, $3, NOW())',
    ['shipping', customer.email, order.id]
  );

  await auditLogger.logOrderEvent(order.id, 'shipping_notification_sent', { trackingNumber });
}

module.exports = {
  sendOrderConfirmation,
  sendStatusUpdate,
  sendWelcomeEmail,
  sendShippingNotification,
};
