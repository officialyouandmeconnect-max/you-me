// Public, read-only product endpoints consumed by the customer site (you-and-me-site/script.js).
// Only status = 'active' products are ever returned here — draft products stay invisible to
// customers no matter what the client sends.
const express = require('express');
const db = require('../db/init');
const { serializeProduct } = require('../db/helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare("SELECT * FROM products WHERE status = 'active' ORDER BY id ASC").all();
  res.json(rows.map(serializeProduct));
});

router.get('/:id', (req, res) => {
  const row = db.prepare("SELECT * FROM products WHERE id = ? AND status = 'active'").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(serializeProduct(row));
});

module.exports = router;
