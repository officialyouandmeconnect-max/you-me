// The single most important endpoint in this system: it is what makes the database the
// source of truth for an order, *before* WhatsApp ever opens (per the brief). Prices are
// always recomputed from the database — a tampered client-side price is never trusted.
const express = require('express');
const db = require('../db/init');
const { orderNumberFor, serializeOrder } = require('../db/helpers');

const router = express.Router();
const FREE_SHIPPING_THRESHOLD = 999;
const FLAT_SHIPPING = 80;

function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }

router.post('/', (req, res) => {
  const body = req.body || {};
  const { customer, address, items } = body;

  if (!customer || !isNonEmptyString(customer.name) || !isNonEmptyString(customer.phone)) {
    return res.status(400).json({ error: 'Customer name and phone are required' });
  }
  if (!address || !isNonEmptyString(address.house) || !isNonEmptyString(address.street) ||
      !isNonEmptyString(address.city) || !isNonEmptyString(address.state) || !isNonEmptyString(address.pincode)) {
    return res.status(400).json({ error: 'A complete delivery address is required' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  // Resolve every line item against the database — product must exist & be active, and the
  // requested size/color must have enough stock in that specific variant.
  const resolvedItems = [];
  for (const raw of items) {
    const product = db.prepare("SELECT * FROM products WHERE id = ? AND status = 'active'").get(raw.productId);
    if (!product) return res.status(400).json({ error: 'One of the items in your cart is no longer available.' });

    const variant = db.prepare('SELECT * FROM product_variants WHERE product_id = ? AND size = ? AND color = ?')
      .get(product.id, raw.size, raw.color);
    if (!variant) return res.status(400).json({ error: `${product.name}: size/color combination not found.` });

    const qty = Math.max(1, parseInt(raw.quantity, 10) || 1);
    if (variant.stock < qty) {
      return res.status(409).json({ error: `${product.name} (${raw.size}, ${raw.color}) only has ${variant.stock} left in stock.` });
    }

    const image = db.prepare('SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC LIMIT 1').get(product.id);
    const unitPrice = product.sale_price || product.price;

    resolvedItems.push({
      productId: product.id,
      variantId: variant.id,
      sku: product.sku,
      name: product.name,
      image: image ? image.image_url : null,
      size: raw.size,
      color: raw.color,
      quantity: qty,
      unitPrice,
      totalPrice: unitPrice * qty
    });
  }

  const subtotal = resolvedItems.reduce((sum, it) => sum + it.totalPrice, 0);
  const delivery = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING;
  const discount = 0;
  const total = subtotal + delivery - discount;
  const orderNumber = orderNumberFor();

  db.exec('BEGIN');
  try {
    const orderResult = db.prepare(`
      INSERT INTO orders (order_number, customer_name, phone, email, house, street, landmark, city, state, pincode,
                           subtotal, delivery_charge, discount, total, payment_method, payment_status, order_status)
      VALUES (@order_number, @customer_name, @phone, @email, @house, @street, @landmark, @city, @state, @pincode,
              @subtotal, @delivery_charge, @discount, @total, 'whatsapp', 'pending', 'new')
    `).run({
      order_number: orderNumber,
      customer_name: customer.name.trim(),
      phone: customer.phone.trim(),
      email: customer.email ? customer.email.trim() : null,
      house: address.house.trim(),
      street: address.street.trim(),
      landmark: address.landmark ? address.landmark.trim() : null,
      city: address.city.trim(),
      state: address.state.trim(),
      pincode: address.pincode.trim(),
      subtotal, delivery_charge: delivery, discount, total
    });
    const orderId = orderResult.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, sku, product_name, product_image, size, color, quantity, unit_price, total_price)
      VALUES (@order_id, @product_id, @sku, @product_name, @product_image, @size, @color, @quantity, @unit_price, @total_price)
    `);
    const decrementVariant = db.prepare('UPDATE product_variants SET stock = stock - ? WHERE id = ?');
    const decrementProductStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    resolvedItems.forEach((it) => {
      insertItem.run({
        order_id: orderId, product_id: it.productId, sku: it.sku, product_name: it.name,
        product_image: it.image, size: it.size, color: it.color,
        quantity: it.quantity, unit_price: it.unitPrice, total_price: it.totalPrice
      });
      decrementVariant.run(it.quantity, it.variantId);
      decrementProductStock.run(it.quantity, it.productId);
    });

    db.prepare("INSERT INTO order_status_history (order_id, status, note) VALUES (?, 'new', 'Order received from website')").run(orderId);

    db.exec('COMMIT');

    const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    res.status(201).json(serializeOrder(orderRow));
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Order creation failed:', err);
    res.status(500).json({ error: 'Could not save your order. Please try again.' });
  }
});

module.exports = router;
