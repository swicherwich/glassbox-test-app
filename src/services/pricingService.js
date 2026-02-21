const db = require('../db/database');

async function calculateTotal(items) {
  let subtotal = 0;

  for (const item of items) {
    const product = await db.scalar('SELECT price FROM products WHERE id = $1', [item.productId]);
    subtotal += product.price * item.quantity;
  }

  const discount = await pricingService.applyDiscount(subtotal, items);
  const tax = await pricingService.calculateTax(subtotal - discount);

  return {
    subtotal,
    discount,
    tax,
    total: subtotal - discount + tax,
  };
}

async function applyDiscount(subtotal, items) {
  // Look up active promotions
  const promo = await db.scalar(
    'SELECT * FROM promotions WHERE active = true AND min_amount <= $1 ORDER BY discount_pct DESC LIMIT 1',
    [subtotal]
  );

  if (!promo) {
    return 0;
  }

  // Check if promo applies to any items in the cart
  const eligibleCount = await pricingService.countEligibleItems(items, promo.id);

  if (eligibleCount === 0) {
    return 0;
  }

  return subtotal * (promo.discount_pct / 100);
}

async function countEligibleItems(items, promoId) {
  let count = 0;

  for (const item of items) {
    const eligible = await db.scalar(
      'SELECT 1 FROM promotion_products WHERE promotion_id = $1 AND product_id = $2',
      [promoId, item.productId]
    );
    if (eligible) {
      count += item.quantity;
    }
  }

  return count;
}

async function calculateTax(amount) {
  const taxRate = await db.scalar('SELECT rate FROM tax_rates WHERE region = $1', ['default']);
  return amount * (taxRate ? taxRate.rate : 0.1);
}

const pricingService = module.exports = {
  calculateTotal,
  applyDiscount,
  countEligibleItems,
  calculateTax,
};
