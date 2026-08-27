// One-time (idempotent) seed: creates the admin user and migrates the 31 products that used
// to be hardcoded in you-and-me-site/script.js into the database. Safe to re-run — it skips
// anything that already exists.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./init');
const legacyProducts = require('./seed-products-source');

const SUBCATEGORY_LABELS = {
  baby: 'Baby', boys: 'Boys', girls: 'Girls', sets: 'Sets',
  tshirts: 'T-Shirts', dresses: 'Dresses', nightwear: 'Nightwear'
};

function seedAdmin() {
  const existing = db.prepare('SELECT id FROM admin_users LIMIT 1').get();
  if (existing) {
    console.log('Admin user already exists — skipping.');
    return;
  }
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(username, hash);
  console.log('');
  console.log('========================================');
  console.log(' ADMIN LOGIN CREATED');
  console.log(' Username: ' + username);
  console.log(' Password: ' + password);
  console.log(' (save this now — it is only printed once)');
  console.log('========================================');
  console.log('');
}

function seedCategories() {
  const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
  ['kids', 'family', 'couple'].forEach((c) => insertCat.run(c));

  const insertSub = db.prepare('INSERT OR IGNORE INTO subcategories (category, name, label) VALUES (?, ?, ?)');
  Object.keys(SUBCATEGORY_LABELS).forEach((key) => insertSub.run('kids', key, SUBCATEGORY_LABELS[key]));
  insertSub.run('family', 'sets', 'Sets');
  insertSub.run('couple', 'sets', 'Sets');
}

function seedProducts() {
  const already = db.prepare('SELECT COUNT(*) AS n FROM products').get();
  if (already.n > 0) {
    console.log('Products already seeded (' + already.n + ' rows) — skipping.');
    return;
  }

  const insertProduct = db.prepare(`
    INSERT INTO products (sku, name, description, fabric, category, subcategory, price, sale_price, stock, featured, new_arrival, status)
    VALUES (@sku, @name, @description, @fabric, @category, @subcategory, @price, @sale_price, @stock, @featured, @new_arrival, 'active')
  `);
  const insertImage = db.prepare('INSERT INTO product_images (product_id, image_url, sort_order, is_primary) VALUES (?, ?, ?, ?)');
  const insertSize = db.prepare('INSERT INTO product_sizes (product_id, size, sort_order) VALUES (?, ?, ?)');
  const insertColor = db.prepare('INSERT INTO product_colors (product_id, name, hex, sort_order) VALUES (?, ?, ?, ?)');
  const insertVariant = db.prepare('INSERT INTO product_variants (product_id, variant_sku, size, color, stock) VALUES (?, ?, ?, ?, ?)');

  legacyProducts.forEach((p) => {
    const sku = 'YM' + p.id.replace(/^p/, '').padStart(3, '0');
    // A legacy product's price/oldPrice map onto price/sale_price the other way round: the
    // *current* selling price is the "sale" price and the old (struck-through) one is regular.
    const regularPrice = p.oldPrice || p.price;
    const salePrice = p.oldPrice ? p.price : null;

    const result = insertProduct.run({
      sku,
      name: p.name,
      description: p.description || '',
      fabric: p.fabric || '',
      category: p.category,
      subcategory: p.subcategory || null,
      price: regularPrice,
      sale_price: salePrice,
      stock: p.stock || 0,
      featured: p.featured ? 1 : 0,
      new_arrival: p.newArrival ? 1 : 0
    });
    const productId = result.lastInsertRowid;

    (p.images || []).forEach((cls, i) => {
      insertImage.run(productId, 'placeholder:' + cls, i, i === 0 ? 1 : 0);
    });
    (p.sizes || []).forEach((s, i) => insertSize.run(productId, s, i));
    (p.colors || []).forEach((c, i) => insertColor.run(productId, c.name, c.hex, i));

    // No historical per-variant stock exists yet — start every size/color combination at the
    // product's overall stock figure; admin can fine-tune each variant from here.
    (p.sizes || []).forEach((s) => {
      (p.colors || []).forEach((c) => {
        const variantSku = sku + '-' + c.name.toUpperCase().replace(/\s+/g, '') + '-' + s.replace(/\s+/g, '');
        insertVariant.run(productId, variantSku, s, c.name, p.stock || 0);
      });
    });
  });

  console.log('Seeded ' + legacyProducts.length + ' products with images, sizes, colors and variants.');
}

seedAdmin();
seedCategories();
seedProducts();
console.log('Seed complete.');
