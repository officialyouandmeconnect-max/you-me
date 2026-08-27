const db = require('./init');

function serializeProduct(row) {
  const images = db.prepare('SELECT image_url, is_primary FROM product_images WHERE product_id = ? ORDER BY sort_order ASC').all(row.id);
  const sizes = db.prepare('SELECT size FROM product_sizes WHERE product_id = ? ORDER BY sort_order ASC').all(row.id).map((r) => r.size);
  const colors = db.prepare('SELECT name, hex FROM product_colors WHERE product_id = ? ORDER BY sort_order ASC').all(row.id);
  const variants = db.prepare('SELECT id, variant_sku, size, color, stock FROM product_variants WHERE product_id = ?').all(row.id);

  const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    fabric: row.fabric,
    category: row.category,
    subcategory: row.subcategory,
    ageGroup: row.age_group,
    price: row.sale_price || row.price,
    oldPrice: row.sale_price ? row.price : null,
    images: images.map((i) => i.image_url),
    sizes,
    colors,
    variants,
    stock: totalStock,
    featured: !!row.featured,
    newArrival: !!row.new_arrival,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getProductById(id) {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  return row ? serializeProduct(row) : null;
}

function orderNumberFor(date) {
  const d = date || new Date();
  const pad2 = (n) => (n < 10 ? '0' + n : String(n));
  const datePart = String(d.getFullYear()).slice(2) + pad2(d.getMonth() + 1) + pad2(d.getDate());
  const timePart = pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  return 'YM-' + datePart + '-' + timePart;
}

function serializeOrder(orderRow) {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderRow.id);
  const history = db.prepare('SELECT status, note, created_at FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC').all(orderRow.id);
  const shipment = db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(orderRow.id) || null;

  return {
    id: orderRow.id,
    orderNumber: orderRow.order_number,
    customer: {
      name: orderRow.customer_name,
      phone: orderRow.phone,
      email: orderRow.email
    },
    address: {
      house: orderRow.house,
      street: orderRow.street,
      landmark: orderRow.landmark,
      city: orderRow.city,
      state: orderRow.state,
      pincode: orderRow.pincode
    },
    items: items.map((it) => ({
      id: it.id,
      productId: it.product_id,
      sku: it.sku,
      name: it.product_name,
      image: it.product_image,
      size: it.size,
      color: it.color,
      quantity: it.quantity,
      unitPrice: it.unit_price,
      totalPrice: it.total_price
    })),
    totals: {
      subtotal: orderRow.subtotal,
      delivery: orderRow.delivery_charge,
      discount: orderRow.discount,
      total: orderRow.total
    },
    paymentMethod: orderRow.payment_method,
    paymentStatus: orderRow.payment_status,
    paymentReference: orderRow.payment_reference,
    paymentNotes: orderRow.payment_notes,
    paidAt: orderRow.paid_at,
    orderStatus: orderRow.order_status,
    statusHistory: history,
    shipment,
    createdAt: orderRow.created_at,
    updatedAt: orderRow.updated_at
  };
}

module.exports = { serializeProduct, getProductById, orderNumberFor, serializeOrder };
