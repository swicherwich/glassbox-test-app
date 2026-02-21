const db = require('../db/database');

async function validateOrderInput(customerId, items, shippingAddress) {
  const errors = [];

  if (!customerId) {
    errors.push('customerId is required');
  }

  if (!items || items.length === 0) {
    errors.push('items array must not be empty');
  }

  if (!shippingAddress) {
    errors.push('shippingAddress is required');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Verify customer exists in DB
  const customer = await db.scalar('SELECT * FROM users WHERE id = $1', [customerId]);
  if (!customer) {
    return { valid: false, errors: ['Customer not found'] };
  }

  // Verify all product IDs exist
  for (const item of items) {
    const product = await db.scalar('SELECT id FROM products WHERE id = $1', [item.productId]);
    if (!product) {
      errors.push(`Product ${item.productId} not found`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, customer };
}

async function validateProductInput(name, sku, price) {
  const errors = [];

  if (!name) {
    errors.push('name is required');
  }

  if (!sku) {
    errors.push('sku is required');
  }

  if (!price || price <= 0) {
    errors.push('price must be a positive number');
  }

  // Check SKU uniqueness
  const existing = await db.scalar('SELECT id FROM products WHERE sku = $1', [sku]);
  if (existing) {
    return { valid: false, errors: ['Product with this SKU already exists'], conflict: true };
  }

  return { valid: errors.length === 0, errors };
}

async function validateUserInput(email, password, name) {
  const errors = [];

  if (!email) {
    errors.push('email is required');
  }

  if (!password) {
    errors.push('password is required');
  }

  if (!name) {
    errors.push('name is required');
  }

  // Check email uniqueness
  const existing = await db.scalar('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) {
    return { valid: false, errors: ['User with this email already exists'], conflict: true };
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateOrderInput,
  validateProductInput,
  validateUserInput,
};
