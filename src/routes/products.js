const express = require('express');
const router = express.Router();
const inventoryService = require('../services/inventoryService');
const validationService = require('../services/validationService');
const authMiddleware = require('../middleware/authMiddleware');

// GET /api/products — list products (spec: "both")
router.get('/', async (req, res) => {
  const products = await inventoryService.listProducts(req.query);
  res.status(200).json(products);
});

// GET /api/products/:id — get single product (spec: "both")
router.get('/:id', async (req, res) => {
  const product = await inventoryService.getProduct(req.params.id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.status(200).json(product);
});

// POST /api/products — create product (admin only) (spec: "both")
// Flow: auth → validate → inventoryService.createProduct → db → audit
router.post('/', async (req, res) => {
  const auth = await authMiddleware.requireAdmin(req.headers);

  if (!auth.authorized) {
    if (auth.reason === 'not_admin') {
      return res.status(403).json({ error: 'Forbidden — admin access required' });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { name, sku, price, quantity } = req.body;

  const validation = await validationService.validateProductInput(name, sku, price);

  if (!validation.valid) {
    if (validation.conflict) {
      return res.status(409).json({ error: validation.errors[0] });
    }
    return res.status(400).json({ error: validation.errors.join(', ') });
  }

  const product = await inventoryService.createProduct({ name, sku, price, quantity });
  res.status(201).json(product);
});

// POST /api/products/reserve — reserve inventory for an order (cross-service target)
router.post('/reserve', async (req, res) => {
  const { items } = req.body;

  if (!items) {
    return res.status(400).json({ error: 'items array is required' });
  }

  const result = await inventoryService.reserveStock(items);

  if (!result.success) {
    return res.status(409).json({ error: 'Insufficient stock', details: result.failures });
  }

  res.status(200).json({ reserved: true, reservationId: result.reservationId });
});

// PUT /api/products/:id — update product (spec: "both")
router.put('/:id', async (req, res) => {
  const auth = await authMiddleware.requireAdmin(req.headers);

  if (!auth.authorized) {
    if (auth.reason === 'not_admin') {
      return res.status(403).json({ error: 'Forbidden — admin access required' });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const product = await inventoryService.getProduct(req.params.id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const updated = await inventoryService.updateProduct(req.params.id, req.body);
  res.status(200).json(updated);
});

module.exports = router;
