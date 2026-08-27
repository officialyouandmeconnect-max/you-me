const express = require('express');
const db = require('../db/init');
const { serializeProduct } = require('../db/helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY updated_at DESC').all();
  res.json(rows.map(serializeProduct));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(serializeProduct(row));
});

function saveVariants(productId, sizes, colors, existingVariants) {
  const existingBySizeColor = {};
  (existingVariants || []).forEach((v) => { existingBySizeColor[v.size + '|' + v.color] = v; });

  const skuRow = db.prepare('SELECT sku FROM products WHERE id = ?').get(productId);
  const sku = skuRow.sku;

  const keepIds = [];
  const insertVariant = db.prepare('INSERT INTO product_variants (product_id, variant_sku, size, color, stock) VALUES (?, ?, ?, ?, ?)');
  const updateStock = db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?');

  sizes.forEach((size) => {
    colors.forEach((color) => {
      const key = size + '|' + color.name;
      const existing = existingBySizeColor[key];
      if (existing) {
        keepIds.push(existing.id);
        // Preserve stock the admin already set for this combination unless they explicitly changed it
        // via the dedicated inventory endpoint — creating/editing the product itself doesn't reset stock.
      } else {
        const variantSku = sku + '-' + color.name.toUpperCase().replace(/\s+/g, '') + '-' + size.replace(/\s+/g, '');
        const result = insertVariant.run(productId, variantSku, size, color.name, 0);
        keepIds.push(Number(result.lastInsertRowid));
      }
    });
  });

  // Remove variants for size/color combinations no longer offered.
  const allVariantIds = db.prepare('SELECT id FROM product_variants WHERE product_id = ?').all(productId).map((r) => r.id);
  const toDelete = allVariantIds.filter((id) => keepIds.indexOf(id) === -1);
  if (toDelete.length) {
    const del = db.prepare('DELETE FROM product_variants WHERE id = ?');
    toDelete.forEach((id) => del.run(id));
  }
}

function writeProductFields(productId, body) {
  db.prepare(`
    UPDATE products SET name=@name, description=@description, fabric=@fabric, category=@category,
      subcategory=@subcategory, age_group=@age_group, price=@price, sale_price=@sale_price,
      featured=@featured, new_arrival=@new_arrival, status=@status, updated_at=datetime('now')
    WHERE id=@id
  `).run({
    id: productId,
    name: body.name,
    description: body.description || '',
    fabric: body.fabric || '',
    category: body.category,
    subcategory: body.subcategory || null,
    age_group: body.ageGroup || null,
    price: Number(body.price),
    sale_price: body.salePrice ? Number(body.salePrice) : null,
    featured: body.featured ? 1 : 0,
    new_arrival: body.newArrival ? 1 : 0,
    status: body.status === 'draft' ? 'draft' : 'active'
  });

  db.prepare('DELETE FROM product_sizes WHERE product_id = ?').run(productId);
  const insertSize = db.prepare('INSERT INTO product_sizes (product_id, size, sort_order) VALUES (?, ?, ?)');
  (body.sizes || []).forEach((s, i) => insertSize.run(productId, s, i));

  db.prepare('DELETE FROM product_colors WHERE product_id = ?').run(productId);
  const insertColor = db.prepare('INSERT INTO product_colors (product_id, name, hex, sort_order) VALUES (?, ?, ?, ?)');
  (body.colors || []).forEach((c, i) => insertColor.run(productId, c.name, c.hex, i));

  const existingVariants = db.prepare('SELECT id, size, color FROM product_variants WHERE product_id = ?').all(productId);
  saveVariants(productId, body.sizes || [], body.colors || [], existingVariants);

  if (Array.isArray(body.images)) {
    db.prepare('DELETE FROM product_images WHERE product_id = ?').run(productId);
    const insertImage = db.prepare('INSERT INTO product_images (product_id, image_url, sort_order, is_primary) VALUES (?, ?, ?, ?)');
    body.images.forEach((url, i) => insertImage.run(productId, url, i, i === 0 ? 1 : 0));
  }
}

