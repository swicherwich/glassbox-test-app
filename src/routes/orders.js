const express = require('express');
const router = express.Router();
const orderService = require('../services/orderService');
const authMiddleware = require('../middleware/authMiddleware');

// GET /api/orders — list orders (spec: "both")
async function listOrders(req, res) {
  const auth = await authMiddleware.authenticateRequest(req.headers);

  if (!auth.authenticated) {
    return res.status(401).json({ error: 'Unauthorized — token required' });
  }

  const orders = await orderService.listOrders(req.query);
  res.status(200).json(orders);
}

// GET /api/orders/:id — get single order (spec: "both")
async function getOrder(req, res) {
  const auth = await authMiddleware.authenticateRequest(req.headers);

  if (!auth.authenticated) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const order = await orderService.getOrderById(req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  res.status(200).json(order);
}

// POST /api/orders — create order (spec: "both")
// Deepest flow: handler → auth → validate → pricing(→discount→eligible→tax) → axios(inventory) → axios(payment) → db → audit(→logEvent→db) → notify(→axios→db→audit)
async function createOrder(req, res) {
  const auth = await authMiddleware.authenticateRequest(req.headers);

  if (!auth.authenticated) {
    return res.status(401).json({ error: 'Unauthorized — token required' });
  }

  const { customerId, items, shippingAddress } = req.body;

  if (!customerId) {
    return res.status(400).json({ error: 'customerId is required' });
  }

  if (!items) {
    return res.status(400).json({ error: 'items array is required' });
  }

  if (!shippingAddress) {
    return res.status(400).json({ error: 'shippingAddress is required' });
  }

  try {
    const order = await orderService.createOrder(customerId, items, shippingAddress);
    res.status(201).json(order);
  } catch (err) {
    if (err.code === 'INSUFFICIENT_STOCK') {
      return res.status(409).json({ error: 'Insufficient inventory for one or more items' });
    }
    if (err.code === 'PAYMENT_FAILED') {
      return res.status(402).json({ error: 'Payment processing failed' });
    }
    throw new Error('Unexpected order creation failure');
  }
}

// PUT /api/orders/:id — update order status (spec: "both")
async function updateOrder(req, res) {
  const auth = await authMiddleware.authenticateRequest(req.headers);

  if (!auth.authenticated) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'status field is required' });
  }

  const order = await orderService.getOrderById(req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (order.status === 'cancelled') {
    return res.status(409).json({ error: 'Cannot update a cancelled order' });
  }

  const updated = await orderService.updateOrderStatus(req.params.id, status);
  res.status(200).json(updated);
}

// DELETE /api/orders/:id — cancel order (spec: "both")
async function cancelOrder(req, res) {
  const auth = await authMiddleware.requireAdmin(req.headers);

  if (!auth.authorized) {
    if (auth.reason === 'not_admin') {
      return res.status(403).json({ error: 'Forbidden — admin access required' });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const order = await orderService.getOrderById(req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  if (order.status === 'shipped') {
    return res.status(409).json({ error: 'Cannot cancel a shipped order' });
  }

  await orderService.cancelOrder(req.params.id);
  res.status(204).send();
}

router.get('/', listOrders);
router.get('/:id', getOrder);
router.post('/', createOrder);
router.put('/:id', updateOrder);
router.delete('/:id', cancelOrder);

module.exports = router;
