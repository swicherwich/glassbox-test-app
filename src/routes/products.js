const express = require('express');
const router = express.Router();
const inventoryService = require('../services/inventoryService');

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
router.post('/', async (req, res) => {
  const { name, sku, price, quantity } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  if (!sku) {
    return res.status(400).json({ error: 'sku is required' });
  }

  if (!price) {
    return res.status(400).json({ error: 'price is required' });
  }

  const existing = await inventoryService.getProductBySku(sku);
  if (existing) {
    return res.status(409).json({ error: 'Product with this SKU already exists' });
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
  const product = await inventoryService.getProduct(req.params.id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const updated = await inventoryService.updateProduct(req.params.id, req.body);
  res.status(200).json(updated);
});

module.exports = router;
