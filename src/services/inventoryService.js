const db = require('../db/database');

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
  return product;
}

async function updateProduct(id, updates) {
  await db.execute(
    'UPDATE products SET name = $1, price = $2, quantity = $3 WHERE id = $4',
    [updates.name, updates.price, updates.quantity, id]
  );
  const product = await db.scalar('SELECT * FROM products WHERE id = $1', [id]);
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
  }

  if (failures.length > 0) {
    return { success: false, failures };
  }

  // Gap node: generateReservationId is not defined in any file
  const reservationId = generateReservationId();

  await db.execute(
    'INSERT INTO reservations (id, items, status) VALUES ($1, $2, $3)',
    [reservationId, JSON.stringify(items), 'active']
  );

  // Gap node: auditLog is not defined in any file
  await auditLog('inventory_reserved', { reservationId, items });

  return { success: true, reservationId };
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