router.post('/', (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.sku || !body.category || !body.price) {
    return res.status(400).json({ error: 'Name, SKU, category and price are required' });
  }
  const dupe = db.prepare('SELECT id FROM products WHERE sku = ?').get(body.sku);
  if (dupe) return res.status(409).json({ error: 'A product with this SKU already exists' });

  try {
    const result = db.prepare(`
      INSERT INTO products (sku, name, description, fabric, category, subcategory, age_group, price, sale_price, stock, featured, new_arrival, status)
      VALUES (@sku, @name, @description, @fabric, @category, @subcategory, @age_group, @price, @sale_price, 0, @featured, @new_arrival, @status)
    `).run({
      sku: body.sku,
      name: body.name,
      description: body.description || '',
      fabric: body.fabric || '',
      category: body.category,
      subcategory: body.subcategory || null,
      age_group: body.ageGroup || null,
      price: Number(body.price),
      sale_price: body.salePrice ? Number(body.salePrice) : null,
      featured: body.featured ? 1 : 0,
      new_arrival: body.newArrival ? 1 : 0,
      status: body.status === 'draft' ? 'draft' : 'active'
    });
    const productId = result.lastInsertRowid;
    writeProductFields(productId, body);

    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    res.status(201).json(serializeProduct(row));
  } catch (err) {
    console.error('Create product failed:', err);
    res.status(500).json({ error: 'Could not create product' });
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  try {
    writeProductFields(req.params.id, req.body || {});
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    // Keep the overall stock figure in sync with the sum of its variants.
    const total = db.prepare('SELECT COALESCE(SUM(stock),0) AS n FROM product_variants WHERE product_id = ?').get(req.params.id).n;
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(total, req.params.id);
    res.json(serializeProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)));
  } catch (err) {
    console.error('Update product failed:', err);
    res.status(500).json({ error: 'Could not update product' });
  }
});

router.patch('/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (status !== 'active' && status !== 'draft') return res.status(400).json({ error: 'status must be active or draft' });
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  db.prepare("UPDATE products SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  res.json({ ok: true, status });
});

router.patch('/:id/variant-stock', (req, res) => {
  const { variantId, stock } = req.body || {};
  const variant = db.prepare('SELECT * FROM product_variants WHERE id = ? AND product_id = ?').get(variantId, req.params.id);
  if (!variant) return res.status(404).json({ error: 'Variant not found' });
  db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?').run(Math.max(0, Number(stock) || 0), variantId);
  const total = db.prepare('SELECT COALESCE(SUM(stock),0) AS n FROM product_variants WHERE product_id = ?').get(req.params.id).n;
  db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(total, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const usedInOrders = db.prepare('SELECT COUNT(*) AS n FROM order_items WHERE product_id = ?').get(req.params.id).n;
  if (usedInOrders > 0) {
    // Never hard-delete a product that appears in past orders — order history must stay intact
    // (order_items already snapshots the name/image, but keep the product row for admin reference).
    db.prepare("UPDATE products SET status = 'draft', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    return res.json({ ok: true, softDeleted: true, reason: 'Product appears in past orders — set to draft instead of deleted.' });
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true, softDeleted: false });
});

router.post('/:id/duplicate', (req, res) => {
  const original = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!original) return res.status(404).json({ error: 'Product not found' });

  let newSku = original.sku + '-COPY';
  let n = 2;
  while (db.prepare('SELECT id FROM products WHERE sku = ?').get(newSku)) {
    newSku = original.sku + '-COPY' + n;
    n++;
  }

  const result = db.prepare(`
    INSERT INTO products (sku, name, description, fabric, category, subcategory, age_group, price, sale_price, stock, featured, new_arrival, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'draft')
  `).run(newSku, original.name + ' (Copy)', original.description, original.fabric, original.category,
    original.subcategory, original.age_group, original.price, original.sale_price);
  const newId = result.lastInsertRowid;

  db.prepare('SELECT image_url, sort_order, is_primary FROM product_images WHERE product_id = ?').all(original.id).forEach((img) => {
    db.prepare('INSERT INTO product_images (product_id, image_url, sort_order, is_primary) VALUES (?, ?, ?, ?)').run(newId, img.image_url, img.sort_order, img.is_primary);
  });
  db.prepare('SELECT size, sort_order FROM product_sizes WHERE product_id = ?').all(original.id).forEach((s) => {
    db.prepare('INSERT INTO product_sizes (product_id, size, sort_order) VALUES (?, ?, ?)').run(newId, s.size, s.sort_order);
  });
  db.prepare('SELECT name, hex, sort_order FROM product_colors WHERE product_id = ?').all(original.id).forEach((c) => {
    db.prepare('INSERT INTO product_colors (product_id, name, hex, sort_order) VALUES (?, ?, ?, ?)').run(newId, c.name, c.hex, c.sort_order);
  });
  db.prepare('SELECT size, color FROM product_variants WHERE product_id = ?').all(original.id).forEach((v) => {
    const variantSku = newSku + '-' + v.color.toUpperCase().replace(/\s+/g, '') + '-' + v.size.replace(/\s+/g, '');
    db.prepare('INSERT INTO product_variants (product_id, variant_sku, size, color, stock) VALUES (?, ?, ?, ?, 0)').run(newId, variantSku, v.size, v.color);
  });

  res.status(201).json(serializeProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(newId)));
});

module.exports = router;
