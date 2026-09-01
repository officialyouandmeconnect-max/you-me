/* =========================================================
   You & Me — Supabase client + shared row/product normalizers.
   Loaded before script.js (customer site) / admin.js (admin panel) on both pages — this is
   the one place both frontends get their Supabase client and agree on how a raw Postgres row
   becomes the product/order shape the rest of the app already expects.

   The anon key below is meant to be public — it's what every Supabase frontend ships with.
   It grants zero access on its own; every table has Row Level Security enabled (see
   supabase/migrations/0001_init.sql), so what this key can actually do is entirely decided by
   those policies, not by this key being secret.
   ========================================================= */
var SUPABASE_URL = 'https://kpjlwzsevogtzosucdjl.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtwamx3enNldm9ndHpvc3VjZGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4OTI3MTYsImV4cCI6MjEwMzQ2ODcxNn0.bqxvYCwo3dsizatIOM7a8WJ7K9qBH_0fhyb5Xwryy1k';

var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// officialyouandme.in (a custom domain on GitHub Pages) serves this repo from the real domain
// root, so every root-relative route (/login, /account, /admin, /admin/dashboard, …) needs no
// prefix. If this ever moves back to a github.io/<repo> project subpath instead, change this
// back to '/you-me' and every one of those routes keeps working unmodified.
var BASE_PATH = '';

// Raw Postgres row (snake_case, nested foreign-table arrays from a `.select('*, product_images(*), ...')`
// query) -> the camelCase product shape every render function in script.js / admin.js already expects.
function mapSupabaseProduct(row) {
  var images = (row.product_images || []).slice().sort(function (a, b) { return a.sort_order - b.sort_order; }).map(function (i) { return i.image_url; });
  var sizes = (row.product_sizes || []).slice().sort(function (a, b) { return a.sort_order - b.sort_order; }).map(function (s) { return s.size; });
  var colors = (row.product_colors || []).slice().sort(function (a, b) { return a.sort_order - b.sort_order; }).map(function (c) { return { name: c.name, hex: c.hex }; });
  var variants = (row.product_variants || []).map(function (v) { return { id: v.id, variant_sku: v.variant_sku, size: v.size, color: v.color, stock: v.stock }; });
  var totalStock = variants.reduce(function (sum, v) { return sum + v.stock; }, 0);

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    fabric: row.fabric,
    category: row.category,
    subcategory: row.subcategory,
    ageGroup: row.age_group,
    gender: row.gender || null,
    price: row.sale_price || row.price,
    oldPrice: row.sale_price ? row.price : null,
    images: images,
    sizes: sizes,
    colors: colors,
    variants: variants,
    stock: totalStock,
    featured: !!row.featured,
    newArrival: !!row.new_arrival,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

var PRODUCT_SELECT = '*, product_images(*), product_sizes(*), product_colors(*), product_variants(*)';

// A product image is either a real Supabase Storage URL (already a full https:// link) or one
// of the site's pastel placeholder classes (legacy/no-photo products) — see productImageHtml()
// in script.js / imageHtml() in admin.js for how each is actually rendered.
function isPlaceholderImageUrl(url) { return typeof url === 'string' && url.indexOf('placeholder:') === 0; }
