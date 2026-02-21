const axios = require('axios');

const NOTIFICATION_API_URL = process.env.NOTIFICATION_API_URL || 'https://notify.external.com';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/xxx';

// Ghost nodes: all calls here target external services

async function sendStatusUpdate(order) {
  // External email API → ghost node (NOTIFICATION_API_URL)
  await axios.post(NOTIFICATION_API_URL + '/v1/email', {
    to: order.customer_email,
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
}

async function sendWelcomeEmail(user) {
  // External email API → ghost node (NOTIFICATION_API_URL)
  await axios.post(NOTIFICATION_API_URL + '/v1/email', {
    to: user.email,
    template: 'welcome',
    data: { name: user.name },
  });
}

async function sendShippingNotification(order, trackingNumber) {
  // External SMS API → ghost node (NOTIFICATION_API_URL)
  await axios.post(NOTIFICATION_API_URL + '/v1/sms', {
    to: order.customer_phone,
    message: `Your order ${order.id} has shipped! Tracking: ${trackingNumber}`,
  });

  // Also send email
  await axios.post(NOTIFICATION_API_URL + '/v1/email', {
    to: order.customer_email,
    template: 'shipping_confirmation',
    data: { orderId: order.id, trackingNumber },
  });
}

module.exports = {
  sendStatusUpdate,
  sendWelcomeEmail,
  sendShippingNotification,
};
