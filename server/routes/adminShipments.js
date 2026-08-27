// Manual shipping today (carrier_code = 'manual'). Structured so a real courier integration
// (Amazon Shipping / Ekart / DTDC) can later populate the same fields from an API instead of
// an admin typing them in — the Orders/Shipments data model itself never has to change.
const express = require('express');
const db = require('../db/init');

const router = express.Router();

router.get('/:orderId', (req, res) => {
  const row = db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(req.params.orderId);
  res.json(row || null);
});

router.post('/:orderId', (req, res) => {
  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { courier, awb, trackingUrl, shippingCost, pickupDate, estimatedDelivery } = req.body || {};
  const existing = db.prepare('SELECT id FROM shipments WHERE order_id = ?').get(req.params.orderId);

  if (existing) {
    db.prepare(`
      UPDATE shipments SET courier=?, awb=?, tracking_url=?, shipping_cost=?, pickup_date=?, estimated_delivery=?,
        status='created', updated_at=datetime('now') WHERE order_id=?
    `).run(courier || null, awb || null, trackingUrl || null, shippingCost || null, pickupDate || null, estimatedDelivery || null, req.params.orderId);
  } else {
    db.prepare(`
      INSERT INTO shipments (order_id, carrier_code, courier, awb, tracking_url, shipping_cost, pickup_date, estimated_delivery, status)
      VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, 'created')
    `).run(req.params.orderId, courier || null, awb || null, trackingUrl || null, shippingCost || null, pickupDate || null, estimatedDelivery || null);
  }

  db.prepare("INSERT INTO order_status_history (order_id, status, note) VALUES (?, 'shipped', ?)")
    .run(req.params.orderId, 'Shipment created' + (awb ? ' — AWB ' + awb : ''));

  res.json(db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(req.params.orderId));
});

router.patch('/:orderId/status', (req, res) => {
  const { status } = req.body || {};
  const valid = ['not_created', 'created', 'picked_up', 'in_transit', 'delivered'];
  if (valid.indexOf(status) === -1) return res.status(400).json({ error: 'Invalid shipment status' });
  const existing = db.prepare('SELECT id FROM shipments WHERE order_id = ?').get(req.params.orderId);
  if (!existing) return res.status(404).json({ error: 'No shipment for this order yet' });
  db.prepare("UPDATE shipments SET status = ?, updated_at = datetime('now') WHERE order_id = ?").run(status, req.params.orderId);
  res.json({ ok: true });
});

module.exports = router;
