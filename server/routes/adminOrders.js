const express = require('express');
const db = require('../db/init');
const { serializeOrder } = require('../db/helpers');

const router = express.Router();

const VALID_ORDER_STATUSES = ['new', 'confirmed', 'packing', 'ready_to_ship', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];
const VALID_PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

router.get('/', (req, res) => {
  const { status, payment, q, since } = req.query;
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (status && status !== 'all') { sql += ' AND order_status = ?'; params.push(status); }
  if (payment && payment !== 'all') { sql += ' AND payment_status = ?'; params.push(payment); }
  if (q) {
    sql += ' AND (order_number LIKE ? OR customer_name LIKE ? OR phone LIKE ?)';
    const like = '%' + q + '%';
    params.push(like, like, like);
  }
  if (since) { sql += ' AND created_at > ?'; params.push(since); }
  sql += ' ORDER BY created_at DESC';

  const rows = db.prepare(sql).all(...params);
  const orders = rows.map((row) => {
    const items = db.prepare('SELECT product_name, product_image, quantity FROM order_items WHERE order_id = ?').all(row.id);
    return {
      id: row.id,
      orderNumber: row.order_number,
      customerName: row.customer_name,
      phone: row.phone,
      itemCount: items.reduce((s, it) => s + it.quantity, 0),
      thumbnails: items.slice(0, 3).map((it) => it.product_image),
      total: row.total,
      paymentStatus: row.payment_status,
      orderStatus: row.order_status,
      createdAt: row.created_at
    };
  });
  res.json(orders);
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM orders WHERE id = ? OR order_number = ?').get(req.params.id, req.params.id);
  if (!row) return res.status(404).json({ error: 'Order not found' });
  res.json(serializeOrder(row));
});

router.patch('/:id/status', (req, res) => {
  const { status, note } = req.body || {};
  if (VALID_ORDER_STATUSES.indexOf(status) === -1) return res.status(400).json({ error: 'Invalid order status' });
  const existing = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  db.prepare("UPDATE orders SET order_status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  db.prepare('INSERT INTO order_status_history (order_id, status, note) VALUES (?, ?, ?)').run(req.params.id, status, note || null);
  res.json(serializeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)));
});

router.patch('/:id/payment', (req, res) => {
  const { paymentStatus, paymentReference, paymentNotes } = req.body || {};
  if (VALID_PAYMENT_STATUSES.indexOf(paymentStatus) === -1) return res.status(400).json({ error: 'Invalid payment status' });
  const existing = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  const paidAt = paymentStatus === 'paid' ? new Date().toISOString() : null;
  db.prepare(`
    UPDATE orders SET payment_status = ?, payment_reference = ?, payment_notes = ?, paid_at = COALESCE(?, paid_at), updated_at = datetime('now')
    WHERE id = ?
  `).run(paymentStatus, paymentReference || null, paymentNotes || null, paidAt, req.params.id);

  db.prepare('INSERT INTO order_status_history (order_id, status, note) VALUES (?, ?, ?)')
    .run(req.params.id, 'payment_' + paymentStatus, paymentNotes || null);

  res.json(serializeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)));
});

module.exports = router;
