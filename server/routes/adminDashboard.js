const express = require('express');
const db = require('../db/init');

const router = express.Router();

router.get('/', (req, res) => {
  const countBy = (statusCol, value) => db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE ${statusCol} = ?`).get(value).n;
  const totalOrders = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const monthAgo = new Date(Date.now() - 30 * 86400000);
  const countSince = (d) => db.prepare('SELECT COUNT(*) AS n FROM orders WHERE created_at >= ?').get(d.toISOString().slice(0, 19).replace('T', ' ')).n;

  const totalProducts = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  const lowStock = db.prepare('SELECT COUNT(*) AS n FROM products WHERE stock > 0 AND stock <= 5').get().n;
  const outOfStock = db.prepare('SELECT COUNT(*) AS n FROM products WHERE stock <= 0').get().n;

  // Revenue only ever counts orders the admin has actually marked Paid — placing an order
  // (payment_status = 'pending') must never move this number. See routes/adminOrders.js
  // PATCH /:id/payment for the only place payment_status changes.
  const paidRevenue = db.prepare("SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE payment_status = 'paid'").get().n;
  const pendingRevenue = db.prepare("SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE payment_status = 'pending'").get().n;
  const totalCustomers = db.prepare('SELECT COUNT(DISTINCT phone) AS n FROM orders').get().n;

  const recent = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 8').all().map((row) => {
    const firstItem = db.prepare('SELECT product_name, product_image FROM order_items WHERE order_id = ? LIMIT 1').get(row.id);
    return {
      id: row.id,
      orderNumber: row.order_number,
      customerName: row.customer_name,
      thumbnail: firstItem ? firstItem.product_image : null,
      total: row.total,
      paymentStatus: row.payment_status,
      orderStatus: row.order_status,
      createdAt: row.created_at
    };
  });

  res.json({
    orders: {
      total: totalOrders,
      new: countBy('order_status', 'new'),
      confirmed: countBy('order_status', 'confirmed'),
      packing: countBy('order_status', 'packing'),
      shipped: countBy('order_status', 'shipped'),
      delivered: countBy('order_status', 'delivered'),
      cancelled: countBy('order_status', 'cancelled'),
      today: countSince(today),
      thisWeek: countSince(weekAgo),
      thisMonth: countSince(monthAgo)
    },
    products: {
      total: totalProducts,
      lowStock,
      outOfStock
    },
    revenue: {
      paid: paidRevenue,
      pending: pendingRevenue
    },
    customers: {
      total: totalCustomers
    },
    recentOrders: recent
  });
});

module.exports = router;
