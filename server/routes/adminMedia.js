const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/init');
const { UPLOAD_DIR } = require('../db/paths');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM media ORDER BY uploaded_at DESC').all();
  const inUse = new Set(db.prepare('SELECT DISTINCT image_url FROM product_images').all().map((r) => r.image_url));
  res.json(rows.map((r) => ({ id: r.id, url: r.url, filename: r.filename, uploadedAt: r.uploaded_at, inUse: inUse.has(r.url) })));
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Media not found' });

  const inUse = db.prepare('SELECT COUNT(*) AS n FROM product_images WHERE image_url = ?').get(row.url).n;
  if (inUse > 0) {
    return res.status(409).json({ error: 'This image is currently used by a product and cannot be deleted.' });
  }

  db.prepare('DELETE FROM media WHERE id = ?').run(req.params.id);
  const filePath = path.join(UPLOAD_DIR, row.filename);
  fs.unlink(filePath, () => {}); // best-effort; missing file is not an error condition here
  res.json({ ok: true });
});

module.exports = router;
