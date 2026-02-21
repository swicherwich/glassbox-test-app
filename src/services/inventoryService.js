const db = require('../db/database');
const auditLogger = require('../utils/auditLogger');

async function listProducts(filters) {
  const products = await db.query('SELECT * FROM products ORDER BY name');
  return products;
}

async function getProduct(id) {
  const product = await db.scalar('SELECT * FROM products WHERE id = $1', [id]);
  return product;
}

async function getProductBySku(sku) {
  const product = await db.scalar('SELECT * FROM products WHERE sku = $1', [sku]);
  return product;
}

async function createProduct({ name, sku, price, quantity }) {
  await db.execute(
    'INSERT INTO products (name, sku, price, quantity) VALUES ($1, $2, $3, $4)',
    [name, sku, price, quantity || 0]
  );
  const product = await db.scalar('SELECT * FROM products WHERE sku = $1', [sku]);

  // Audit trail (depth +1 → auditLogger.logInventoryEvent → logEvent → db.execute)
  await auditLogger.logInventoryEvent(product.id, 'product_created', quantity || 0);

  return product;
}

async function updateProduct(id, updates) {
  const before = await db.scalar('SELECT quantity FROM products WHERE id = $1', [id]);

  await db.execute(
    'UPDATE products SET name = $1, price = $2, quantity = $3 WHERE id = $4',
    [updates.name, updates.price, updates.quantity, id]
  );

  const product = await db.scalar('SELECT * FROM products WHERE id = $1', [id]);

  // Audit quantity change
  const quantityDelta = (updates.quantity || 0) - (before ? before.quantity : 0);
  await auditLogger.logInventoryEvent(id, 'product_updated', quantityDelta);

  return product;
}

async function reserveStock(items) {
  const failures = [];

  for (const item of items) {
    const product = await db.scalar('SELECT * FROM products WHERE id = $1', [item.productId]);

    if (!product) {
      failures.push({ productId: item.productId, reason: 'Product not found' });
      continue;
    }

    if (product.quantity < item.quantity) {
      failures.push({ productId: item.productId, reason: 'Insufficient stock' });
      continue;
    }

    await db.execute(
      'UPDATE products SET quantity = quantity - $1 WHERE id = $2',
      [item.quantity, item.productId]
    );

    // Audit each reservation
    await auditLogger.logInventoryEvent(item.productId, 'stock_reserved', -item.quantity);
  }

  if (failures.length > 0) {
    return { success: false, failures };
  }

  await db.execute(
    'INSERT INTO reservations (items, status) VALUES ($1, $2)',
    [JSON.stringify(items), 'active']
  );

  const reservation = await db.scalar(
    "SELECT * FROM reservations WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
  );

  return { success: true, reservationId: reservation.id };
}

async function releaseStock(orderId) {
  const reservation = await db.scalar(
    'SELECT * FROM reservations WHERE order_id = $1',
    [orderId]
  );

  if (!reservation) {
    return;
  }

  const items = JSON.parse(reservation.items);
  for (const item of items) {
    await db.execute(
      'UPDATE products SET quantity = quantity + $1 WHERE id = $2',
      [item.quantity, item.productId]
    );
    await auditLogger.logInventoryEvent(item.productId, 'stock_released', item.quantity);
  }

  await db.execute("UPDATE reservations SET status = 'released' WHERE id = $1", [reservation.id]);
}

module.exports = {
  listProducts,
  getProduct,
  getProductBySku,
  createProduct,
  updateProduct,
  reserveStock,
  releaseStock,
};
