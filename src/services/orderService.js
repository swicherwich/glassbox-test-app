const axios = require('axios');
const db = require('../db/database');
const validationService = require('./validationService');
const pricingService = require('./pricingService');
const inventoryService = require('./inventoryService');
const notificationService = require('./notificationService');
const auditLogger = require('../utils/auditLogger');

const INVENTORY_BASE_URL = process.env.INVENTORY_BASE_URL || 'http://localhost:3000';
const PAYMENT_API_URL = process.env.PAYMENT_API_URL || 'https://payments.external.com';

async function listOrders(filters) {
  const orders = await db.query('SELECT * FROM orders ORDER BY created_at DESC');
  return orders;
}

async function getOrderById(id) {
  const order = await db.scalar('SELECT * FROM orders WHERE id = $1', [id]);
  return order;
}

// Deep multi-step flow: validate → pricing → inventory → payment → db → audit → notify
async function createOrder(customerId, items, shippingAddress) {
  // Step 1: validate input (depth +1 → validationService.validateOrderInput → db.scalar)
  const validation = await validationService.validateOrderInput(customerId, items, shippingAddress);
  if (!validation.valid) {
    throw new Error('Validation failed: ' + validation.errors.join(', '));
  }

  // Step 2: calculate pricing (depth +1 → pricingService.calculateTotal → applyDiscount → countEligibleItems → calculateTax)
  const pricing = await pricingService.calculateTotal(items);

  // Step 3: reserve inventory — cross-service call to /api/products/reserve
  const inventoryRes = await axios.post(INVENTORY_BASE_URL + '/api/products/reserve', {
    items: items,
  });

  if (!inventoryRes.data.reserved) {
    const err = new Error('Insufficient stock');
    err.code = 'INSUFFICIENT_STOCK';
    throw err;
  }

  // Step 4: charge payment — external API call → ghost node
  const paymentRes = await axios.post(PAYMENT_API_URL + '/v1/charges', {
    amount: pricing.total,
    customerId: customerId,
    currency: 'usd',
  });

  if (!paymentRes.data.success) {
    const err = new Error('Payment failed');
    err.code = 'PAYMENT_FAILED';
    throw err;
  }

  // Step 5: persist order to database
  await db.execute(
    'INSERT INTO orders (customer_id, items, subtotal, discount, tax, total, shipping_address, payment_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [customerId, JSON.stringify(items), pricing.subtotal, pricing.discount, pricing.tax, pricing.total, shippingAddress, paymentRes.data.paymentId, 'confirmed']
  );

  const order = await db.scalar(
    'SELECT * FROM orders WHERE payment_id = $1',
    [paymentRes.data.paymentId]
  );

  // Step 6: audit trail (depth +1 → auditLogger.logOrderEvent → auditLogger.logEvent → db.execute)
  await auditLogger.logOrderEvent(order.id, 'created', { total: pricing.total });

  // Step 7: send confirmation notification (depth +1 → notificationService → axios.post external)
  await notificationService.sendOrderConfirmation(order, validation.customer);

  return order;
}

async function updateOrderStatus(id, status) {
  await db.execute('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
  const order = await db.scalar('SELECT * FROM orders WHERE id = $1', [id]);

  // Audit trail
  await auditLogger.logOrderEvent(id, 'status_changed', { newStatus: status });

  // Notify customer about status change
  await notificationService.sendStatusUpdate(order);

  return order;
}

async function cancelOrder(id) {
  await db.execute("UPDATE orders SET status = 'cancelled' WHERE id = $1", [id]);

  // Release reserved inventory — cross-service call
  await axios.post(INVENTORY_BASE_URL + '/api/products/release', {
    orderId: id,
  });

  // Refund payment — external API ghost node
  const order = await db.scalar('SELECT * FROM orders WHERE id = $1', [id]);
  await axios.post(PAYMENT_API_URL + '/v1/refunds', {
    paymentId: order.payment_id,
  });

  // Audit trail
  await auditLogger.logOrderEvent(id, 'cancelled', {});

  // Notify customer
  await notificationService.sendStatusUpdate(order);
}

module.exports = {
  listOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  cancelOrder,
};
