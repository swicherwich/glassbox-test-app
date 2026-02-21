const axios = require('axios');
const db = require('../db/database');

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

// Multi-step flow: validate → db.query(customer) → axios.post(inventory) → axios.post(payment) → db.execute(insert)
async function createOrder(customerId, items, shippingAddress) {
  // Step 1: verify customer exists
  const customer = await db.scalar('SELECT * FROM users WHERE id = $1', [customerId]);
  if (!customer) {
    throw new Error('Customer not found');
  }

  // Step 2: calculate totals
  const total = await calculateOrderTotal(items);

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
    amount: total,
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
    'INSERT INTO orders (customer_id, items, total, shipping_address, payment_id, status) VALUES ($1, $2, $3, $4, $5, $6)',
    [customerId, JSON.stringify(items), total, shippingAddress, paymentRes.data.paymentId, 'confirmed']
  );

  const order = await db.scalar(
    'SELECT * FROM orders WHERE payment_id = $1',
    [paymentRes.data.paymentId]
  );

  // Step 6: send confirmation — gap node (dynamicHandler is not defined anywhere)
  await sendOrderConfirmation(order);

  return order;
}

async function updateOrderStatus(id, status) {
  await db.execute('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
  const order = await db.scalar('SELECT * FROM orders WHERE id = $1', [id]);

  // Notify customer about status change — calls notificationService
  const notificationService = require('./notificationService');
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
}

// Gap node: this function is called but never defined in any file
async function sendOrderConfirmation(order) {
  await dynamicHandler('email', order);
}

// Local helper — resolved normally
async function calculateOrderTotal(items) {
  let total = 0;
  for (const item of items) {
    const product = await db.scalar('SELECT price FROM products WHERE id = $1', [item.productId]);
    total += product.price * item.quantity;
  }
  return total;
}

module.exports = {
  listOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
  cancelOrder,
};
