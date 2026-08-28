const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db/init');
const { UPLOAD_DIR } = require('../db/paths');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomBytes(10).toString('hex') + ext);
  }
});

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.indexOf(file.mimetype) === -1) return cb(new Error('Only JPG, PNG, WEBP or GIF images are allowed'));
    cb(null, true);
  }
});

router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const url = '/uploads/' + req.file.filename;
  db.prepare('INSERT INTO media (url, filename) VALUES (?, ?)').run(url, req.file.filename);
  res.status(201).json({ url });
});

// Multer errors (bad type, too large) land here instead of crashing the request.
router.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
  next();
});

module.exports = router;
