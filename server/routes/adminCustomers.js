// Customers are derived from orders (grouped by phone) rather than a separate signup system —
// this store has no customer accounts, only WhatsApp-confirmed orders.
const express = require('express');
const db = require('../db/init');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT phone, customer_name AS name, email,
           COUNT(*) AS order_count, SUM(total) AS total_value, MAX(created_at) AS last_order_at
    FROM orders
    GROUP BY phone
    ORDER BY last_order_at DESC
  `).all();
  res.json(rows.map((r) => ({
    phone: r.phone, name: r.name, email: r.email,
    orderCount: r.order_count, totalValue: r.total_value, lastOrderAt: r.last_order_at
  })));
});

router.get('/:phone', (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE phone = ? ORDER BY created_at DESC').all(req.params.phone);
  if (orders.length === 0) return res.status(404).json({ error: 'No orders found for this phone number' });

  const addresses = [];
  const seen = new Set();
  orders.forEach((o) => {
    const key = [o.house, o.street, o.city, o.pincode].join('|');
    if (!seen.has(key)) { seen.add(key); addresses.push({ house: o.house, street: o.street, landmark: o.landmark, city: o.city, state: o.state, pincode: o.pincode }); }
  });

  res.json({
    phone: req.params.phone,
    name: orders[0].customer_name,
    email: orders[0].email,
    orderCount: orders.length,
    totalValue: orders.reduce((s, o) => s + o.total, 0),
    addresses,
    orders: orders.map((o) => ({
      id: o.id, orderNumber: o.order_number, total: o.total,
      orderStatus: o.order_status, paymentStatus: o.payment_status, createdAt: o.created_at
    }))
  });
});

module.exports = router;
