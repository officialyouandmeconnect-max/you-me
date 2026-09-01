/* =========================================================
   YOU & ME — Admin Panel
   1. AdminAPI (Supabase-backed data layer)
   2. Auth (login/logout/session)
   3. Router + shell chrome
   4. Dashboard
   5. Products (list, form, images, variants)
   6. Orders (list, detail)
   7. Customers
   8. Inventory
   9. Shipping
   10. Categories
   11. Media Library
   12. Settings
   13. Modal helper
   14. New-order notifications (polling)
   15. Init
   ========================================================= */
(function () {
  'use strict';

  function fmtPrice(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
  // BUG FIX: toLocaleString('en-IN', ...) without an explicit timeZone renders in the VIEWER's
  // own system/browser timezone — 'en-IN' only affects number/date formatting conventions, not
  // the actual timezone used. That silently showed wrong times for any admin whose machine
  // wasn't set to IST. All timestamps here are courier/order events that only make sense in
  // India time, so it's pinned explicitly — once, here — rather than left to chance.
  function fmtDate(iso) { if (!iso) return '—'; var d = new Date(iso.replace(' ', 'T') + (iso.indexOf('Z') === -1 && iso.indexOf('+') === -1 ? 'Z' : '')); return isNaN(d) ? iso : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function statusLabel(s) { return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

  // Real Cashfree sub-method (upi/card/netbanking/app/...) -> friendly label. Mirrors the same
  // helper in the customer site's script.js — kept manually in sync since the two frontends
  // don't share a module system.
  var CASHFREE_METHOD_LABELS = { upi: 'UPI', card: 'Card', netbanking: 'Net Banking', app: 'Wallet / App', paylater: 'Pay Later', emi: 'EMI' };
  function paymentMethodLabel(paymentMethod, cashfreeSubMethod) {
    if (paymentMethod === 'cashfree') return 'Cashfree' + (cashfreeSubMethod ? ' — ' + (CASHFREE_METHOD_LABELS[cashfreeSubMethod] || statusLabel(cashfreeSubMethod)) : ' (Online Payment)');
    if (paymentMethod === 'whatsapp') return 'WhatsApp / Manual Payment';
    return statusLabel(paymentMethod || '');
  }

  /* ---------- 0. Inline icon system (Lucide-style stroke icons — no icon font/CDN needed) ---------- */
  var ICON_PATHS = {
    dashboard: '<rect width="7" height="9" x="3" y="3" rx="1.5"/><rect width="7" height="5" x="14" y="3" rx="1.5"/><rect width="7" height="9" x="14" y="12" rx="1.5"/><rect width="7" height="5" x="3" y="16" rx="1.5"/>',
    products: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    orders: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2"/><path d="M9 12h6"/><path d="M9 16h6"/><path d="M9 8h6"/>',
    customers: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    inventory: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    shipping: '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8Z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    categories: '<path d="M12 2H2v10l9.29 9.29a1 1 0 0 0 1.41 0l8.29-8.29a1 1 0 0 0 0-1.41L12 2Z"/><circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none"/>',
    media: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    chevronDown: '<polyline points="6 9 12 15 18 9"/>',
    menu: '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
    campaigns: '<path d="M20 12V4a1 1 0 0 0-1.7-.7L14 7H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1l1 6h2l-1-6h1l9.3 3.7A1 1 0 0 0 20 16v-4Z"/>'
  };
  function svgIcon(name) { return '<svg viewBox="0 0 24 24">' + (ICON_PATHS[name] || '') + '</svg>'; }
  function icon(name) { return '<span class="icon icon-' + name + '">' + svgIcon(name) + '</span>'; }

  // Shared: render a product image (real upload OR one of the customer site's pastel
  // placeholder classes) as an <img> or a colored box, consistently across every admin view.
  var PLACEHOLDER_COLORS = { 'img-blue': '#DCE9F1', 'img-beige': '#F1E4D3', 'img-pink': '#F7DEE1', 'img-sage': '#E3EBDD', 'img-dual': 'linear-gradient(135deg,#DCE9F1,#F7DEE1)' };
  function imageHtml(url, sizeClass) {
    sizeClass = sizeClass || 'thumb';
    if (!url) return '<div class="thumb-placeholder" style="background:#eee;"></div>';
    if (url.indexOf('placeholder:') === 0) {
      var cls = url.slice('placeholder:'.length);
      var bg = PLACEHOLDER_COLORS[cls] || '#eee';
      return '<div class="' + sizeClass + '" style="background:' + bg + ';"></div>';
    }
    return '<img class="' + sizeClass + '" src="' + esc(url) + '" alt="">';
  }

  function throwIfError(res) { if (res.error) throw new Error(res.error.message || 'Request failed'); return res; }

  // Every Amazon Shipping/Delhivery call goes through this — a Supabase Edge Function, never
  // the courier's API directly from the browser. The function re-verifies the caller is an
  // admin itself using this same access token; nothing here is a trust boundary on its own.
  //
  // A session can go stale in a way a normal getSession() call won't catch on its own: the
  // access token still looks present/unexpired locally, but the *refresh* token backing it has
  // already been invalidated (e.g. Supabase rotated it from a sign-in elsewhere) — the very
  // first sign this happened was always a bare 401 "Not authenticated." from one of these calls,
  // with no clear way for Admin to tell "retry" from "you need to log in again". This makes that
  // distinction explicit: one silent session refresh + retry for a call that fails
  // authentication, and only if THAT also fails does it surface as a real, actionable "your
  // session expired" prompt instead of a raw error.
  function callEdgeFunction(name, body, isRetry) {
    return supabaseClient.auth.getSession().then(function (res) {
      var token = res.data && res.data.session && res.data.session.access_token;
      if (!token) return isRetry ? Promise.reject(sessionExpiredError()) : recoverSessionThenRetry(name, body);
      // `Authorization` carries the anon key — this project's edge gateway silently 502s any
      // request carrying a genuine Supabase JWT in any header (Authorization or otherwise)
      // before the function's own code ever runs, even with per-function JWT verification off.
      // Base64-encoding the real token is enough to dodge that, so it travels as
      // x-user-token-b64 and gets decoded server-side (see requireAdmin() in
      // supabase/functions/_shared/shipping.ts).
      return fetch(SUPABASE_URL + '/functions/v1/' + name, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'apikey': SUPABASE_ANON_KEY,
          'x-user-token-b64': btoa(token)
        },
        body: JSON.stringify(body)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (r.status === 401 && !isRetry) return recoverSessionThenRetry(name, body);
          if (!r.ok) throw new Error(data.error || 'Request failed (' + r.status + ')');
          return data;
        });
      });
    });
  }
  function recoverSessionThenRetry(name, body) {
    return supabaseClient.auth.refreshSession().then(function (refreshed) {
      if (refreshed.error || !refreshed.data.session) throw sessionExpiredError();
      return callEdgeFunction(name, body, true);
    }).catch(function () { throw sessionExpiredError(); });
  }
  function sessionExpiredError() {
    // Signing out (rather than just redirecting) clears the invalid session locally too — the
    // next /login is a genuinely clean sign-in, not another attempt with the same dead tokens.
    supabaseClient.auth.signOut().then(function () { window.location.href = BASE_PATH + '/login'; });
    return new Error('Your session has expired — redirecting you to log in again…');
  }

  /* ---------- 1. AdminAPI (Supabase-backed data layer) ---------- */
  // Every read/write below runs through the same anon-key Supabase client the customer site
  // uses — what it's actually allowed to do is entirely decided by Row Level Security policies
  // (see supabase/migrations/0001_init.sql), gated on the signed-in user's profiles.role being
  // 'admin'. There is no separate "admin API" server — the database itself is the boundary.
  var AdminAPI = {
    auth: {
      session: function () {
        return supabaseClient.auth.getSession().then(function (res) {
          var session = res.data && res.data.session;
          if (!session) return { authenticated: false };
          return supabaseClient.from('profiles').select('name, role, email').eq('id', session.user.id).single()
            .then(function (r) {
              if (r.error || !r.data) return { authenticated: false };
              return { authenticated: true, user: { id: session.user.id, email: r.data.email, name: r.data.name, role: r.data.role } };
            });
        }).catch(function () { return { authenticated: false }; });
      },
      logout: function () { return supabaseClient.auth.signOut(); }
    },

    dashboard: function () {
      return Promise.all([
        supabaseClient.from('orders').select('id, order_number, customer_name, total, payment_status, order_status, created_at').order('created_at', { ascending: false }),
        supabaseClient.from('products').select('id, stock, status'),
        supabaseClient.from('order_items').select('order_id, product_image, product_name').order('id', { ascending: true })
      ]).then(function (results) {
        var ordersRes = throwIfError(results[0]), productsRes = throwIfError(results[1]), itemsRes = throwIfError(results[2]);
        var orders = ordersRes.data || [], products = productsRes.data || [], items = itemsRes.data || [];

        var firstImageByOrder = {}, itemsByOrder = {};
        items.forEach(function (it) {
          if (!(it.order_id in firstImageByOrder)) firstImageByOrder[it.order_id] = it.product_image;
          (itemsByOrder[it.order_id] = itemsByOrder[it.order_id] || []).push(it.product_name);
        });

        // Last 7 calendar days (real order counts, no synthetic/fake data) for the Order
        // Activity chart — an empty bucket just means genuinely no orders landed that day.
        var dayKeys = [], dayCounts = {};
        for (var i = 6; i >= 0; i--) {
          var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
          var key = d.toISOString().slice(0, 10);
          dayKeys.push(key); dayCounts[key] = 0;
        }
        orders.forEach(function (o) {
          var key = new Date(o.created_at).toISOString().slice(0, 10);
          if (key in dayCounts) dayCounts[key]++;
        });
        var last7Days = dayKeys.map(function (key) {
          var d = new Date(key + 'T00:00:00');
          return { label: d.toLocaleDateString('en-IN', { weekday: 'short' }), count: dayCounts[key] };
        });

        var now = new Date();
        var startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        var startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        var counts = { total: orders.length, new: 0, confirmed: 0, packing: 0, shipped: 0, delivered: 0, cancelled: 0, today: 0, thisWeek: 0, thisMonth: 0 };
        var revenuePaid = 0, revenuePending = 0;
        orders.forEach(function (o) {
          if (counts.hasOwnProperty(o.order_status)) counts[o.order_status]++;
          var created = new Date(o.created_at);
          if (created >= startOfDay) counts.today++;
          if (created >= startOfWeek) counts.thisWeek++;
          if (created >= startOfMonth) counts.thisMonth++;
          // Revenue only ever counts orders actually marked Paid — never just placed.
          if (o.payment_status === 'paid') revenuePaid += o.total;
          else if (o.payment_status === 'pending') revenuePending += o.total;
        });

        var uniquePhones = {};
        // customers.total is computed from orders below (see AdminAPI.customers.list); keep this
        // cheap here by reusing the same order rows rather than a second round trip.
        orders.forEach(function () {});

        return {
          orders: counts,
          revenue: { paid: revenuePaid, pending: revenuePending },
          customers: { total: 0 }, // filled in by the dashboard renderer via customers.list()
          products: {
            total: products.length,
            lowStock: products.filter(function (p) { return p.stock > 0 && p.stock <= 5; }).length,
            outOfStock: products.filter(function (p) { return p.stock <= 0; }).length
          },
          last7Days: last7Days,
          recentOrders: orders.slice(0, 8).map(function (o) {
            var names = itemsByOrder[o.id] || [];
            var productSummary = names.length === 0 ? '—' : names.length === 1 ? names[0] : names[0] + ' +' + (names.length - 1) + ' more';
            return { id: o.id, orderNumber: o.order_number, customerName: o.customer_name, thumbnail: firstImageByOrder[o.id] || null, productSummary: productSummary, itemCount: names.length, total: o.total, paymentStatus: o.payment_status, orderStatus: o.order_status, createdAt: o.created_at };
          })
        };
      });
    },

    products: {
      list: function () {
        return supabaseClient.from('products').select(PRODUCT_SELECT).order('id', { ascending: false })
          .then(function (res) { throwIfError(res); return (res.data || []).map(mapSupabaseProduct); });
      },
      get: function (id) {
        return supabaseClient.from('products').select(PRODUCT_SELECT).eq('id', id).single()
          .then(function (res) { throwIfError(res); return mapSupabaseProduct(res.data); });
      },
      create: function (payload) {
        return supabaseClient.from('products').insert({
          sku: payload.sku, name: payload.name, description: payload.description || '', fabric: payload.fabric || '',
          category: payload.category, subcategory: payload.subcategory || null, age_group: payload.ageGroup || null, gender: payload.gender || null,
          price: payload.price, sale_price: payload.salePrice, stock: 0,
          featured: !!payload.featured, new_arrival: !!payload.newArrival, status: payload.status || 'active'
        }).select().single().then(function (res) {
          throwIfError(res);
          var product = res.data;
          return writeProductChildren(product, payload).then(function () { return AdminAPI.products.get(product.id); });
        });
      },
      update: function (id, payload) {
        return supabaseClient.from('products').update({
          sku: payload.sku, name: payload.name, description: payload.description || '', fabric: payload.fabric || '',
          category: payload.category, subcategory: payload.subcategory || null, age_group: payload.ageGroup || null, gender: payload.gender || null,
          price: payload.price, sale_price: payload.salePrice,
          featured: !!payload.featured, new_arrival: !!payload.newArrival, status: payload.status || 'active',
          updated_at: new Date().toISOString()
        }).eq('id', id).select().single().then(function (res) {
          throwIfError(res);
          var product = res.data;
          return Promise.all([
            supabaseClient.from('product_images').delete().eq('product_id', id),
            supabaseClient.from('product_sizes').delete().eq('product_id', id),
            supabaseClient.from('product_colors').delete().eq('product_id', id)
          ]).then(function () { return writeProductChildren(product, payload, true); })
            .then(function () { return recomputeProductStock(id); })
            .then(function () { return AdminAPI.products.get(id); });
        });
      },
      duplicate: function (id) {
        return AdminAPI.products.get(id).then(function (p) {
          var sku = p.sku + '-COPY-' + Date.now().toString().slice(-5);
          return AdminAPI.products.create({
            sku: sku, name: p.name + ' (Copy)', description: p.description, fabric: p.fabric,
            category: p.category, subcategory: p.subcategory, ageGroup: p.ageGroup,
            price: p.oldPrice || p.price, salePrice: p.oldPrice ? p.price : null,
            images: p.images, sizes: p.sizes, colors: p.colors,
            featured: false, newArrival: false, status: 'draft'
          });
        });
      },
      setStatus: function (id, status) {
        return supabaseClient.from('products').update({ status: status, updated_at: new Date().toISOString() }).eq('id', id)
          .then(throwIfError);
      },
      remove: function (id) {
        return supabaseClient.from('order_items').select('id', { count: 'exact', head: true }).eq('product_id', id)
          .then(function (res) {
            throwIfError(res);
            if (res.count && res.count > 0) return AdminAPI.products.setStatus(id, 'draft');
            return supabaseClient.from('products').delete().eq('id', id).then(throwIfError);
          });
      },
      setVariantStock: function (productId, variantId, stock) {
        return supabaseClient.from('product_variants').update({ stock: stock }).eq('id', variantId)
          .then(throwIfError).then(function () { return recomputeProductStock(productId); });
      }
    },

    orders: {
      list: function (filters) {
        var q = supabaseClient.from('orders').select('id, order_number, customer_name, phone, total, payment_status, order_status, created_at, order_items(product_image)').order('created_at', { ascending: false });
        if (filters && filters.status && filters.status !== 'all') q = q.eq('order_status', filters.status);
        if (filters && filters.q) {
          var term = filters.q.replace(/[%,]/g, '');
          q = q.or('order_number.ilike.%' + term + '%,customer_name.ilike.%' + term + '%,phone.ilike.%' + term + '%');
        }
        return q.then(function (res) {
          throwIfError(res);
          return (res.data || []).map(function (o) {
            return {
              id: o.id, orderNumber: o.order_number, createdAt: o.created_at, customerName: o.customer_name, phone: o.phone,
              thumbnails: (o.order_items || []).slice(0, 3).map(function (it) { return it.product_image; }),
              itemCount: (o.order_items || []).length, total: o.total, paymentStatus: o.payment_status, orderStatus: o.order_status
            };
          });
        });
      },
      get: function (id) {
        return supabaseClient.from('orders').select('*, order_items(*), order_status_history(*)').eq('id', id).single()
          .then(function (res) {
            throwIfError(res);
            var o = res.data;
            var history = (o.order_status_history || []).slice().sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
            return {
              id: o.id, orderNumber: o.order_number,
              customer: { name: o.customer_name, phone: o.phone, email: o.email },
              address: { house: o.house, street: o.street, landmark: o.landmark, city: o.city, state: o.state, pincode: o.pincode },
              items: (o.order_items || []).map(function (it) { return { image: it.product_image, name: it.product_name, sku: it.sku, size: it.size, color: it.color, quantity: it.quantity, unitPrice: it.unit_price, totalPrice: it.total_price }; }),
              totals: { subtotal: o.subtotal, delivery: o.delivery_charge, discount: o.discount, total: o.total },
              paymentMethod: o.payment_method, paymentStatus: o.payment_status, paymentReference: o.payment_reference, paymentNotes: o.payment_notes, paidAt: o.paid_at,
              cashfreePaymentMethod: o.cashfree_payment_method, cashfreeCfPaymentId: o.cashfree_cf_payment_id, cashfreeOrderId: o.cashfree_order_id,
              orderStatus: o.order_status, statusHistory: history
            };
          });
      },
      setPayment: function (id, payload) {
        var patch = { payment_status: payload.paymentStatus, payment_notes: payload.paymentNotes };
        if (payload.paymentStatus === 'paid') patch.paid_at = new Date().toISOString();
        return supabaseClient.from('orders').update(patch).eq('id', id).then(throwIfError);
      },
      setStatus: function (id, status) {
        return supabaseClient.from('orders').update({ order_status: status, updated_at: new Date().toISOString() }).eq('id', id).then(throwIfError)
          .then(function () { return supabaseClient.from('order_status_history').insert({ order_id: id, status: status }).then(throwIfError); });
      }
    },

    shipments: {
      // shipment_events is fetched separately (not nested) so an older schema without it yet
      // (migration 0003 not applied) still returns the shipment row itself, just with no
      // events — instead of the whole call failing and hiding a real shipment from Admin.
      get: function (orderId) {
        return supabaseClient.from('shipments').select('*').eq('order_id', orderId).maybeSingle()
          .then(function (res) {
            throwIfError(res);
            var shipment = res.data;
            if (!shipment) return null;
            return supabaseClient.from('shipment_events').select('*').eq('shipment_id', shipment.id)
              .then(function (r) { shipment.shipment_events = r.data || []; return shipment; })
              .catch(function () { shipment.shipment_events = []; return shipment; });
          });
      },
      // Manual Shipping only — Amazon-provider shipments are never written to directly like
      // this; every one of their fields comes from the amazon-shipping Edge Function instead
      // (see AdminAPI.shipments.createAmazon / syncAmazon / cancelAmazon below).
      saveManual: function (orderId, payload) {
        return supabaseClient.from('shipments').upsert({
          order_id: orderId, provider: 'manual',
          courier: payload.courier || null, tracking_id: payload.trackingId || null, tracking_url: payload.trackingUrl || null,
          status: payload.courier ? 'Manual — ' + payload.courier : null, normalized_status: 'shipment_created',
          shipping_cost: payload.shippingCost, pickup_date: payload.pickupDate, estimated_delivery: payload.estimatedDelivery,
          updated_at: new Date().toISOString()
        }, { onConflict: 'order_id' }).then(throwIfError);
      },
      // These three all go through the amazon-shipping Edge Function — never a direct table
      // write from the browser, and never anything that could fabricate Amazon data locally.
      createAmazon: function (orderId, pkg, paymentType) {
        return callEdgeFunction('amazon-shipping', { action: 'create', orderId: orderId, package: pkg, paymentType: paymentType });
      },
      syncAmazon: function (shipmentId) {
        return callEdgeFunction('amazon-shipping', { action: 'sync', shipmentId: shipmentId });
      },
      cancelAmazon: function (shipmentId) {
        return callEdgeFunction('amazon-shipping', { action: 'cancel', shipmentId: shipmentId });
      },
      // Same pattern as Amazon — every one of these goes through the delhivery-shipping Edge
      // Function, never a direct table write, never fabricated data.
      checkDelhiveryServiceability: function (pincode) {
        return callEdgeFunction('delhivery-shipping', { action: 'check-serviceability', pincode: pincode });
      },
      createDelhivery: function (orderId, paymentType, pkg) {
        return callEdgeFunction('delhivery-shipping', { action: 'create', orderId: orderId, paymentType: paymentType, package: pkg });
      },
      schedulePickupDelhivery: function (shipmentId, pickupDate, expectedPackageCount) {
        return callEdgeFunction('delhivery-shipping', { action: 'schedule-pickup', shipmentId: shipmentId, pickupDate: pickupDate, expectedPackageCount: expectedPackageCount });
      },
      syncDelhivery: function (shipmentId) {
        return callEdgeFunction('delhivery-shipping', { action: 'sync', shipmentId: shipmentId });
      },
      cancelDelhivery: function (shipmentId) {
        return callEdgeFunction('delhivery-shipping', { action: 'cancel', shipmentId: shipmentId });
      },
      // Same pattern again — every one of these goes through the shiprocket-shipping Edge
      // Function, never a direct table write, never fabricated data.
      checkShiprocketServiceability: function (pincode, weightKg, cod) {
        return callEdgeFunction('shiprocket-shipping', { action: 'check-serviceability', pincode: pincode, weightKg: weightKg, cod: cod });
      },
      createShiprocket: function (orderId, paymentType, pkg, courierId) {
        return callEdgeFunction('shiprocket-shipping', { action: 'create', orderId: orderId, paymentType: paymentType, package: pkg, courierId: courierId });
      },
      generateLabelShiprocket: function (shipmentId) {
        return callEdgeFunction('shiprocket-shipping', { action: 'generate-label', shipmentId: shipmentId });
      },
      schedulePickupShiprocket: function (shipmentId) {
        return callEdgeFunction('shiprocket-shipping', { action: 'schedule-pickup', shipmentId: shipmentId });
      },
      syncShiprocket: function (shipmentId) {
        return callEdgeFunction('shiprocket-shipping', { action: 'sync', shipmentId: shipmentId });
      },
      cancelShiprocket: function (shipmentId) {
        return callEdgeFunction('shiprocket-shipping', { action: 'cancel', shipmentId: shipmentId });
      }
    },

    settings: {
      get: function () {
        return supabaseClient.from('store_settings').select('*').eq('id', true).single()
          .then(function (res) { throwIfError(res); return res.data; });
      },
      savePickupAddress: function (payload) {
        return supabaseClient.from('store_settings').update({
          pickup_name: payload.name, pickup_phone: payload.phone,
          pickup_line1: payload.line1, pickup_line2: payload.line2 || null,
          pickup_city: payload.city, pickup_state: payload.state, pickup_pincode: payload.pincode,
          updated_at: new Date().toISOString()
        }).eq('id', true).then(throwIfError);
      }
    },

    customers: {
      list: function () {
        return supabaseClient.from('orders').select('customer_name, phone, email, total, created_at').order('created_at', { ascending: false })
          .then(function (res) {
            throwIfError(res);
            return groupByCustomer(res.data || []).sort(function (a, b) { return new Date(b.lastOrderAt) - new Date(a.lastOrderAt); });
          });
      },
      get: function (phone) {
        return Promise.all([
          supabaseClient.from('orders').select('id, order_number, customer_name, phone, email, house, street, landmark, city, state, pincode, total, order_status, created_at').eq('phone', phone).order('created_at', { ascending: false }),
        ]).then(function (results) {
          var res = results[0]; throwIfError(res);
          var rows = res.data || [];
          if (rows.length === 0) throw new Error('Customer not found');
          var seen = {}, addresses = [];
          rows.forEach(function (r) {
            var key = r.house + '|' + r.street + '|' + r.city;
            if (!seen[key]) { seen[key] = true; addresses.push({ house: r.house, street: r.street, landmark: r.landmark, city: r.city, state: r.state, pincode: r.pincode }); }
          });
          return {
            name: rows[0].customer_name, phone: rows[0].phone, email: rows[0].email,
            orderCount: rows.length, totalValue: rows.reduce(function (s, r) { return s + r.total; }, 0),
            addresses: addresses,
            orders: rows.map(function (r) { return { id: r.id, orderNumber: r.order_number, createdAt: r.created_at, total: r.total, orderStatus: r.order_status }; })
          };
        });
      }
    },

    media: {
      list: function () {
        return Promise.all([
          supabaseClient.from('media').select('*').order('uploaded_at', { ascending: false }),
          supabaseClient.from('product_images').select('image_url')
        ]).then(function (results) {
          var mediaRes = throwIfError(results[0]), imagesRes = throwIfError(results[1]);
          var inUseUrls = {};
          (imagesRes.data || []).forEach(function (r) { inUseUrls[r.image_url] = true; });
          return (mediaRes.data || []).map(function (m) { return { id: m.id, url: m.url, filename: m.filename, inUse: !!inUseUrls[m.url] }; });
        });
      },
      remove: function (id) {
        return supabaseClient.from('media').select('url').eq('id', id).single().then(function (res) {
          throwIfError(res);
          var url = res.data.url;
          return supabaseClient.from('media').delete().eq('id', id).then(throwIfError).then(function () {
            var path = storagePathFromUrl(url);
            if (path) supabaseClient.storage.from('product-images').remove([path]).catch(function () {});
          });
        });
      },
      upload: function (file) {
        var path = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '-' + file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
        return supabaseClient.storage.from('product-images').upload(path, file, { cacheControl: '3600', upsert: false })
          .then(function (res) {
            throwIfError(res);
            var publicUrl = supabaseClient.storage.from('product-images').getPublicUrl(path).data.publicUrl;
            return supabaseClient.from('media').insert({ url: publicUrl, filename: file.name }).select().single()
              .then(function (r) { throwIfError(r); return { url: publicUrl }; });
          });
      }
    },

    // Seasonal Campaign & Offer Management. Four tables (campaigns / campaign_content /
    // campaign_media / campaign_products), one JS module — every write here is the ONLY way any
    // of those rows change; the customer site only ever reads (see supabase-client.js's
    // CampaignService, and the public.live_campaign view + RLS in
    // supabase/migrations/0007_campaigns.sql for what "reads" actually means: highest-priority
    // campaign that's enabled, not paused, and inside its start/end window, computed live on
    // every request — no stored status to drift, no admin action needed at midnight).
    campaigns: {
      list: function () {
        return supabaseClient.from('campaigns')
          .select('*, campaign_content(offer_section_enabled, announcement_enabled), campaign_media(banner_enabled), campaign_products(id)')
          .order('priority', { ascending: true })
          .then(throwIfError).then(function (res) { return res.data || []; });
      },
      get: function (id) {
        return supabaseClient.from('campaigns')
          .select('*, campaign_content(*), campaign_media(*), campaign_products(*, products(id, name, price, sale_price, sku))')
          .eq('id', id).single()
          .then(throwIfError).then(function (res) { return res.data; });
      },
      create: function (payload) {
        return supabaseClient.from('campaigns').insert(payload).select().single().then(throwIfError).then(function (r) { return r.data; });
      },
      update: function (id, payload) {
        payload.updated_at = new Date().toISOString();
        return supabaseClient.from('campaigns').update(payload).eq('id', id).then(throwIfError);
      },
      remove: function (id) {
        return supabaseClient.from('campaigns').delete().eq('id', id).then(throwIfError);
      },
      // upsert (not insert) — campaign_content/campaign_media are one row per campaign
      // (campaign_id is their primary key), so saving the editor form again just updates the
      // same row, never creates a duplicate.
      saveContent: function (campaignId, payload) {
        payload.campaign_id = campaignId;
        payload.updated_at = new Date().toISOString();
        return supabaseClient.from('campaign_content').upsert(payload, { onConflict: 'campaign_id' }).then(throwIfError);
      },
      saveMedia: function (campaignId, payload) {
        payload.campaign_id = campaignId;
        payload.updated_at = new Date().toISOString();
        return supabaseClient.from('campaign_media').upsert(payload, { onConflict: 'campaign_id' }).then(throwIfError);
      },
      // Replaces the full product list in one go (delete-then-insert) — simple and safe for a
      // single-admin, low-frequency edit like this; never duplicates a product_id (unique
      // constraint on (campaign_id, product_id) backs this up regardless).
      setProducts: function (campaignId, rows) {
        return supabaseClient.from('campaign_products').delete().eq('campaign_id', campaignId).then(throwIfError).then(function () {
          if (!rows.length) return;
          return supabaseClient.from('campaign_products').insert(rows.map(function (r, i) {
            return { campaign_id: campaignId, product_id: r.product_id, campaign_price: r.campaign_price, discount_percentage: r.discount_percentage, sort_order: i };
          })).then(throwIfError);
        });
      }
    }
  };

  function storagePathFromUrl(url) {
    var marker = '/product-images/';
    var idx = url.indexOf(marker);
    return idx === -1 ? null : url.slice(idx + marker.length);
  }

  function groupByCustomer(orderRows) {
    var byPhone = {};
    orderRows.forEach(function (o) {
      if (!byPhone[o.phone]) byPhone[o.phone] = { name: o.customer_name, phone: o.phone, email: o.email, orderCount: 0, totalValue: 0, lastOrderAt: o.created_at };
      var c = byPhone[o.phone];
      c.orderCount++; c.totalValue += o.total;
      if (new Date(o.created_at) > new Date(c.lastOrderAt)) { c.lastOrderAt = o.created_at; c.name = o.customer_name; c.email = o.email; }
    });
    return Object.keys(byPhone).map(function (k) { return byPhone[k]; });
  }

  function writeProductChildren(product, payload) {
    var tasks = [];
    var images = (payload.images || []).map(function (url, i) { return { product_id: product.id, image_url: url, sort_order: i, is_primary: i === 0 }; });
    if (images.length) tasks.push(supabaseClient.from('product_images').insert(images).then(throwIfError));

    var sizes = (payload.sizes || []).map(function (s, i) { return { product_id: product.id, size: s, sort_order: i }; });
    if (sizes.length) tasks.push(supabaseClient.from('product_sizes').insert(sizes).then(throwIfError));

    var colors = (payload.colors || []).map(function (c, i) { return { product_id: product.id, name: c.name, hex: c.hex, sort_order: i }; });
    if (colors.length) tasks.push(supabaseClient.from('product_colors').insert(colors).then(throwIfError));

    return Promise.all(tasks).then(function () {
      // Fill in any size×color variant combos that don't exist yet — existing ones (with real
      // stock history) are left untouched rather than being wiped and recreated on every save.
      return supabaseClient.from('product_variants').select('size, color').eq('product_id', product.id).then(function (res) {
        throwIfError(res);
        var existing = {};
        (res.data || []).forEach(function (v) { existing[v.size + '|' + v.color] = true; });
        var toInsert = [];
        (payload.sizes || []).forEach(function (size) {
          (payload.colors || []).forEach(function (color) {
            var key = size + '|' + color.name;
            if (existing[key]) return;
            var variantSku = product.sku + '-' + color.name.toUpperCase().replace(/\s+/g, '') + '-' + size.replace(/\s+/g, '');
            toInsert.push({ product_id: product.id, variant_sku: variantSku, size: size, color: color.name, stock: 0 });
          });
        });
        if (!toInsert.length) return null;
        return supabaseClient.from('product_variants').insert(toInsert).then(throwIfError);
      });
    });
  }

  function recomputeProductStock(productId) {
    return supabaseClient.from('product_variants').select('stock').eq('product_id', productId).then(function (res) {
      throwIfError(res);
      var total = (res.data || []).reduce(function (s, v) { return s + v.stock; }, 0);
      return supabaseClient.from('products').update({ stock: total }).eq('id', productId).then(throwIfError);
    });
  }

  /* ---------- 2. Auth ---------- */
  // There is no login form on this page — the website's own /login page (you-and-me-site) is
  // the single place anyone, customer or admin, signs in via Supabase Auth. This script just
  // re-checks the session + profiles.role on load and bounces anyone who isn't an admin — the
  // real enforcement is the RLS policies every AdminAPI call above runs through, not this check.
  function showApp(user) {
    document.getElementById('checkingSession').hidden = true;
    document.getElementById('adminApp').hidden = false;
    var name = user.name || user.email || '';
    document.getElementById('topbarUsername').textContent = name;
    var avatar = document.getElementById('topbarAvatar');
    if (avatar) avatar.textContent = (name.trim().charAt(0) || 'A').toUpperCase();
  }

  function initAuth() {
    AdminAPI.auth.session().then(function (data) {
      if (data.authenticated && data.user.role === 'admin') {
        showApp(data.user);
        Router.start();
        startNotifications();
      } else {
        window.location.href = BASE_PATH + '/login';
      }
    }).catch(function () { window.location.href = BASE_PATH + '/login'; });

    function doLogout() { AdminAPI.auth.logout().then(function () { window.location.href = BASE_PATH + '/login'; }); }
    document.getElementById('logoutBtn').addEventListener('click', doLogout);
    var profileLogout = document.getElementById('profileMenuLogout');
    if (profileLogout) profileLogout.addEventListener('click', doLogout);
  }

  /* ---------- 3. Router + shell chrome ---------- */
  var NAV_ITEMS = [
    { route: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { route: 'products', label: 'Products', icon: 'products' },
    { route: 'orders', label: 'Orders', icon: 'orders' },
    { route: 'customers', label: 'Customers', icon: 'customers' },
    { route: 'inventory', label: 'Inventory', icon: 'inventory' },
    { route: 'shipping', label: 'Shipping', icon: 'shipping' },
    { route: 'categories', label: 'Categories', icon: 'categories' },
    { route: 'media', label: 'Media Library', icon: 'media' },
    { route: 'campaigns', label: 'Campaigns & Offers', icon: 'campaigns' },
    { route: 'settings', label: 'Settings', icon: 'settings' }
  ];
  var ROUTE_TITLES = {}, ROUTE_SUBTITLES = {
    dashboard: "Here's what's happening with You & Me today.",
    products: 'Manage your product catalog.',
    orders: 'Track and manage customer orders.',
    customers: 'Everyone who has shopped with you.',
    inventory: 'Keep stock levels accurate across every variant.',
    shipping: 'Manage shipments and tracking for orders in transit.',
    categories: 'A live summary of your catalog structure.',
    media: 'Every image uploaded across the store.',
    campaigns: 'Seasonal banners, offers and campaign pricing — fully controlled from here, no code changes needed.',
    settings: 'Account and store configuration.'
  };
  NAV_ITEMS.forEach(function (item) { ROUTE_TITLES[item.route] = item.label; });
  var ROUTE_RENDERERS = {}; // filled in by each section below

  // Real URLs (/admin/dashboard, /admin/products/12, …) via the History API — not hash
  // fragments. Internal navigation (sidebar links + every dynamically-generated "View"/"Edit"
  // link the renderers below produce) is intercepted so it feels like an SPA, but every one of
  // those URLs also works as a real, bookmarkable, refresh-safe address.
  var Router = (function () {
    function segments() {
      var prefix = BASE_PATH + '/admin';
      var path = window.location.pathname.slice(window.location.pathname.indexOf(prefix) === 0 ? prefix.length : 0).replace(/^\/?/, '');
      return path.split('/').filter(Boolean);
    }
    function currentRoute() { return segments()[0] || 'dashboard'; }
    function currentParam() { return segments()[1] ? decodeURIComponent(segments()[1]) : null; }

    function render() {
      var route = currentRoute();
      document.getElementById('pageTitle').textContent = ROUTE_TITLES[route] || 'Dashboard';
      var subtitleEl = document.getElementById('pageSubtitle');
      if (subtitleEl) subtitleEl.textContent = ROUTE_SUBTITLES[route] || '';
      document.querySelectorAll('.sidebar-nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.route === route); });
      document.getElementById('adminSidebar').classList.remove('open');
      var renderer = ROUTE_RENDERERS[route] || ROUTE_RENDERERS.dashboard;
      renderer(currentParam());
    }

    function navigate(path) {
      if (path !== window.location.pathname) window.history.pushState(null, '', path);
      render();
    }

    function initLinkInterception() {
      document.addEventListener('click', function (event) {
        var link = event.target.closest('a[href^="' + BASE_PATH + '/admin"]');
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(link.getAttribute('href'));
      });
    }

    function start() {
      initLinkInterception();
      window.addEventListener('popstate', render);
      render();
    }
    return { start: start, navigate: navigate, currentParam: currentParam };
  })();

  function initShellChrome() {
    // Sidebar nav is built here (not hardcoded HTML) so BASE_PATH and the icon set stay in one
    // place — see the /you-me comment this used to require in index.html before this rewrite.
    var navEl = document.getElementById('sidebarNav');
    if (navEl) {
      navEl.innerHTML = NAV_ITEMS.map(function (item) {
        return '<a href="' + BASE_PATH + '/admin/' + item.route + '" data-route="' + item.route + '">' +
          '<span class="nav-icon">' + svgIcon(item.icon) + '</span><span>' + esc(item.label) + '</span></a>';
      }).join('');
    }

    var mobileToggle = document.getElementById('mobileNavToggle');
    if (mobileToggle) {
      mobileToggle.innerHTML = svgIcon('menu');
      mobileToggle.addEventListener('click', function () { document.getElementById('adminSidebar').classList.toggle('open'); });
    }
    var logoutIcon = document.querySelector('#logoutBtn .nav-icon');
    if (logoutIcon) logoutIcon.innerHTML = svgIcon('logout');
    var searchIcon = document.querySelector('.search-icon');
    if (searchIcon) searchIcon.innerHTML = svgIcon('search');
    var bellIcon = document.querySelector('.bell-icon');
    if (bellIcon) bellIcon.innerHTML = svgIcon('bell');
    var chevronIcon = document.querySelector('.chevron-icon');
    if (chevronIcon) chevronIcon.innerHTML = svgIcon('chevronDown');
    var toastIcon = document.querySelector('.toast-order-icon');
    if (toastIcon) toastIcon.innerHTML = svgIcon('bell');

    // Typing a name/SKU in the topbar search and hitting Enter jumps to Products pre-filtered —
    // a real shortcut, not just decoration.
    var searchInput = document.getElementById('topbarSearchInput');
    if (searchInput) searchInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !searchInput.value.trim()) return;
      productListState.q = searchInput.value.trim();
      Router.navigate(BASE_PATH + '/admin/products');
    });

    // Profile menu: a lightweight dropdown, not a second logout mechanism — closes on an
    // outside click or a real navigation.
    var profileBtn = document.getElementById('topbarProfile');
    var profileMenu = document.getElementById('topbarProfileMenu');
    if (profileBtn && profileMenu) {
      profileBtn.addEventListener('click', function (e) { e.stopPropagation(); profileMenu.hidden = !profileMenu.hidden; });
      document.addEventListener('click', function () { profileMenu.hidden = true; });
      var settingsLink = document.getElementById('profileMenuSettings');
      if (settingsLink) settingsLink.addEventListener('click', function (e) {
        e.preventDefault(); profileMenu.hidden = true; Router.navigate(BASE_PATH + '/admin/settings');
      });
    }
  }

  function content() { return document.getElementById('adminContent'); }

  /* ---------- 13. Modal helper ---------- */
  var Modal = (function () {
    function open(html) {
      document.getElementById('adminModalBody').innerHTML = html;
      document.getElementById('adminScrim').hidden = false;
      document.getElementById('adminModal').hidden = false;
    }
    function close() {
      document.getElementById('adminScrim').hidden = true;
      document.getElementById('adminModal').hidden = true;
      document.getElementById('adminModalBody').innerHTML = '';
    }
    document.addEventListener('DOMContentLoaded', function () {
      document.getElementById('adminModalClose').addEventListener('click', close);
      document.getElementById('adminScrim').addEventListener('click', close);
    });
    return { open: open, close: close };
  })();

  /* ---------- 4. Dashboard ---------- */
  ROUTE_RENDERERS.dashboard = function () {
    content().innerHTML = '<p class="empty-state">Loading dashboard…</p>';
    Promise.all([AdminAPI.dashboard(), AdminAPI.customers.list()]).then(function (results) {
      var d = results[0];
      d.customers.total = results[1].length;

      content().innerHTML =
        // 1. Primary KPIs — the four numbers that matter first.
        '<div class="kpi-grid">' +
          kpiCard('orders', 'Total Orders', d.orders.total, 'coral') +
          kpiCard('activity', 'Revenue (Paid)', fmtPrice(d.revenue.paid), 'sage') +
          kpiCard('box', 'New Orders', d.orders.new, 'blue') +
          kpiCard('customers', 'Customers', d.customers.total, 'lavender') +
        '</div>' +

        // 2. Order status — one horizontal segmented bar instead of seven equal boxes.
        '<div class="panel-card">' +
          '<div class="panel-card-head"><h3>Order Status</h3></div>' +
          orderStatusBar(d.orders) +
        '</div>' +

        // 3. Order activity (real last-7-day counts, honest empty state) + inventory summary.
        '<div class="dashboard-mid-row">' +
          '<div class="panel-card">' +
            '<div class="panel-card-head"><h3>Order Activity</h3></div>' +
            (d.orders.total === 0
              ? '<div class="chart-empty">' + icon('activity') + '<strong>No order activity yet</strong><span>Your sales activity will appear here after your first order.</span></div>'
              : activityChartSvg(d.last7Days)) +
          '</div>' +
          '<div class="panel-card">' +
            '<div class="panel-card-head"><h3>Inventory</h3></div>' +
            inventorySummary(d.products) +
          '</div>' +
        '</div>' +

        // 4. Recent orders.
        '<div class="panel-card">' +
          '<div class="panel-card-head"><h3>Recent Orders</h3>' + (d.recentOrders.length ? '<a href="' + BASE_PATH + '/admin/orders" class="panel-link">View All Orders</a>' : '') + '</div>' +
          (d.recentOrders.length === 0
            ? '<div class="empty-state-illustrated">' + icon('box') + '<p>No orders yet</p><p>New customer orders will appear here automatically.</p></div>'
            : recentOrdersTable(d.recentOrders)) +
        '</div>' +

        // 5. Quick actions.
        '<div class="panel-card">' +
          '<div class="panel-card-head"><h3>Quick Actions</h3></div>' +
          '<div class="quick-actions-grid">' +
            quickAction('plus', 'Add Product', BASE_PATH + '/admin/products/new') +
            quickAction('orders', 'View Orders', BASE_PATH + '/admin/orders') +
            quickAction('inventory', 'Update Inventory', BASE_PATH + '/admin/inventory') +
            quickAction('shipping', 'Create Shipment', BASE_PATH + '/admin/shipping') +
          '</div>' +
        '</div>';
    });
  };

  function kpiCard(iconName, label, value, tone) {
    return '<div class="kpi-card tone-' + tone + '">' +
      '<div class="kpi-card-icon">' + icon(iconName) + '</div>' +
      '<div><div class="kpi-card-value">' + value + '</div><div class="kpi-card-label">' + label + '</div></div>' +
    '</div>';
  }

  function quickAction(iconName, label, href) {
    return '<a class="quick-action-btn" href="' + href + '">' + icon(iconName) + '<span>' + label + '</span></a>';
  }

  var ORDER_STATUS_TONES = { new: 'amber', confirmed: 'sage', packing: 'blue', shipped: 'lavender', delivered: 'sage', cancelled: 'red' };
  function orderStatusBar(orders) {
    var statuses = ['new', 'confirmed', 'packing', 'shipped', 'delivered', 'cancelled'];
    var total = statuses.reduce(function (sum, s) { return sum + orders[s]; }, 0);
    var bar = total === 0
      ? '<div class="order-status-bar"><span style="width:100%;background:var(--surface-sunk);"></span></div>'
      : '<div class="order-status-bar">' + statuses.map(function (s) {
          var pct = (orders[s] / total) * 100;
          if (pct <= 0) return '';
          return '<span style="width:' + pct + '%;background:var(--' + ORDER_STATUS_TONES[s] + ');"></span>';
        }).join('') + '</div>';
    var legend = '<div class="order-status-legend">' + statuses.map(function (s) {
      return '<div class="status-legend-item"><span class="status-legend-dot" style="background:var(--' + ORDER_STATUS_TONES[s] + ');"></span>' + statusLabel(s) + '<strong>' + orders[s] + '</strong></div>';
    }).join('') + '</div>';
    return bar + legend;
  }

  // Real last-7-day order counts as a small inline SVG bar chart — no chart library, no fake data.
  function activityChartSvg(days) {
    var w = 640, h = 160, padBottom = 24, padTop = 10, barGap = 14;
    var max = Math.max(1, Math.max.apply(null, days.map(function (d) { return d.count; })));
    var barW = (w - barGap * (days.length - 1)) / days.length;
    var bars = days.map(function (d, i) {
      var barH = (d.count / max) * (h - padBottom - padTop);
      var x = i * (barW + barGap);
      var y = h - padBottom - barH;
      return '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + Math.max(barH, 2) + '" rx="6" fill="var(--coral)" opacity="' + (d.count === 0 ? '0.25' : '1') + '"></rect>' +
        '<text x="' + (x + barW / 2) + '" y="' + (h - 6) + '" text-anchor="middle" font-size="10" fill="var(--text-faint)" font-family="var(--font)">' + d.label + '</text>' +
        (d.count > 0 ? '<text x="' + (x + barW / 2) + '" y="' + (y - 6) + '" text-anchor="middle" font-size="10" font-weight="700" fill="var(--text-soft)" font-family="var(--font)">' + d.count + '</text>' : '');
    }).join('');
    return '<div class="activity-chart-wrap"><svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + bars + '</svg></div>';
  }

  function inventorySummary(products) {
    return '<div class="inventory-summary-list">' +
      '<div class="inventory-summary-row"><span class="inventory-summary-dot" style="background:var(--blue);"></span>Total Products<strong>' + products.total + '</strong></div>' +
      '<div class="inventory-summary-row"><span class="inventory-summary-dot" style="background:var(--amber);"></span>Low Stock<strong>' + products.lowStock + '</strong></div>' +
      '<div class="inventory-summary-row"><span class="inventory-summary-dot" style="background:var(--red);"></span>Out of Stock<strong>' + products.outOfStock + '</strong></div>' +
    '</div>';
  }

  function recentOrdersTable(orders) {
    return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Order ID</th><th>Customer</th><th>Product</th><th>Amount</th><th>Payment</th><th>Status</th><th>Date</th><th></th>' +
      '</tr></thead><tbody>' +
      orders.map(function (o) {
        return '<tr>' +
          '<td>' + esc(o.orderNumber) + '</td>' +
          '<td>' + esc(o.customerName) + '</td>' +
          '<td style="display:flex;align-items:center;gap:10px;">' + imageHtml(o.thumbnail) + '<span>' + esc(o.productSummary) + '</span></td>' +
          '<td>' + fmtPrice(o.total) + '</td>' +
          '<td><span class="badge badge-' + o.paymentStatus + '">' + statusLabel(o.paymentStatus) + '</span></td>' +
          '<td><span class="badge badge-' + o.orderStatus + '">' + statusLabel(o.orderStatus) + '</span></td>' +
          '<td>' + fmtDate(o.createdAt) + '</td>' +
          '<td><a href="' + BASE_PATH + '/admin/orders/' + o.id + '" class="icon-action-btn" aria-label="View order">' + icon('eye') + '</a></td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---------- 5. Products ---------- */
  var productListState = { q: '' };

  ROUTE_RENDERERS.products = function (param) {
    if (param === 'new') return renderProductForm(null);
    if (param) return renderProductForm(param);
    renderProductList();
  };

  function renderProductList() {
    content().innerHTML = '<p class="empty-state">Loading products…</p>';
    AdminAPI.products.list().then(function (products) {
      var filtered = productListState.q
        ? products.filter(function (p) { return (p.name + ' ' + p.sku).toLowerCase().indexOf(productListState.q.toLowerCase()) !== -1; })
        : products;

      content().innerHTML =
        '<div class="section-heading-row">' +
          '<div class="search-box"><input type="text" id="productSearch" placeholder="Search by name or SKU…" value="' + esc(productListState.q) + '"></div>' +
          '<a href="' + BASE_PATH + '/admin/products/new" class="btn-primary">+ Add Product</a>' +
        '</div>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr>' +
          '<th>Image</th><th>Name</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Featured</th><th>New</th><th></th>' +
        '</tr></thead><tbody>' +
        (filtered.length === 0 ? '' : filtered.map(function (p) {
          return '<tr>' +
            '<td>' + imageHtml(p.images[0]) + '</td>' +
            '<td>' + esc(p.name) + '</td>' +
            '<td>' + esc(p.sku) + '</td>' +
            '<td>' + esc(p.category) + (p.subcategory ? ' / ' + esc(p.subcategory) : '') + '</td>' +
            '<td>' + fmtPrice(p.price) + (p.oldPrice ? ' <s style="color:#999">' + fmtPrice(p.oldPrice) + '</s>' : '') + '</td>' +
            '<td>' + p.stock + '</td>' +
            '<td><span class="badge badge-' + p.status + '">' + statusLabel(p.status) + '</span></td>' +
            '<td>' + (p.featured ? '✔️' : '—') + '</td>' +
            '<td>' + (p.newArrival ? '✔️' : '—') + '</td>' +
            '<td style="white-space:nowrap;">' +
              '<a href="' + BASE_PATH + '/admin/products/' + p.id + '" class="btn-ghost btn-sm">Edit</a> ' +
              '<button class="btn-ghost btn-sm" data-dup="' + p.id + '">Duplicate</button> ' +
              '<button class="btn-ghost btn-sm" data-toggle-status="' + p.id + '" data-current="' + p.status + '">' + (p.status === 'active' ? 'Disable' : 'Activate') + '</button> ' +
              '<button class="btn-danger btn-sm" data-delete="' + p.id + '">Delete</button>' +
            '</td>' +
          '</tr>';
        }).join('')) +
        '</tbody></table></div>' +
        (filtered.length === 0 ? '<p class="empty-state">No products match your search.</p>' : '');

      document.getElementById('productSearch').addEventListener('input', function (e) {
        productListState.q = e.target.value; renderProductList();
      });
      content().querySelectorAll('[data-dup]').forEach(function (btn) {
        btn.addEventListener('click', function () { AdminAPI.products.duplicate(btn.dataset.dup).then(renderProductList); });
      });
      content().querySelectorAll('[data-toggle-status]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var next = btn.dataset.current === 'active' ? 'draft' : 'active';
          AdminAPI.products.setStatus(btn.dataset.toggleStatus, next).then(renderProductList);
        });
      });
      content().querySelectorAll('[data-delete]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (!window.confirm('Delete this product? If it appears in past orders it will be set to Draft instead.')) return;
          AdminAPI.products.remove(btn.dataset.delete).then(renderProductList);
        });
      });
    });
  }

  function renderProductForm(id) {
    var isNew = !id;
    var load = isNew ? Promise.resolve({ id: null, sku: '', name: '', description: '', fabric: '', category: 'kids', subcategory: '', ageGroup: '', price: '', oldPrice: '', images: [], sizes: [], colors: [], variants: [], featured: false, newArrival: false, status: 'active' }) : AdminAPI.products.get(id);

    load.then(function (p) {
      var state = { images: p.images.slice(), sizes: p.sizes.slice(), colors: p.colors.slice(), variants: p.variants || [] };

      content().innerHTML =
        '<div class="section-heading-row"><h3 style="font-size:1.05rem;">' + (isNew ? 'Add Product' : 'Edit Product') + '</h3>' +
          '<a href="' + BASE_PATH + '/admin/products" class="btn-ghost btn-sm">← Back to Products</a></div>' +
        '<form id="productForm">' +
          '<div class="panel-card">' +
            '<h3>Images</h3>' +
            '<div class="image-upload-grid" id="imageGrid"></div>' +
            '<p style="font-size:0.76rem;color:var(--text-soft);">First image is the main image. Click an image to set it as main, or use the buttons to reorder/delete.</p>' +
          '</div>' +
          '<div class="panel-card">' +
            '<h3>Basics</h3>' +
            '<div class="form-row">' +
              field('pName', 'Product Name', p.name, true) +
              field('pSku', 'SKU', p.sku, true) +
            '</div>' +
            '<div class="form-row">' +
              selectField('pCategory', 'Category', ['kids', 'family', 'couple'], p.category) +
              field('pSubcategory', 'Subcategory', p.subcategory || '') +
            '</div>' +
            '<div class="form-row">' +
              field('pAgeGroup', 'Age Group', p.ageGroup || '') +
              field('pFabric', 'Material / Fabric', p.fabric || '') +
            '</div>' +
            '<div class="form-row">' +
              '<div class="form-field"><label for="pGender">Gender (optional — powers the storefront Gender filter)</label>' +
                '<select id="pGender"><option value=""' + (!p.gender ? ' selected' : '') + '>Not set</option>' +
                  ['boys', 'girls', 'unisex'].map(function (g) { return '<option value="' + g + '"' + (p.gender === g ? ' selected' : '') + '>' + g.charAt(0).toUpperCase() + g.slice(1) + '</option>'; }).join('') +
                '</select></div>' +
            '</div>' +
            '<div class="form-field"><label for="pDescription">Description</label><textarea id="pDescription" rows="3">' + esc(p.description || '') + '</textarea></div>' +
          '</div>' +
          '<div class="panel-card">' +
            '<h3>Pricing &amp; Stock</h3>' +
            '<div class="form-row">' +
              field('pPrice', 'Regular Price (₹)', p.oldPrice || p.price, true, 'number') +
              field('pSalePrice', 'Sale Price (₹, optional)', p.oldPrice ? p.price : '', false, 'number') +
            '</div>' +
            '<p style="font-size:0.76rem;color:var(--text-soft);">Stock is managed per size/color variant below — the total shown on the product list is the sum of all variants.</p>' +
          '</div>' +
          '<div class="panel-card">' +
            '<h3>Sizes</h3>' +
            '<div class="chip-input-row" id="sizeChips"></div>' +
            '<div class="chip-add-row"><input type="text" id="newSizeInput" placeholder="e.g. 2-3Y"><button type="button" class="btn-secondary" id="addSizeBtn">Add</button></div>' +
          '</div>' +
          '<div class="panel-card">' +
            '<h3>Colors</h3>' +
            '<div class="chip-input-row" id="colorChips"></div>' +
            '<div class="chip-add-row"><input type="text" id="newColorName" placeholder="Color name"><input type="color" id="newColorHex" value="#CBA37D"><button type="button" class="btn-secondary" id="addColorBtn">Add</button></div>' +
          '</div>' +
          (isNew ? '' : '<div class="panel-card"><h3>Variant Stock</h3><div class="table-wrap"><table class="data-table variant-table" id="variantTable"></table></div></div>') +
          '<div class="panel-card">' +
            '<div class="toggle-row"><input type="checkbox" id="pFeatured"' + (p.featured ? ' checked' : '') + '><label for="pFeatured">Featured Product (shows in Homepage Featured Products)</label></div>' +
            '<div class="toggle-row"><input type="checkbox" id="pNewArrival"' + (p.newArrival ? ' checked' : '') + '><label for="pNewArrival">New Arrival</label></div>' +
            '<div class="toggle-row"><input type="checkbox" id="pActive"' + (p.status !== 'draft' ? ' checked' : '') + '><label for="pActive">Active (unchecked = Draft, hidden from customers)</label></div>' +
          '</div>' +
          '<p class="login-error" id="productFormError"></p>' +
          '<button type="submit" class="btn-primary">' + (isNew ? 'Create Product' : 'Save Changes') + '</button>' +
        '</form>';

      function field(id, label, val, required, type) {
        return '<div class="form-field"><label for="' + id + '">' + label + '</label><input type="' + (type || 'text') + '" id="' + id + '" value="' + esc(val) + '"' + (required ? ' required' : '') + '></div>';
      }
      function selectField(id, label, options, val) {
        return '<div class="form-field"><label for="' + id + '">' + label + '</label><select id="' + id + '">' +
          options.map(function (o) { return '<option value="' + o + '"' + (o === val ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></div>';
      }

      renderImageGrid();
      renderSizeChips();
      renderColorChips();
      if (!isNew) renderVariantTable();

      function renderImageGrid() {
        var grid = document.getElementById('imageGrid');
        grid.innerHTML = state.images.map(function (url, i) {
          return '<div class="image-slot' + (i === 0 ? ' primary' : '') + '" data-idx="' + i + '">' +
            imageHtml(url, 'thumb').replace('class="thumb"', 'style="width:100%;height:100%;object-fit:cover;"') +
            '<div class="image-slot-actions">' +
              (i !== 0 ? '<button type="button" data-set-main="' + i + '">Main</button>' : '') +
              '<button type="button" data-remove-img="' + i + '">Remove</button>' +
            '</div></div>';
        }).join('') +
          '<label class="image-slot image-slot-add"><span>📷</span><span id="imageUploadLabel">Add Image</span><input type="file" accept="image/*" id="imageFileInput" multiple></label>';

        grid.querySelectorAll('[data-set-main]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var i = Number(btn.dataset.setMain);
            state.images.splice(0, 0, state.images.splice(i, 1)[0]);
            renderImageGrid();
          });
        });
        grid.querySelectorAll('[data-remove-img]').forEach(function (btn) {
          btn.addEventListener('click', function () { state.images.splice(Number(btn.dataset.removeImg), 1); renderImageGrid(); });
        });
        document.getElementById('imageFileInput').addEventListener('change', function (e) {
          var files = Array.prototype.slice.call(e.target.files || []);
          var label = document.getElementById('imageUploadLabel');
          if (label && files.length) label.textContent = 'Uploading…';
          files.forEach(function (file) {
            AdminAPI.media.upload(file)
              .then(function (data) { state.images.push(data.url); renderImageGrid(); })
              .catch(function (err) { window.alert(err.message || 'Upload failed'); if (label) label.textContent = 'Add Image'; });
          });
        });
      }

      function renderSizeChips() {
        document.getElementById('sizeChips').innerHTML = state.sizes.map(function (s, i) {
          return '<span class="editable-chip">' + esc(s) + '<button type="button" data-remove-size="' + i + '">&times;</button></span>';
        }).join('') || '<span style="font-size:0.8rem;color:var(--text-soft);">No sizes yet.</span>';
        document.querySelectorAll('[data-remove-size]').forEach(function (btn) {
          btn.addEventListener('click', function () { state.sizes.splice(Number(btn.dataset.removeSize), 1); renderSizeChips(); if (!isNew) renderVariantTable(); });
        });
      }
      document.getElementById('addSizeBtn').addEventListener('click', function () {
        var input = document.getElementById('newSizeInput');
        var val = input.value.trim();
        if (val && state.sizes.indexOf(val) === -1) { state.sizes.push(val); input.value = ''; renderSizeChips(); if (!isNew) renderVariantTable(); }
      });

      function renderColorChips() {
        document.getElementById('colorChips').innerHTML = state.colors.map(function (c, i) {
          return '<span class="editable-chip"><span style="width:12px;height:12px;border-radius:50%;background:' + esc(c.hex) + ';display:inline-block;"></span>' + esc(c.name) + '<button type="button" data-remove-color="' + i + '">&times;</button></span>';
        }).join('') || '<span style="font-size:0.8rem;color:var(--text-soft);">No colors yet.</span>';
        document.querySelectorAll('[data-remove-color]').forEach(function (btn) {
          btn.addEventListener('click', function () { state.colors.splice(Number(btn.dataset.removeColor), 1); renderColorChips(); if (!isNew) renderVariantTable(); });
        });
      }
      document.getElementById('addColorBtn').addEventListener('click', function () {
        var nameInput = document.getElementById('newColorName');
        var name = nameInput.value.trim();
        var hex = document.getElementById('newColorHex').value;
        if (name && !state.colors.some(function (c) { return c.name === name; })) { state.colors.push({ name: name, hex: hex }); nameInput.value = ''; renderColorChips(); if (!isNew) renderVariantTable(); }
      });

      function renderVariantTable() {
        var wrap = document.getElementById('variantTable');
        if (!wrap) return;
        var rows = [];
        state.sizes.forEach(function (size) {
          state.colors.forEach(function (color) {
            var existing = state.variants.find(function (v) { return v.size === size && v.color === color.name; });
            rows.push({ size: size, color: color.name, stock: existing ? existing.stock : 0, id: existing ? existing.id : null });
          });
        });
        wrap.innerHTML = '<thead><tr><th>Size</th><th>Color</th><th>Stock</th><th></th></tr></thead><tbody>' +
          (rows.length === 0 ? '<tr><td colspan="4" style="color:var(--text-soft);">Add sizes and colors to manage stock per variant.</td></tr>' : rows.map(function (r, i) {
            return '<tr><td>' + esc(r.size) + '</td><td>' + esc(r.color) + '</td>' +
              '<td><input type="number" min="0" class="variant-stock-input" data-variant-id="' + (r.id || '') + '" value="' + r.stock + '"></td>' +
              '<td>' + (r.id ? '<button type="button" class="btn-ghost btn-sm" data-save-variant="' + r.id + '">Update</button>' : '<span style="font-size:0.72rem;color:var(--text-soft);">Save product first</span>') + '</td></tr>';
          }).join('')) + '</tbody>';

        wrap.querySelectorAll('[data-save-variant]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var input = wrap.querySelector('.variant-stock-input[data-variant-id="' + btn.dataset.saveVariant + '"]');
            AdminAPI.products.setVariantStock(p.id, Number(btn.dataset.saveVariant), Number(input.value))
              .then(function () { btn.textContent = 'Saved ✓'; window.setTimeout(function () { btn.textContent = 'Update'; }, 1200); });
          });
        });
      }

      document.getElementById('productForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var payload = {
          name: document.getElementById('pName').value.trim(),
          sku: document.getElementById('pSku').value.trim(),
          category: document.getElementById('pCategory').value,
          subcategory: document.getElementById('pSubcategory').value.trim(),
          ageGroup: document.getElementById('pAgeGroup').value.trim(),
          gender: document.getElementById('pGender').value || null,
          fabric: document.getElementById('pFabric').value.trim(),
          description: document.getElementById('pDescription').value.trim(),
          price: Number(document.getElementById('pPrice').value),
          salePrice: document.getElementById('pSalePrice').value ? Number(document.getElementById('pSalePrice').value) : null,
          images: state.images,
          sizes: state.sizes,
          colors: state.colors,
          featured: document.getElementById('pFeatured').checked,
          newArrival: document.getElementById('pNewArrival').checked,
          status: document.getElementById('pActive').checked ? 'active' : 'draft'
        };
        var errorEl = document.getElementById('productFormError');
        errorEl.textContent = '';
        var req = isNew ? AdminAPI.products.create(payload) : AdminAPI.products.update(p.id, payload);
        req.then(function (saved) { Router.navigate(BASE_PATH + '/admin/products/' + saved.id); })
          .catch(function (err) { errorEl.textContent = err.message; });
      });
    });
  }

  /* ---------- 6. Orders ---------- */
  var orderListState = { status: 'all', q: '' };
  var ORDER_STATUSES = ['new', 'confirmed', 'packing', 'packed', 'ready_to_ship', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];
  // Once Delhivery has a confirmed shipment (a real provider_shipment_id/AWB), Delhivery becomes
  // the source of truth for everything from "shipped" onward — Admin no longer hand-sets those
  // stages, they're synced automatically (see delhivery-shipping's syncShipment, which advances
  // orders.order_status itself). Admin still fully owns internal prep before that point, and can
  // still cancel the order outright.
  var INTERNAL_ORDER_STATUSES = ['new', 'confirmed', 'packing', 'packed', 'ready_to_ship', 'cancelled'];
  var PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

  ROUTE_RENDERERS.orders = function (param) {
    if (param) return renderOrderDetail(param);
    renderOrderList();
  };

  function renderOrderList() {
    content().innerHTML = '<p class="empty-state">Loading orders…</p>';
    AdminAPI.orders.list({ status: orderListState.status, q: orderListState.q }).then(function (orders) {
      content().innerHTML =
        '<div class="filter-bar">' +
          ['all'].concat(ORDER_STATUSES).map(function (s) {
            return '<button type="button" class="filter-chip' + (orderListState.status === s ? ' active' : '') + '" data-status="' + s + '">' + (s === 'all' ? 'All' : statusLabel(s)) + '</button>';
          }).join('') +
          '<div class="search-box"><input type="text" id="orderSearch" placeholder="Search Order ID, name or phone…" value="' + esc(orderListState.q) + '"></div>' +
        '</div>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr>' +
          '<th>Order</th><th>Date</th><th>Customer</th><th>Phone</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th></th>' +
        '</tr></thead><tbody>' +
        (orders.length === 0 ? '' : orders.map(function (o) {
          return '<tr>' +
            '<td>' + esc(o.orderNumber) + '</td>' +
            '<td>' + fmtDate(o.createdAt) + '</td>' +
            '<td>' + esc(o.customerName) + '</td>' +
            '<td>' + esc(o.phone) + '</td>' +
            '<td><div class="thumb-row">' + o.thumbnails.map(function (t) { return imageHtml(t); }).join('') + '</div> ' + o.itemCount + ' item(s)</td>' +
            '<td>' + fmtPrice(o.total) + '</td>' +
            '<td><span class="badge badge-' + o.paymentStatus + '">' + statusLabel(o.paymentStatus) + '</span></td>' +
            '<td><span class="badge badge-' + o.orderStatus + '">' + statusLabel(o.orderStatus) + '</span></td>' +
            '<td><a href="' + BASE_PATH + '/admin/orders/' + o.id + '" class="btn-ghost btn-sm">View</a></td>' +
          '</tr>';
        }).join('')) + '</tbody></table></div>' +
        (orders.length === 0
          ? '<div class="empty-state">' +
              (orderListState.status === 'all' && !orderListState.q
                ? '<p><strong>No orders yet</strong></p><p>New customer orders will appear here automatically.</p>'
                : '<p>No orders match this filter.</p>') +
            '</div>'
          : '');

      content().querySelectorAll('[data-status]').forEach(function (btn) {
        btn.addEventListener('click', function () { orderListState.status = btn.dataset.status; renderOrderList(); });
      });
      document.getElementById('orderSearch').addEventListener('input', function (e) {
        orderListState.q = e.target.value; renderOrderList();
      });
    });
  }

  /* ---------- Invoice ---------- */
  // Same rule as public.eligible_for_invoice() in the database — kept in sync deliberately so
  // Admin never sees a button the server would refuse. generate_invoice_for_order() re-checks
  // this itself regardless; this is only what the button looks like before the click.
  function invoiceEligible(o) {
    return o.paymentStatus === 'paid' && ['new', 'cancelled'].indexOf(o.orderStatus) === -1;
  }
  function getExistingInvoice(orderId) {
    return supabaseClient.from('invoices').select('*').eq('order_id', orderId).maybeSingle()
      .then(function (res) { return res.data || null; })
      .catch(function () { return null; });
  }
  // Creates the invoice on first call (server-side, via generate_invoice_for_order — the only
  // way an invoices row is ever written), or just returns the existing one after that. Never
  // generates a second invoice for the same order — same function the customer site calls, same
  // canonical invoice either surface ends up showing.
  function ensureInvoice(orderId) {
    return supabaseClient.rpc('generate_invoice_for_order', { p_order_id: orderId })
      .then(function (res) { if (res.error) throw res.error; return res.data; });
  }
  var INVOICE_SELLER_FALLBACK = { name: 'You & Me' };

  // Mirrors invoiceLogoHtml() in the customer site's script.js — pulls the src straight off the
  // already-embedded admin sidebar logo <img> (admin's markup uses class "sidebar-logo-img", NOT
  // "navbar-brand-logo" like the customer site) so both files reuse the one official brand asset
  // instead of drawing text, and never rely on a relative path that could break on a fresh page.
  function invoiceLogoHtml() {
    var logoImg = document.querySelector('.sidebar-logo-img');
    var src = logoImg && logoImg.src;
    if (!src) return '<h1>YOU &amp; ME</h1>';
    return '<img class="inv-logo" src="' + src + '" alt="You & Me">';
  }

  // Mirrors buildInvoiceHtml() in the customer site's script.js — same visual document, same
  // data (the invoices row + the order's own immutable order_items), adapted only to admin.js's
  // already-mapped order-detail shape (o.items / o.customer / o.address / …) instead of raw
  // Supabase columns.
  function buildInvoiceHtml(o, invoice) {
    var seller = invoice.seller_snapshot || INVOICE_SELLER_FALLBACK;
    var customer = invoice.customer_snapshot || {};
    var addr = invoice.shipping_address_snapshot || {};
    var shipment = invoice.shipping_snapshot;
    var sellerAddrLine = [seller.line1, seller.line2].filter(Boolean).join(', ');
    var sellerCityLine = [seller.city, seller.state, seller.pincode].filter(Boolean).join(', ');
    var addrLine1 = [addr.house, addr.street].filter(Boolean).join(', ') + (addr.landmark ? ' (near ' + addr.landmark + ')' : '');
    var addrLine2 = [addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');

    var itemRows = o.items.map(function (it) {
      return '<tr>' +
        '<td>' + esc(it.name) + '</td>' +
        '<td>' + esc(it.sku || '—') + '</td>' +
        '<td>' + esc(it.size || '—') + '</td>' +
        '<td>' + esc(it.color || '—') + '</td>' +
        '<td class="num">' + it.quantity + '</td>' +
        '<td class="num">' + fmtPrice(it.unitPrice) + '</td>' +
        '<td class="num">' + fmtPrice(it.totalPrice) + '</td>' +
      '</tr>';
    }).join('');

    var summaryRows =
      '<tr><td>Subtotal</td><td class="num">' + fmtPrice(invoice.subtotal) + '</td></tr>' +
      (invoice.discount > 0 ? '<tr><td>Discount</td><td class="num">&minus;' + fmtPrice(invoice.discount) + '</td></tr>' : '') +
      '<tr><td>Shipping Charge</td><td class="num">' + (invoice.shipping_amount === 0 ? 'Free' : fmtPrice(invoice.shipping_amount)) + '</td></tr>' +
      (invoice.tax_amount > 0 ? '<tr><td>Tax</td><td class="num">' + fmtPrice(invoice.tax_amount) + '</td></tr>' : '') +
      '<tr class="grand"><td>Grand Total</td><td class="num">' + fmtPrice(invoice.grand_total) + '</td></tr>';

    var titleSafe = 'You-and-Me-Invoice-' + invoice.invoice_number.replace(/\s+/g, '-');

    return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(titleSafe) + '</title><style>' +
      'body{font-family:Poppins,Arial,sans-serif;color:#2E2A26;margin:0;padding:32px;background:#fff;}' +
      '.invoice{max-width:760px;margin:0 auto;}' +
      '.inv-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #F1E4D3;padding-bottom:20px;margin-bottom:24px;}' +
      '.inv-brand h1{margin:0;font-size:1.6rem;color:#E68A98;}' +
      '.inv-logo{display:block;height:48px;width:auto;max-width:220px;object-fit:contain;object-position:left center;}' +
      '.inv-brand p{margin:6px 0 0;color:#6B6259;font-size:0.85rem;}' +
      '.inv-meta{text-align:right;font-size:0.85rem;color:#2E2A26;}' +
      '.inv-meta strong{color:#E68A98;}' +
      'h2.section{font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;color:#6B6259;margin:24px 0 8px;}' +
      '.inv-cols{display:flex;gap:32px;}' +
      '.inv-cols > div{flex:1;font-size:0.9rem;line-height:1.5;}' +
      'table{width:100%;border-collapse:collapse;font-size:0.85rem;margin-top:8px;}' +
      'th{text-align:left;background:#FBF6F1;padding:8px 10px;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.04em;color:#6B6259;}' +
      'td{padding:8px 10px;border-bottom:1px solid #F1E4D3;}' +
      'td.num,th.num{text-align:right;}' +
      '.summary-table{width:280px;margin-left:auto;margin-top:8px;}' +
      '.summary-table td{border-bottom:none;padding:4px 10px;}' +
      '.summary-table tr.grand td{font-weight:700;font-size:1rem;border-top:2px solid #2E2A26;padding-top:8px;}' +
      '.inv-footer{margin-top:32px;padding-top:16px;border-top:1px solid #F1E4D3;font-size:0.78rem;color:#6B6259;text-align:center;}' +
      '@media print{body{padding:0;} @page{size:A4;margin:16mm;}}' +
      '</style></head><body><div class="invoice">' +
      '<div class="inv-head">' +
        '<div class="inv-brand">' + invoiceLogoHtml() + '<p>Together in Every Style</p></div>' +
        '<div class="inv-meta">' +
          '<div><strong>Invoice #' + esc(invoice.invoice_number) + '</strong></div>' +
          '<div>Invoice Date: ' + fmtDate(invoice.invoice_date) + '</div>' +
          '<div>Order Number: ' + esc(o.orderNumber) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="inv-cols">' +
        '<div><h2 class="section">Customer Details</h2>' +
          esc(customer.name || '') + '<br>' +
          (customer.email ? esc(customer.email) + '<br>' : '') +
          esc(customer.phone || '') +
        '</div>' +
        '<div><h2 class="section">Shipping Address</h2>' +
          esc(addrLine1) + '<br>' + esc(addrLine2) +
        '</div>' +
        '<div><h2 class="section">Sold By</h2>' +
          esc(seller.name || 'You & Me') + '<br>' +
          (sellerAddrLine ? esc(sellerAddrLine) + '<br>' : '') +
          (sellerCityLine ? esc(sellerCityLine) + '<br>' : '') +
          (seller.phone ? esc(seller.phone) : '') +
        '</div>' +
      '</div>' +
      '<h2 class="section">Order Items</h2>' +
      '<table><thead><tr><th>Product</th><th>SKU</th><th>Size</th><th>Color</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Line Total</th></tr></thead>' +
      '<tbody>' + itemRows + '</tbody></table>' +
      '<table class="summary-table"><tbody>' + summaryRows + '</tbody></table>' +
      '<h2 class="section">Payment</h2>' +
      '<div style="font-size:0.9rem;">Method: ' + esc(paymentMethodLabel(invoice.payment_method)) + '<br>' +
        'Status: ' + esc(statusLabel(invoice.payment_status)) +
        (invoice.payment_reference ? '<br>Reference: ' + esc(invoice.payment_reference) : '') +
      '</div>' +
      (shipment && shipment.provider ? '<h2 class="section">Shipping</h2>' +
        '<div style="font-size:0.9rem;">Shipping Partner: ' + esc(shipment.provider === 'delhivery' ? 'Delhivery' : shipment.provider === 'shiprocket' ? 'Shiprocket' : shipment.provider === 'amazon_shipping' ? 'Amazon Shipping' : shipment.provider) +
        (shipment.tracking_id ? '<br>Tracking / AWB: ' + esc(shipment.tracking_id) : '') +
        '</div>' : '') +
      '<div class="inv-footer">This is a system-generated invoice for a You &amp; Me order.</div>' +
      '</div><script>window.onload=function(){setTimeout(function(){window.print();},150);};<\/script>' +
      '</body></html>';
  }
  function openInvoiceDocument(o, invoice) {
    var html = buildInvoiceHtml(o, invoice);
    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var win = window.open(url, '_blank');
    if (!win) window.location.href = url;
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  function renderOrderDetail(id) {
    content().innerHTML = '<p class="empty-state">Loading order…</p>';
    shippingProviderChoice = null;
    shippingCreateError = null;
    delhiveryServiceability = null;
    delhiveryServiceabilityError = null;
    shiprocketServiceability = null;
    shiprocketServiceabilityError = null;
    shiprocketSelectedCourierId = null;
    AdminAPI.orders.get(id).then(function (o) {
      Promise.all([
        AdminAPI.shipments.get(o.id).catch(function () { return null; }),
        getExistingInvoice(o.id)
      ]).then(function (results) {
        var shipment = results[0], invoice = results[1];
        o.shipment = shipment || o.shipment;
        // Any provider with its own real automatic tracking (Delhivery, Shiprocket — not Custom
        // Delivery, which stays fully admin-managed) takes over order_status from here.
        var COURIER_TRACKED_PROVIDERS = ['delhivery', 'shiprocket'];
        var isDelhiveryConfirmed = !!(o.shipment && COURIER_TRACKED_PROVIDERS.indexOf(o.shipment.provider) !== -1 && o.shipment.provider_shipment_id);
        var orderStatusOptions = isDelhiveryConfirmed ? INTERNAL_ORDER_STATUSES : ORDER_STATUSES;
        // True once the courier's own sync has already advanced order_status past the
        // admin-owned prep stages — at that point there's nothing left here for Admin to set.
        var courierLocked = isDelhiveryConfirmed && INTERNAL_ORDER_STATUSES.indexOf(o.orderStatus) === -1;
        var courierProviderLabel = o.shipment && o.shipment.provider === 'shiprocket' ? 'Shiprocket' : 'Delhivery';
        content().innerHTML =
          '<div class="section-heading-row"><h3 style="font-size:1.1rem;">Order ' + esc(o.orderNumber) + '</h3>' +
            '<a href="' + BASE_PATH + '/admin/orders" class="btn-ghost btn-sm">← Back to Orders</a></div>' +
          '<div class="order-detail-grid">' +
            '<div>' +
              '<div class="panel-card"><h3>Customer</h3>' +
                '<p>Name: ' + esc(o.customer.name) + '<br>Phone: ' + esc(o.customer.phone) + (o.customer.email ? '<br>Email: ' + esc(o.customer.email) : '') + '</p>' +
                '<p>Address: ' + esc(o.address.house) + ', ' + esc(o.address.street) + (o.address.landmark ? ' (near ' + esc(o.address.landmark) + ')' : '') +
                  '<br>' + esc(o.address.city) + ', ' + esc(o.address.state) + ' — ' + esc(o.address.pincode) + '</p>' +
              '</div>' +
              '<div class="panel-card"><h3>Products</h3>' +
                o.items.map(function (it) {
                  return '<div class="order-item-row">' + imageHtml(it.image, 'thumb') +
                    '<div style="flex:1;"><div class="order-item-name">' + esc(it.name) + '</div>' +
                    '<div class="order-item-meta">SKU: ' + esc(it.sku || '—') + ' &middot; Size: ' + esc(it.size) + ' &middot; Color: ' + esc(it.color) + ' &middot; Qty: ' + it.quantity + '</div></div>' +
                    '<div style="text-align:right;font-weight:600;">' + fmtPrice(it.unitPrice) + ' × ' + it.quantity + '<br>' + fmtPrice(it.totalPrice) + '</div>' +
                  '</div>';
                }).join('') +
              '</div>' +
              '<div class="panel-card"><h3>Order Summary</h3>' +
                '<div class="totals-row"><span>Subtotal</span><span>' + fmtPrice(o.totals.subtotal) + '</span></div>' +
                '<div class="totals-row"><span>Delivery</span><span>' + fmtPrice(o.totals.delivery) + '</span></div>' +
                '<div class="totals-row"><span>Discount</span><span>-' + fmtPrice(o.totals.discount) + '</span></div>' +
                '<div class="totals-row grand"><span>Total</span><span>' + fmtPrice(o.totals.total) + '</span></div>' +
              '</div>' +
              renderShippingCard(o) +
            '</div>' +
            '<div>' +
              '<div class="panel-card"><h3>Payment</h3>' +
                '<p>Provider: ' + esc(o.paymentMethod === 'cashfree' ? 'Cashfree' : (o.paymentMethod === 'whatsapp' ? 'WhatsApp / Manual' : o.paymentMethod)) +
                  '<br>Method: ' + esc(paymentMethodLabel(o.paymentMethod, o.cashfreePaymentMethod)) +
                  '<br>Status: <span class="badge badge-' + o.paymentStatus + '">' + statusLabel(o.paymentStatus) + '</span></p>' +
                (o.paymentStatus === 'paid' ? '<p>Paid Amount: <strong>' + fmtPrice(o.totals.total) + '</strong>' + (o.paidAt ? '<br>Paid At: ' + fmtDate(o.paidAt) : '') + '</p>' : '') +
                (o.paymentMethod === 'cashfree' && o.cashfreeCfPaymentId ? '<p style="font-size:0.8rem;">Cashfree Payment ID: ' + esc(o.cashfreeCfPaymentId) + '</p>' : '') +
                (o.paymentReference ? '<p style="font-size:0.8rem;">Reference' + (o.paymentMethod === 'cashfree' ? ' (Bank/UPI)' : '') + ': ' + esc(o.paymentReference) + '</p>' : '') +
                (o.paymentNotes ? '<p style="font-size:0.8rem;">Notes: ' + esc(o.paymentNotes) + '</p>' : '') +
                (o.paymentMethod === 'cashfree'
                  ? '<p class="amazon-shipping-hint">Verified automatically by Cashfree — not manually editable, even by an admin.</p>'
                  : '<div class="form-field"><label for="paymentStatusSelect">Update payment status</label>' +
                      '<select id="paymentStatusSelect">' + PAYMENT_STATUSES.map(function (s) { return '<option value="' + s + '"' + (s === o.paymentStatus ? ' selected' : '') + '>' + statusLabel(s) + '</option>'; }).join('') + '</select></div>' +
                    '<div class="form-field"><label for="paymentRefInput">Payment reference / notes</label><input type="text" id="paymentRefInput" placeholder="UPI ref, screenshot note…"></div>' +
                    '<button type="button" class="btn-primary btn-sm" id="savePaymentBtn">Update Payment</button>') +
              '</div>' +
              '<div class="panel-card"><h3>' + (isDelhiveryConfirmed ? 'Order Preparation' : 'Order Status') + '</h3>' +
                '<div class="status-timeline">' + o.statusHistory.map(function (h) {
                  return '<div class="status-timeline-item"><span class="status-timeline-dot"></span><div><strong>' + statusLabel(h.status) + '</strong><br><span style="color:var(--text-soft);">' + fmtDate(h.created_at) + (h.note ? ' — ' + esc(h.note) : '') + '</span></div></div>';
                }).join('') + '</div>' +
                (courierLocked
                  ? '<p class="shipping-provider-warning">' + esc(courierProviderLabel) + ' is now tracking this shipment automatically — see the Shipping card below for live courier status. This stage is no longer manually editable.</p>'
                  : '<div class="status-select-row">' +
                      '<select id="orderStatusSelect">' + orderStatusOptions.map(function (s) { return '<option value="' + s + '"' + (s === o.orderStatus ? ' selected' : '') + '>' + statusLabel(s) + '</option>'; }).join('') + '</select>' +
                      '<button type="button" class="btn-primary btn-sm" id="saveStatusBtn">Update</button>' +
                    '</div>' +
                    (isDelhiveryConfirmed ? '<p class="account-payment-note" style="margin-top:6px;">Once shipped, courier tracking (Shipped / In Transit / Out for Delivery / Delivered) syncs automatically from ' + esc(courierProviderLabel) + ' — no need to set those here.</p>' : '')
                ) +
              '</div>' +
              '<div class="panel-card"><h3>Invoice</h3>' +
                (invoice
                  ? '<p>Invoice Number: <strong>' + esc(invoice.invoice_number) + '</strong><br>Invoice Date: ' + fmtDate(invoice.invoice_date) + '</p>' +
                    '<div class="amazon-shipping-actions">' +
                      '<button type="button" class="btn-secondary btn-sm" id="viewInvoiceBtn">View Invoice</button>' +
                      '<button type="button" class="btn-primary btn-sm" id="downloadInvoiceBtn">Download PDF</button>' +
                    '</div>'
                  : invoiceEligible(o)
                    ? '<p class="amazon-shipping-hint">No invoice generated yet.</p><button type="button" class="btn-primary btn-sm" id="generateInvoiceBtn">Generate Invoice</button>'
                    : '<p class="amazon-shipping-hint">Invoice will be available once payment is confirmed and the order is out of "New".</p>') +
              '</div>' +
            '</div>' +
          '</div>';

        var savePaymentBtn = document.getElementById('savePaymentBtn');
        if (savePaymentBtn) savePaymentBtn.addEventListener('click', function () {
          AdminAPI.orders.setPayment(o.id, {
            paymentStatus: document.getElementById('paymentStatusSelect').value,
            paymentNotes: document.getElementById('paymentRefInput').value.trim() || null
          }).then(function () { renderOrderDetail(o.id); });
        });
        var saveStatusBtn = document.getElementById('saveStatusBtn');
        if (saveStatusBtn) {
          saveStatusBtn.addEventListener('click', function () {
            AdminAPI.orders.setStatus(o.id, document.getElementById('orderStatusSelect').value)
              .then(function () { renderOrderDetail(o.id); });
          });
        }
        var viewInvoiceBtn = document.getElementById('viewInvoiceBtn');
        if (viewInvoiceBtn) viewInvoiceBtn.addEventListener('click', function () { openInvoiceDocument(o, invoice); });
        var downloadInvoiceBtn = document.getElementById('downloadInvoiceBtn');
        if (downloadInvoiceBtn) downloadInvoiceBtn.addEventListener('click', function () { openInvoiceDocument(o, invoice); });
        var generateInvoiceBtn = document.getElementById('generateInvoiceBtn');
        if (generateInvoiceBtn) generateInvoiceBtn.addEventListener('click', function () {
          generateInvoiceBtn.disabled = true;
          generateInvoiceBtn.textContent = 'Generating…';
          ensureInvoice(o.id).then(function () { renderOrderDetail(o.id); }).catch(function (err) {
            generateInvoiceBtn.disabled = false;
            generateInvoiceBtn.textContent = 'Generate Invoice';
            alert(err.message || 'Could not generate the invoice.');
          });
        });
        bindShippingForm(o);
      });
    });
  }

  // Transient UI-only state for the order-detail Shipping card — reset every time a fresh
  // order loads (renderOrderDetail), never persisted. shippingProviderChoice lets the provider
  // dropdown redraw the card locally (no network round-trip) before anything is actually saved.
  var shippingProviderChoice = null;
  var shippingCreateError = null;
  var delhiveryServiceability = null; // null | { serviceable, codAvailable, prepaidAvailable }
  var delhiveryServiceabilityError = null;
  var shiprocketServiceability = null; // null | { serviceable, couriers: [...] }
  var shiprocketServiceabilityError = null;
  var shiprocketSelectedCourierId = null;
  // Same wording as the customer-facing COURIER_STATUS_LABELS in script.js — Admin and the
  // customer should describe the exact same Delhivery-reported state identically.
  var NORMALIZED_STATUS_LABELS = {
    shipment_created: 'Preparing for Pickup', pickup_scheduled: 'Ready for Pickup', picked_up: 'Picked Up',
    in_transit: 'In Transit', out_for_delivery: 'Out for Delivery', delivered: 'Delivered',
    delivery_failed: 'Delivery Attempt Failed', returned: 'Return to Origin', cancelled: 'Cancelled'
  };
  var PROVIDER_LABELS = { manual: 'Custom Delivery', amazon_shipping: 'Amazon Shipping', delhivery: 'Delhivery', shiprocket: 'Shiprocket' };

  function renderShippingCard(o) {
    var s = o.shipment;
    var provider = shippingProviderChoice || (s && s.provider) || 'manual';
    var section = provider === 'amazon_shipping' ? renderAmazonSection(o, s)
      : provider === 'delhivery' ? renderDelhiverySection(o, s)
      : provider === 'shiprocket' ? renderShiprocketSection(o, s)
      : renderManualSection(s);
    return '<div class="panel-card" id="shippingCardWrap"><h3>Shipping</h3>' +
      '<div class="form-field"><label for="shipProviderSelect">Shipping Provider</label>' +
        '<select id="shipProviderSelect">' +
          '<option value="manual"' + (provider === 'manual' ? ' selected' : '') + '>Custom Delivery</option>' +
          '<option value="delhivery"' + (provider === 'delhivery' ? ' selected' : '') + '>Delhivery</option>' +
          '<option value="shiprocket"' + (provider === 'shiprocket' ? ' selected' : '') + '>Shiprocket</option>' +
          (s && s.provider === 'amazon_shipping' ? '<option value="amazon_shipping" selected>Amazon Shipping</option>' : '') +
        '</select></div>' +
      (s && s.provider && s.provider !== provider
        ? '<p class="shipping-provider-warning">This order already has a ' + (PROVIDER_LABELS[s.provider] || s.provider) + ' shipment. Creating a new one here replaces it.</p>'
        : '') +
      section +
    '</div>';
  }

  function renderManualSection(s) {
    var isManual = s && s.provider === 'manual';
    return '<div class="form-row">' +
        '<div class="form-field"><label>Courier</label><input type="text" id="shipCourier" value="' + esc(isManual ? s.courier : '') + '" placeholder="e.g. India Post, local courier…"></div>' +
        '<div class="form-field"><label>Tracking ID</label><input type="text" id="shipTrackingId" value="' + esc(isManual ? s.tracking_id : '') + '"></div>' +
      '</div>' +
      '<div class="form-field"><label>Tracking URL</label><input type="text" id="shipUrl" value="' + esc(isManual ? s.tracking_url : '') + '"></div>' +
      '<div class="form-row">' +
        '<div class="form-field"><label>Shipping Cost (₹)</label><input type="number" id="shipCost" value="' + esc(isManual ? s.shipping_cost : '') + '"></div>' +
        '<div class="form-field"><label>Estimated Delivery</label><input type="date" id="shipEta" value="' + esc(isManual ? s.estimated_delivery : '') + '"></div>' +
      '</div>' +
      '<div class="form-field"><label>Pickup Date</label><input type="date" id="shipPickup" value="' + esc(isManual ? s.pickup_date : '') + '"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button type="button" class="btn-primary btn-sm" id="shipSaveBtn">' + (isManual ? 'Update Shipment' : 'Create Shipment') + '</button>' +
        '<button type="button" class="btn-secondary btn-sm" id="shipPrintBtn"' + (isManual ? '' : ' disabled') + '>Print Label</button>' +
        '<button type="button" class="btn-secondary btn-sm" id="shipCopyBtn"' + (isManual && s.tracking_id ? '' : ' disabled') + '>Copy Tracking ID</button>' +
        (isManual && s.tracking_url ? '<a href="' + esc(s.tracking_url) + '" target="_blank" class="btn-secondary btn-sm">Track Shipment</a>' : '<button type="button" class="btn-secondary btn-sm" disabled>Track Shipment</button>') +
      '</div>';
  }

  function renderAmazonSection(o, s) {
    var isAmazon = s && s.provider === 'amazon_shipping';
    var errorBox = function (message) {
      return '<div class="shipping-error-box"><strong>Amazon Shipment Could Not Be Created</strong>' +
        '<p>Reason: ' + esc(message) + '</p><button type="button" class="btn-secondary btn-sm" id="amzRetryBtn">Try Again</button></div>';
    };

    // A shipment row exists AND Amazon actually confirmed it (has a provider_shipment_id) —
    // otherwise (no row, or a row with only a recorded failure) fall through to the create form.
    if (isAmazon && s.provider_shipment_id) {
      var events = (s.shipment_events || []).slice().sort(function (a, b) { return new Date(b.event_time || b.created_at) - new Date(a.event_time || a.created_at); });
      var terminal = ['delivered', 'cancelled', 'returned'].indexOf(s.normalized_status) !== -1;
      return '<div class="amazon-shipping-card">' +
          '<div class="amazon-shipping-head"><strong>AMAZON SHIPPING</strong><span class="badge badge-' + esc(s.normalized_status) + '">' + esc(NORMALIZED_STATUS_LABELS[s.normalized_status] || s.normalized_status) + '</span></div>' +
          '<div class="amazon-shipping-grid">' +
            '<div><span>Tracking ID</span><strong>' + (s.tracking_id ? esc(s.tracking_id) : 'Unavailable') + '</strong></div>' +
            '<div><span>Current Status</span><strong><span class="badge badge-' + esc(s.normalized_status) + '">' + esc(NORMALIZED_STATUS_LABELS[s.normalized_status] || s.normalized_status) + '</span></strong></div>' +
            '<div><span>Estimated Delivery</span><strong>' + (s.estimated_delivery ? fmtDate(s.estimated_delivery) : 'Not available yet') + '</strong></div>' +
            '<div><span>Shipping Cost</span><strong>' + (s.shipping_cost != null ? fmtPrice(s.shipping_cost) : 'Unavailable') + '</strong></div>' +
          '</div>' +
          (s.last_tracking_sync_at ? '<p class="amazon-sync-note">Last synced ' + fmtDate(s.last_tracking_sync_at) + '</p>' : '') +
          '<div class="amazon-shipping-actions">' +
            (s.label_url ? '<a href="' + esc(s.label_url) + '" target="_blank" class="btn-secondary btn-sm">Download Shipping Label</a>' : '') +
            (s.tracking_url ? '<a href="' + esc(s.tracking_url) + '" target="_blank" class="btn-secondary btn-sm">Track Shipment</a>' : '') +
            '<button type="button" class="btn-secondary btn-sm" id="amzRefreshBtn">Refresh Tracking</button>' +
            (terminal ? '' : '<button type="button" class="btn-danger btn-sm" id="amzCancelBtn">Cancel Shipment</button>') +
          '</div>' +
          (s.last_error ? '<p class="shipping-error-inline">Last sync error: ' + esc(s.last_error) + '</p>' : '') +
          '<div class="tracking-events"><h4>Tracking History</h4>' +
          (events.length ? events.map(function (e) {
            return '<div class="tracking-event-row"><strong>' + esc(NORMALIZED_STATUS_LABELS[e.normalized_status] || e.normalized_status || e.provider_status || '—') + '</strong>' +
              '<span>' + (e.event_time ? fmtDate(e.event_time) : '') + (e.event_location ? ' · ' + esc(e.event_location) : '') + '</span>' +
              (e.description ? '<p>' + esc(e.description) + '</p>' : '') + '</div>';
          }).join('') : '<p class="amazon-shipping-hint">No courier scans available yet.</p>') +
          '</div>' +
        '</div>';
    }

    return '<div class="form-row">' +
        '<div class="form-field"><label>Package Weight (kg)</label><input type="number" step="0.01" id="amzWeight" placeholder="e.g. 0.4"></div>' +
        '<div class="form-field"><label>Length (cm)</label><input type="number" id="amzLength"></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-field"><label>Width (cm)</label><input type="number" id="amzWidth"></div>' +
        '<div class="form-field"><label>Height (cm)</label><input type="number" id="amzHeight"></div>' +
      '</div>' +
      '<div class="form-field"><label>Payment Type</label><select id="amzPaymentType">' +
        '<option value="prepaid"' + (o.paymentStatus === 'paid' ? ' selected' : '') + '>Prepaid</option>' +
        '<option value="cod"' + (o.paymentStatus !== 'paid' ? ' selected' : '') + '>COD</option>' +
      '</select></div>' +
      '<p class="amazon-shipping-hint">Customer name, address, and order value are loaded automatically from this order. Pickup address comes from Admin → Settings.</p>' +
      (shippingCreateError ? errorBox(shippingCreateError) : '') +
      '<button type="button" class="btn-primary btn-sm" id="amzCreateBtn">Create Amazon Shipment</button>';
  }

  function renderDelhiverySection(o, s) {
    var isDelhivery = s && s.provider === 'delhivery';
    var errorBox = function (message) {
      return '<div class="shipping-error-box"><strong>Delhivery Shipment Could Not Be Created</strong>' +
        '<p>Reason: ' + esc(message) + '</p><button type="button" class="btn-secondary btn-sm" id="dlRetryBtn">Try Again</button></div>';
    };

    // A shipment row exists AND Delhivery actually confirmed it (has a provider_shipment_id,
    // i.e. a real waybill) — otherwise fall through to the serviceability-check/create flow.
    if (isDelhivery && s.provider_shipment_id) {
      var events = (s.shipment_events || []).slice().sort(function (a, b) { return new Date(b.event_time || b.created_at) - new Date(a.event_time || a.created_at); });
      var terminal = ['delivered', 'cancelled', 'returned'].indexOf(s.normalized_status) !== -1;
      return '<div class="amazon-shipping-card">' +
          // BUG FIX: this used to be a hardcoded "Shipment Created ✓" that never changed no
          // matter how far the real shipment progressed — the exact cause of Admin showing
          // "Shipment Created" here at the same time "Current Status" below correctly said
          // "IN TRANSIT". Now both read the same s.normalized_status — one source of truth.
          '<div class="amazon-shipping-head"><strong>DELHIVERY STATUS</strong><span class="badge badge-' + esc(s.normalized_status) + '">' + esc(NORMALIZED_STATUS_LABELS[s.normalized_status] || s.normalized_status) + '</span></div>' +
          '<p class="amazon-shipping-hint" style="margin-top:-4px;">Synced automatically from Delhivery — never manually set.</p>' +
          '<div class="amazon-shipping-grid">' +
            '<div><span>AWB</span><strong>' + (s.tracking_id ? esc(s.tracking_id) : 'Unavailable') + '</strong></div>' +
            '<div><span>Current Status</span><strong><span class="badge badge-' + esc(s.normalized_status) + '">' + esc(NORMALIZED_STATUS_LABELS[s.normalized_status] || s.normalized_status) + '</span></strong></div>' +
            '<div><span>Estimated Delivery</span><strong>' + (s.estimated_delivery ? fmtDate(s.estimated_delivery) : 'Not available yet') + '</strong></div>' +
            '<div><span>Shipping Cost</span><strong>' + (s.shipping_cost != null ? fmtPrice(s.shipping_cost) : 'Unavailable') + '</strong></div>' +
            '<div><span>Pickup Status</span><strong>' + (s.pickup_status ? statusLabel(s.pickup_status) : 'Unavailable') + '</strong></div>' +
          '</div>' +
          (s.last_tracking_sync_at ? '<p class="amazon-sync-note">Last synced ' + fmtDate(s.last_tracking_sync_at) + '</p>' : '') +
          '<div class="amazon-shipping-actions">' +
            (s.label_url ? '<a href="' + esc(s.label_url) + '" target="_blank" class="btn-secondary btn-sm">Print Label</a>' : '') +
            (s.tracking_url ? '<a href="' + esc(s.tracking_url) + '" target="_blank" class="btn-secondary btn-sm">Track Shipment</a>' : '') +
            '<button type="button" class="btn-secondary btn-sm" id="dlRefreshBtn">Refresh Tracking</button>' +
            (s.pickup_status === 'requested' ? '<button type="button" class="btn-secondary btn-sm" id="dlSchedulePickupBtn">Schedule Pickup</button>' : '') +
            (terminal ? '' : '<button type="button" class="btn-danger btn-sm" id="dlCancelBtn">Cancel Shipment</button>') +
          '</div>' +
          (s.last_error ? '<p class="shipping-error-inline">Last sync error: ' + esc(s.last_error) + '</p>' : '') +
          '<div class="tracking-events"><h4>Tracking History</h4>' +
          (events.length ? events.map(function (e) {
            return '<div class="tracking-event-row"><strong>' + esc(NORMALIZED_STATUS_LABELS[e.normalized_status] || e.normalized_status || e.provider_status || '—') + '</strong>' +
              '<span>' + (e.event_time ? fmtDate(e.event_time) : '') + (e.event_location ? ' · ' + esc(e.event_location) : '') + '</span>' +
              (e.description ? '<p>' + esc(e.description) + '</p>' : '') + '</div>';
          }).join('') : '<p class="amazon-shipping-hint">No courier scans available yet.</p>') +
          '</div>' +
        '</div>';
    }

    // Delhivery requires checking PIN-code serviceability before creating a shipment — this
    // step is real (goes through the Edge Function to Delhivery's own API), not decorative.
    if (!delhiveryServiceability) {
      return '<p class="amazon-shipping-hint">Check whether Delhivery services this order\'s PIN code (' + esc(o.address.pincode) + ') before creating a shipment.</p>' +
        (delhiveryServiceabilityError ? '<p class="shipping-error-inline">' + esc(delhiveryServiceabilityError) + '</p>' : '') +
        '<button type="button" class="btn-primary btn-sm" id="dlCheckServiceabilityBtn">Check Serviceability</button>';
    }
    if (!delhiveryServiceability.serviceable) {
      return '<div class="shipping-error-box"><strong>Not Serviceable</strong><p>Delhivery does not currently service PIN code ' + esc(o.address.pincode) + '.</p></div>' +
        '<button type="button" class="btn-secondary btn-sm" id="dlRecheckBtn">Check Again</button>';
    }

    var prepaidOption = delhiveryServiceability.prepaidAvailable !== false ? '<option value="prepaid"' + (o.paymentStatus === 'paid' ? ' selected' : '') + '>Prepaid</option>' : '';
    var codOption = delhiveryServiceability.codAvailable ? '<option value="cod"' + (o.paymentStatus !== 'paid' ? ' selected' : '') + '>COD</option>' : '';

    return '<p class="amazon-shipping-hint">PIN ' + esc(o.address.pincode) + ' is serviceable ✓' +
        (delhiveryServiceability.codAvailable ? ' · COD available' : '') + (delhiveryServiceability.prepaidAvailable !== false ? ' · Prepaid available' : '') + '</p>' +
      '<div class="form-row">' +
        '<div class="form-field"><label>Package Weight (kg)</label><input type="number" step="0.01" id="dlWeight" placeholder="e.g. 0.4"></div>' +
        '<div class="form-field"><label>Length (cm)</label><input type="number" id="dlLength"></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-field"><label>Width (cm)</label><input type="number" id="dlWidth"></div>' +
        '<div class="form-field"><label>Height (cm)</label><input type="number" id="dlHeight"></div>' +
      '</div>' +
      '<div class="form-field"><label>Payment Type</label><select id="dlPaymentType">' + prepaidOption + codOption + '</select></div>' +
      '<p class="amazon-shipping-hint">Customer name, address, and order value are loaded automatically from this order.</p>' +
      (shippingCreateError ? errorBox(shippingCreateError) : '') +
      '<button type="button" class="btn-primary btn-sm" id="dlCreateBtn">Create Delhivery Shipment</button>';
  }

  function renderShiprocketSection(o, s) {
    var isShiprocket = s && s.provider === 'shiprocket';
    var errorBox = function (message) {
      return '<div class="shipping-error-box"><strong>Shiprocket Shipment Could Not Be Created</strong>' +
        '<p>Reason: ' + esc(message) + '</p><button type="button" class="btn-secondary btn-sm" id="srRetryBtn">Try Again</button></div>';
    };

    // A shipment row exists AND Shiprocket actually confirmed one (has a provider_shipment_id)
    // — otherwise fall through to the serviceability-check/create flow.
    if (isShiprocket && s.provider_shipment_id) {
      var events = (s.shipment_events || []).slice().sort(function (a, b) { return new Date(b.event_time || b.created_at) - new Date(a.event_time || a.created_at); });
      var terminal = ['delivered', 'cancelled', 'returned'].indexOf(s.normalized_status) !== -1;
      return '<div class="amazon-shipping-card">' +
          '<div class="amazon-shipping-head"><strong>SHIPROCKET STATUS</strong><span class="badge badge-' + esc(s.normalized_status) + '">' + esc(NORMALIZED_STATUS_LABELS[s.normalized_status] || s.normalized_status) + '</span></div>' +
          '<p class="amazon-shipping-hint" style="margin-top:-4px;">Synced automatically from Shiprocket — never manually set.</p>' +
          '<div class="amazon-shipping-grid">' +
            '<div><span>Courier</span><strong>' + (s.courier_name ? esc(s.courier_name) : 'Not yet assigned') + '</strong></div>' +
            '<div><span>AWB</span><strong>' + (s.tracking_id ? esc(s.tracking_id) : 'Unavailable') + '</strong></div>' +
            '<div><span>Current Status</span><strong><span class="badge badge-' + esc(s.normalized_status) + '">' + esc(NORMALIZED_STATUS_LABELS[s.normalized_status] || s.normalized_status) + '</span></strong></div>' +
            '<div><span>Pickup Status</span><strong>' + (s.pickup_status ? statusLabel(s.pickup_status) : 'Unavailable') + '</strong></div>' +
          '</div>' +
          (s.last_tracking_sync_at ? '<p class="amazon-sync-note">Last synced ' + fmtDate(s.last_tracking_sync_at) + '</p>' : '') +
          '<div class="amazon-shipping-actions">' +
            (s.label_url ? '<a href="' + esc(s.label_url) + '" target="_blank" class="btn-secondary btn-sm">Download Label</a>' : (s.tracking_id ? '<button type="button" class="btn-secondary btn-sm" id="srLabelBtn">Generate Label</button>' : '')) +
            '<button type="button" class="btn-secondary btn-sm" id="srRefreshBtn">Refresh Tracking</button>' +
            (s.pickup_status === 'requested' ? '<button type="button" class="btn-secondary btn-sm" id="srSchedulePickupBtn">Schedule Pickup</button>' : '') +
            (terminal ? '' : '<button type="button" class="btn-danger btn-sm" id="srCancelBtn">Cancel Shipment</button>') +
          '</div>' +
          (s.last_error ? '<p class="shipping-error-inline">Last sync error: ' + esc(s.last_error) + '</p>' : '') +
          '<div class="tracking-events"><h4>Tracking History</h4>' +
          (events.length ? events.map(function (e) {
            return '<div class="tracking-event-row"><strong>' + esc(NORMALIZED_STATUS_LABELS[e.normalized_status] || e.normalized_status || e.provider_status || '—') + '</strong>' +
              '<span>' + (e.event_time ? fmtDate(e.event_time) : '') + (e.event_location ? ' · ' + esc(e.event_location) : '') + '</span>' +
              (e.description ? '<p>' + esc(e.description) + '</p>' : '') + '</div>';
          }).join('') : '<p class="amazon-shipping-hint">No courier scans available yet.</p>') +
          '</div>' +
        '</div>';
    }

    // Shiprocket requires checking serviceability (real courier options + rates) before
    // creating a shipment — this step goes through the Edge Function to Shiprocket's own API,
    // never invented courier names/charges/ETAs.
    if (!shiprocketServiceability) {
      return '<p class="amazon-shipping-hint">Check which couriers Shiprocket can offer for this order\'s PIN code (' + esc(o.address.pincode) + ') before creating a shipment.</p>' +
        (shiprocketServiceabilityError ? '<p class="shipping-error-inline">' + esc(shiprocketServiceabilityError) + '</p>' : '') +
        '<div class="form-field"><label>Package Weight (kg)</label><input type="number" step="0.01" id="srCheckWeight" placeholder="e.g. 0.4" value="0.5"></div>' +
        '<button type="button" class="btn-primary btn-sm" id="srCheckServiceabilityBtn">Check Serviceability</button>';
    }
    if (!shiprocketServiceability.serviceable) {
      return '<div class="shipping-error-box"><strong>Not Serviceable</strong><p>Shiprocket returned no couriers for PIN code ' + esc(o.address.pincode) + '.</p></div>' +
        '<button type="button" class="btn-secondary btn-sm" id="srRecheckBtn">Check Again</button>';
    }

    var courierOptions = shiprocketServiceability.couriers.map(function (c) {
      return '<option value="' + c.courierId + '"' + (String(shiprocketSelectedCourierId) === String(c.courierId) ? ' selected' : '') + '>' +
        esc(c.name) + ' — ₹' + c.rate + (c.etaDays ? ' · ETA ' + esc(String(c.etaDays)) : '') + (c.codAvailable ? ' · COD' : '') + '</option>';
    }).join('');

    return '<p class="amazon-shipping-hint">PIN ' + esc(o.address.pincode) + ' is serviceable ✓ — ' + shiprocketServiceability.couriers.length + ' courier(s) available from Shiprocket.</p>' +
      '<div class="form-field"><label>Courier</label><select id="srCourierSelect">' + courierOptions + '</select></div>' +
      '<div class="form-row">' +
        '<div class="form-field"><label>Package Weight (kg)</label><input type="number" step="0.01" id="srWeight" value="0.5"></div>' +
        '<div class="form-field"><label>Length (cm)</label><input type="number" id="srLength" value="10"></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-field"><label>Width (cm)</label><input type="number" id="srWidth" value="10"></div>' +
        '<div class="form-field"><label>Height (cm)</label><input type="number" id="srHeight" value="10"></div>' +
      '</div>' +
      '<div class="form-field"><label>Payment Type</label><select id="srPaymentType">' +
        '<option value="prepaid"' + (o.paymentStatus === 'paid' ? ' selected' : '') + '>Prepaid</option>' +
        '<option value="cod"' + (o.paymentStatus !== 'paid' ? ' selected' : '') + '>COD</option>' +
      '</select></div>' +
      '<p class="amazon-shipping-hint">Customer name, phone, address, and order value are loaded automatically from this order.</p>' +
      (shippingCreateError ? errorBox(shippingCreateError) : '') +
      '<button type="button" class="btn-primary btn-sm" id="srCreateBtn">Create Shiprocket Shipment</button>';
  }

  function refreshShippingCard(o) {
    var el = document.getElementById('shippingCardWrap');
    if (el) el.outerHTML = renderShippingCard(o);
    bindShippingForm(o);
  }

  function bindShippingForm(o) {
    var providerSelect = document.getElementById('shipProviderSelect');
    if (providerSelect) providerSelect.addEventListener('change', function () {
      shippingProviderChoice = providerSelect.value;
      shippingCreateError = null;
      delhiveryServiceability = null;
      delhiveryServiceabilityError = null;
      shiprocketServiceability = null;
      shiprocketServiceabilityError = null;
      shiprocketSelectedCourierId = null;
      refreshShippingCard(o);
    });

    // ---- Manual Shipping ----
    var saveBtn = document.getElementById('shipSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      AdminAPI.shipments.saveManual(o.id, {
        courier: document.getElementById('shipCourier').value.trim(),
        trackingId: document.getElementById('shipTrackingId').value.trim(),
        trackingUrl: document.getElementById('shipUrl').value.trim(),
        shippingCost: document.getElementById('shipCost').value ? Number(document.getElementById('shipCost').value) : null,
        pickupDate: document.getElementById('shipPickup').value || null,
        estimatedDelivery: document.getElementById('shipEta').value || null
      }).then(function () { shippingProviderChoice = null; renderOrderDetail(o.id); });
    });
    var printBtn = document.getElementById('shipPrintBtn');
    if (printBtn) printBtn.addEventListener('click', function () {
      var w = window.open('', '_blank');
      w.document.write('<html><head><title>Shipping Label ' + esc(o.orderNumber) + '</title></head><body style="font-family:sans-serif;padding:30px;">' +
        '<h2>You & Me — Shipping Label</h2><p><strong>Order:</strong> ' + esc(o.orderNumber) + '</p>' +
        '<p><strong>To:</strong><br>' + esc(o.customer.name) + '<br>' + esc(o.customer.phone) + '<br>' +
        esc(o.address.house) + ', ' + esc(o.address.street) + '<br>' + esc(o.address.city) + ', ' + esc(o.address.state) + ' — ' + esc(o.address.pincode) + '</p>' +
        '<p><strong>Courier:</strong> ' + esc(document.getElementById('shipCourier').value) + '<br><strong>Tracking ID:</strong> ' + esc(document.getElementById('shipTrackingId').value) + '</p>' +
        '</body></html>');
      w.document.close(); w.print();
    });
    var copyBtn = document.getElementById('shipCopyBtn');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(document.getElementById('shipTrackingId').value).then(function () { copyBtn.textContent = 'Copied ✓'; window.setTimeout(function () { copyBtn.textContent = 'Copy Tracking ID'; }, 1200); });
    });

    // ---- Amazon Shipping ----
    var createBtn = document.getElementById('amzCreateBtn');
    if (createBtn) createBtn.addEventListener('click', function () {
      var pkg = {
        weightKg: Number(document.getElementById('amzWeight').value),
        lengthCm: Number(document.getElementById('amzLength').value),
        widthCm: Number(document.getElementById('amzWidth').value),
        heightCm: Number(document.getElementById('amzHeight').value)
      };
      if (!pkg.weightKg || !pkg.lengthCm || !pkg.widthCm || !pkg.heightCm) {
        shippingCreateError = 'Package weight and all three dimensions are required.';
        refreshShippingCard(o); return;
      }
      createBtn.disabled = true; createBtn.textContent = 'Creating…';
      AdminAPI.shipments.createAmazon(o.id, pkg, document.getElementById('amzPaymentType').value)
        .then(function () { shippingCreateError = null; shippingProviderChoice = null; renderOrderDetail(o.id); })
        .catch(function (err) { shippingCreateError = err.message; refreshShippingCard(o); });
    });
    var retryBtn = document.getElementById('amzRetryBtn');
    if (retryBtn) retryBtn.addEventListener('click', function () { shippingCreateError = null; refreshShippingCard(o); });
    var refreshBtn = document.getElementById('amzRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', function () {
      refreshBtn.disabled = true; refreshBtn.textContent = 'Refreshing…';
      AdminAPI.shipments.syncAmazon(o.shipment.id)
        .then(function () { renderOrderDetail(o.id); })
        .catch(function (err) { window.alert('Could not refresh tracking: ' + err.message); refreshBtn.disabled = false; refreshBtn.textContent = 'Refresh Tracking'; });
    });
    var cancelBtn = document.getElementById('amzCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      if (!window.confirm('Cancel this Amazon shipment? This cannot be undone.')) return;
      AdminAPI.shipments.cancelAmazon(o.shipment.id)
        .then(function () { renderOrderDetail(o.id); })
        .catch(function (err) { window.alert('Could not cancel shipment: ' + err.message); });
    });

    // ---- Delhivery ----
    var checkServiceabilityBtn = document.getElementById('dlCheckServiceabilityBtn') || document.getElementById('dlRecheckBtn');
    if (checkServiceabilityBtn) checkServiceabilityBtn.addEventListener('click', function () {
      checkServiceabilityBtn.disabled = true; checkServiceabilityBtn.textContent = 'Checking…';
      AdminAPI.shipments.checkDelhiveryServiceability(o.address.pincode)
        .then(function (res) { delhiveryServiceability = res; delhiveryServiceabilityError = null; refreshShippingCard(o); })
        .catch(function (err) { delhiveryServiceabilityError = err.message; refreshShippingCard(o); });
    });
    var dlCreateBtn = document.getElementById('dlCreateBtn');
    if (dlCreateBtn) dlCreateBtn.addEventListener('click', function () {
      var pkg = {
        weightKg: Number(document.getElementById('dlWeight').value),
        lengthCm: Number(document.getElementById('dlLength').value),
        widthCm: Number(document.getElementById('dlWidth').value),
        heightCm: Number(document.getElementById('dlHeight').value)
      };
      if (!pkg.weightKg || !pkg.lengthCm || !pkg.widthCm || !pkg.heightCm) {
        shippingCreateError = 'Package weight and all three dimensions are required.';
        refreshShippingCard(o); return;
      }
      dlCreateBtn.disabled = true; dlCreateBtn.textContent = 'Creating…';
      AdminAPI.shipments.createDelhivery(o.id, document.getElementById('dlPaymentType').value, pkg)
        .then(function () { shippingCreateError = null; shippingProviderChoice = null; delhiveryServiceability = null; renderOrderDetail(o.id); })
        .catch(function (err) { shippingCreateError = err.message; refreshShippingCard(o); });
    });
    var dlRetryBtn = document.getElementById('dlRetryBtn');
    if (dlRetryBtn) dlRetryBtn.addEventListener('click', function () { shippingCreateError = null; refreshShippingCard(o); });
    var dlRefreshBtn = document.getElementById('dlRefreshBtn');
    if (dlRefreshBtn) dlRefreshBtn.addEventListener('click', function () {
      dlRefreshBtn.disabled = true; dlRefreshBtn.textContent = 'Refreshing…';
      AdminAPI.shipments.syncDelhivery(o.shipment.id)
        .then(function () { renderOrderDetail(o.id); })
        .catch(function (err) { window.alert('Could not refresh tracking: ' + err.message); dlRefreshBtn.disabled = false; dlRefreshBtn.textContent = 'Refresh Tracking'; });
    });
    var dlSchedulePickupBtn = document.getElementById('dlSchedulePickupBtn');
    if (dlSchedulePickupBtn) dlSchedulePickupBtn.addEventListener('click', function () {
      var pickupDate = window.prompt('Pickup date (YYYY-MM-DD)?', new Date().toISOString().slice(0, 10));
      if (!pickupDate) return;
      var count = Number(window.prompt('Expected package count?', '1')) || 1;
      dlSchedulePickupBtn.disabled = true; dlSchedulePickupBtn.textContent = 'Scheduling…';
      AdminAPI.shipments.schedulePickupDelhivery(o.shipment.id, pickupDate, count)
        .then(function () { renderOrderDetail(o.id); })
        .catch(function (err) { window.alert('Could not schedule pickup: ' + err.message); dlSchedulePickupBtn.disabled = false; dlSchedulePickupBtn.textContent = 'Schedule Pickup'; });
    });
    var dlCancelBtn = document.getElementById('dlCancelBtn');
    if (dlCancelBtn) dlCancelBtn.addEventListener('click', function () {
      if (!window.confirm('Cancel this Delhivery shipment? This cannot be undone.')) return;
      AdminAPI.shipments.cancelDelhivery(o.shipment.id)
        .then(function () { renderOrderDetail(o.id); })
        .catch(function (err) { window.alert('Could not cancel shipment: ' + err.message); });
    });

    // ---- Shiprocket ----
    var srCheckBtn = document.getElementById('srCheckServiceabilityBtn') || document.getElementById('srRecheckBtn');
    if (srCheckBtn) srCheckBtn.addEventListener('click', function () {
      var weightInput = document.getElementById('srCheckWeight');
      var weightKg = weightInput ? Number(weightInput.value) || 0.5 : 0.5;
      srCheckBtn.disabled = true; srCheckBtn.textContent = 'Checking…';
      AdminAPI.shipments.checkShiprocketServiceability(o.address.pincode, weightKg, o.paymentStatus !== 'paid')
        .then(function (res) { shiprocketServiceability = res; shiprocketServiceabilityError = null; refreshShippingCard(o); })
        .catch(function (err) { shiprocketServiceabilityError = err.message; refreshShippingCard(o); });
    });
    var srCourierSelect = document.getElementById('srCourierSelect');
    if (srCourierSelect) srCourierSelect.addEventListener('change', function () { shiprocketSelectedCourierId = srCourierSelect.value; });
    var srCreateBtn = document.getElementById('srCreateBtn');
    if (srCreateBtn) srCreateBtn.addEventListener('click', function () {
      var pkg = {
        weightKg: Number(document.getElementById('srWeight').value),
        lengthCm: Number(document.getElementById('srLength').value),
        widthCm: Number(document.getElementById('srWidth').value),
        heightCm: Number(document.getElementById('srHeight').value)
      };
      if (!pkg.weightKg || !pkg.lengthCm || !pkg.widthCm || !pkg.heightCm) {
        shippingCreateError = 'Package weight and all three dimensions are required.';
        refreshShippingCard(o); return;
      }
      var courierId = (document.getElementById('srCourierSelect') || {}).value || shiprocketSelectedCourierId;
      srCreateBtn.disabled = true; srCreateBtn.textContent = 'Creating…';
      AdminAPI.shipments.createShiprocket(o.id, document.getElementById('srPaymentType').value, pkg, courierId ? Number(courierId) : undefined)
        .then(function () { shippingCreateError = null; shippingProviderChoice = null; shiprocketServiceability = null; renderOrderDetail(o.id); })
        .catch(function (err) { shippingCreateError = err.message; refreshShippingCard(o); });
    });
    var srRetryBtn = document.getElementById('srRetryBtn');
    if (srRetryBtn) srRetryBtn.addEventListener('click', function () { shippingCreateError = null; refreshShippingCard(o); });
    var srRefreshBtn = document.getElementById('srRefreshBtn');
    if (srRefreshBtn) srRefreshBtn.addEventListener('click', function () {
      srRefreshBtn.disabled = true; srRefreshBtn.textContent = 'Refreshing…';
      AdminAPI.shipments.syncShiprocket(o.shipment.id)
        .then(function () { renderOrderDetail(o.id); })
        .catch(function (err) { window.alert('Could not refresh tracking: ' + err.message); srRefreshBtn.disabled = false; srRefreshBtn.textContent = 'Refresh Tracking'; });
    });
    var srLabelBtn = document.getElementById('srLabelBtn');
    if (srLabelBtn) srLabelBtn.addEventListener('click', function () {
      srLabelBtn.disabled = true; srLabelBtn.textContent = 'Generating…';
      AdminAPI.shipments.generateLabelShiprocket(o.shipment.id)
        .then(function () { renderOrderDetail(o.id); })
        .catch(function (err) { window.alert('Could not generate label: ' + err.message); srLabelBtn.disabled = false; srLabelBtn.textContent = 'Generate Label'; });
    });
    var srSchedulePickupBtn = document.getElementById('srSchedulePickupBtn');
    if (srSchedulePickupBtn) srSchedulePickupBtn.addEventListener('click', function () {
      srSchedulePickupBtn.disabled = true; srSchedulePickupBtn.textContent = 'Scheduling…';
      AdminAPI.shipments.schedulePickupShiprocket(o.shipment.id)
        .then(function () { renderOrderDetail(o.id); })
        .catch(function (err) { window.alert('Could not schedule pickup: ' + err.message); srSchedulePickupBtn.disabled = false; srSchedulePickupBtn.textContent = 'Schedule Pickup'; });
    });
    var srCancelBtn = document.getElementById('srCancelBtn');
    if (srCancelBtn) srCancelBtn.addEventListener('click', function () {
      if (!window.confirm('Cancel this Shiprocket shipment? This cannot be undone.')) return;
      AdminAPI.shipments.cancelShiprocket(o.shipment.id)
        .then(function () { renderOrderDetail(o.id); })
        .catch(function (err) { window.alert('Could not cancel shipment: ' + err.message); });
    });
  }

  /* ---------- 7. Customers ---------- */
  ROUTE_RENDERERS.customers = function (param) {
    if (param) return renderCustomerDetail(param);
    content().innerHTML = '<p class="empty-state">Loading customers…</p>';
    AdminAPI.customers.list().then(function (customers) {
      content().innerHTML = '<div class="table-wrap"><table class="data-table"><thead><tr>' +
        '<th>Name</th><th>Phone</th><th>Email</th><th>Orders</th><th>Total Value</th><th>Last Order</th><th></th></tr></thead><tbody>' +
        (customers.length === 0 ? '' : customers.map(function (c) {
          return '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.phone) + '</td><td>' + esc(c.email || '—') + '</td>' +
            '<td>' + c.orderCount + '</td><td>' + fmtPrice(c.totalValue) + '</td><td>' + fmtDate(c.lastOrderAt) + '</td>' +
            '<td><a href="' + BASE_PATH + '/admin/customers/' + encodeURIComponent(c.phone) + '" class="btn-ghost btn-sm">View</a></td></tr>';
        }).join('')) + '</tbody></table></div>' +
        (customers.length === 0 ? '<p class="empty-state">No customers yet — they appear here after the first order.</p>' : '');
    });
  };

  function renderCustomerDetail(phone) {
    AdminAPI.customers.get(phone).then(function (c) {
      content().innerHTML =
        '<div class="section-heading-row"><h3 style="font-size:1.05rem;">' + esc(c.name) + '</h3><a href="' + BASE_PATH + '/admin/customers" class="btn-ghost btn-sm">← Back</a></div>' +
        '<div class="panel-card"><h3>Details</h3><p>Phone: ' + esc(c.phone) + '<br>Email: ' + esc(c.email || '—') + '<br>Orders: ' + c.orderCount + ' &middot; Total Spent: ' + fmtPrice(c.totalValue) + '</p></div>' +
        '<div class="panel-card"><h3>Addresses</h3>' + c.addresses.map(function (a) {
          return '<p>' + esc(a.house) + ', ' + esc(a.street) + (a.landmark ? ' (near ' + esc(a.landmark) + ')' : '') + '<br>' + esc(a.city) + ', ' + esc(a.state) + ' — ' + esc(a.pincode) + '</p>';
        }).join('<hr style="border:none;border-top:1px solid var(--border);margin:10px 0;">') + '</div>' +
        '<div class="panel-card"><h3>Previous Orders</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>' +
          c.orders.map(function (o) {
            return '<tr><td>' + esc(o.orderNumber) + '</td><td>' + fmtDate(o.createdAt) + '</td><td>' + fmtPrice(o.total) + '</td>' +
              '<td><span class="badge badge-' + o.orderStatus + '">' + statusLabel(o.orderStatus) + '</span></td><td><a href="' + BASE_PATH + '/admin/orders/' + o.id + '" class="btn-ghost btn-sm">View</a></td></tr>';
          }).join('') + '</tbody></table></div></div>';
    });
  }

  /* ---------- 8. Inventory ---------- */
  ROUTE_RENDERERS.inventory = function () {
    content().innerHTML = '<p class="empty-state">Loading inventory…</p>';
    AdminAPI.products.list().then(function (products) {
      var rows = [];
      products.forEach(function (p) {
        (p.variants || []).forEach(function (v) {
          rows.push({ productName: p.name, sku: v.variant_sku, size: v.size, color: v.color, stock: v.stock, productId: p.id, variantId: v.id });
        });
      });
      rows.sort(function (a, b) { return a.stock - b.stock; });

      content().innerHTML =
        '<div class="panel-card"><h3>Low Stock Alerts</h3>' +
        (rows.filter(function (r) { return r.stock <= 5; }).length === 0 ? '<p class="empty-state">Nothing low on stock right now.</p>' :
          '<div class="table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>Variant SKU</th><th>Size</th><th>Color</th><th>Stock</th></tr></thead><tbody>' +
          rows.filter(function (r) { return r.stock <= 5; }).map(function (r) {
            return '<tr><td>' + esc(r.productName) + '</td><td>' + esc(r.sku) + '</td><td>' + esc(r.size) + '</td><td>' + esc(r.color) + '</td>' +
              '<td style="color:' + (r.stock === 0 ? 'var(--red)' : 'var(--amber)') + ';font-weight:700;">' + r.stock + '</td></tr>';
          }).join('') + '</tbody></table></div>') +
        '</div>' +
        '<div class="panel-card"><h3>All Variants</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>Variant SKU</th><th>Size</th><th>Color</th><th>Stock</th><th></th></tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr><td>' + esc(r.productName) + '</td><td>' + esc(r.sku) + '</td><td>' + esc(r.size) + '</td><td>' + esc(r.color) + '</td>' +
              '<td><input type="number" min="0" class="inv-stock-input" data-pid="' + r.productId + '" data-vid="' + r.variantId + '" value="' + r.stock + '" style="width:70px;padding:4px 6px;"></td>' +
              '<td><a href="' + BASE_PATH + '/admin/products/' + r.productId + '" class="btn-ghost btn-sm">Edit Product</a></td></tr>';
          }).join('') + '</tbody></table></div></div>';

      content().querySelectorAll('.inv-stock-input').forEach(function (input) {
        input.addEventListener('change', function () {
          AdminAPI.products.setVariantStock(input.dataset.pid, Number(input.dataset.vid), Number(input.value));
        });
      });
    });
  };

  /* ---------- 9. Shipping (overview across orders) ---------- */
  ROUTE_RENDERERS.shipping = function () {
    content().innerHTML = '<p class="empty-state">Loading…</p>';
    AdminAPI.orders.list({ status: 'all' }).then(function (orders) {
      var relevant = orders.filter(function (o) { return ['packing', 'ready_to_ship', 'shipped', 'out_for_delivery', 'delivered'].indexOf(o.orderStatus) !== -1; });
      content().innerHTML = '<div class="panel-card"><h3>Orders Ready for / In Shipping</h3>' +
        (relevant.length === 0 ? '<p class="empty-state">No orders in packing or shipping stages yet.</p>' :
          '<div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th></th></tr></thead><tbody>' +
          relevant.map(function (o) {
            return '<tr><td>' + esc(o.orderNumber) + '</td><td>' + esc(o.customerName) + '</td>' +
              '<td><span class="badge badge-' + o.orderStatus + '">' + statusLabel(o.orderStatus) + '</span></td>' +
              '<td><a href="' + BASE_PATH + '/admin/orders/' + o.id + '" class="btn-ghost btn-sm">Manage Shipment</a></td></tr>';
          }).join('') + '</tbody></table></div>') +
        '</div>' +
        '<div class="panel-card"><h3>Courier Integrations</h3><p style="font-size:0.85rem;color:var(--text-soft);">Manual shipping is active today. Amazon Shipping, Ekart and DTDC can be connected here later — each order\'s shipment record already has a <code>carrier_code</code> field ready for that, so this won\'t require rebuilding Orders.</p></div>';
    });
  };

  /* ---------- 10. Categories ---------- */
  ROUTE_RENDERERS.categories = function () {
    content().innerHTML = '<p class="empty-state">Loading…</p>';
    AdminAPI.products.list().then(function (products) {
      var counts = {};
      products.forEach(function (p) {
        var key = p.category + (p.subcategory ? ' / ' + p.subcategory : '');
        counts[key] = (counts[key] || 0) + 1;
      });
      content().innerHTML = '<div class="panel-card"><h3>Categories in Use</h3>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr><th>Category / Subcategory</th><th>Products</th></tr></thead><tbody>' +
        Object.keys(counts).sort().map(function (k) { return '<tr><td>' + esc(k) + '</td><td>' + counts[k] + '</td></tr>'; }).join('') +
        '</tbody></table></div>' +
        '<p style="font-size:0.8rem;color:var(--text-soft);margin-top:14px;">Categories and subcategories are set per-product on the product edit page — this view is a live summary of what\'s currently in use.</p>' +
      '</div>';
    });
  };

  /* ---------- 11. Media Library ---------- */
  ROUTE_RENDERERS.media = function () {
    content().innerHTML = '<p class="empty-state">Loading media…</p>';
    AdminAPI.media.list().then(function (media) {
      content().innerHTML =
        '<div class="panel-card">' +
          '<h3>Upload New Image</h3>' +
          '<input type="file" id="mediaUploadInput" accept="image/*" multiple>' +
        '</div>' +
        '<div class="panel-card"><h3>All Uploaded Images (' + media.length + ')</h3>' +
        (media.length === 0 ? '<p class="empty-state">No images uploaded yet — images uploaded from the Product editor land here too.</p>' :
          '<div class="image-upload-grid">' + media.map(function (m) {
            return '<div class="image-slot' + (m.inUse ? ' primary' : '') + '" style="border-style:solid;">' +
              '<img src="' + esc(m.url) + '" alt="">' +
              '<div class="image-slot-actions">' +
                '<button type="button" data-copy-url="' + esc(m.url) + '">Copy URL</button>' +
                (m.inUse ? '' : '<button type="button" data-delete-media="' + m.id + '">Delete</button>') +
              '</div></div>';
          }).join('') + '</div>') +
        '</div>';

      document.getElementById('mediaUploadInput').addEventListener('change', function (e) {
        var files = Array.prototype.slice.call(e.target.files || []);
        Promise.all(files.map(function (file) { return AdminAPI.media.upload(file); }))
          .then(function () { ROUTE_RENDERERS.media(); })
          .catch(function (err) { window.alert(err.message || 'Upload failed'); });
      });
      content().querySelectorAll('[data-copy-url]').forEach(function (btn) {
        btn.addEventListener('click', function () { navigator.clipboard.writeText(btn.dataset.copyUrl); btn.textContent = 'Copied ✓'; window.setTimeout(function () { btn.textContent = 'Copy URL'; }, 1200); });
      });
      content().querySelectorAll('[data-delete-media]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          AdminAPI.media.remove(btn.dataset.deleteMedia).then(function () { ROUTE_RENDERERS.media(); }).catch(function (err) { window.alert(err.message); });
        });
      });
    });
  };

  /* ---------- 11.5 Campaigns & Offers ---------- */
  // "Effective status" is never read from a stored column — computed live from
  // is_enabled/is_paused/start_at/end_at, exactly matching the SQL in the RLS policies
  // (supabase/migrations/0007_campaigns.sql), so this label can never drift out of sync with
  // what the customer site is actually showing.
  var CAMPAIGN_TYPE_LABELS = {
    onam: 'Onam Sale', christmas: 'Christmas Sale', eid: 'Eid / Bakrid Offer', new_year: 'New Year Sale',
    kids_day: 'Kids Day Special', summer: 'Summer Sale', flash_sale: 'Flash Sale', custom: 'Custom Campaign'
  };
  // BUG FIX: campaign_content.campaign_id and campaign_media.campaign_id are each the PRIMARY
  // KEY of their table (not just a foreign key) — a genuine 1:1 relationship with campaigns.
  // PostgREST/supabase-js embeds a 1:1 relation as a plain OBJECT, not an array wrapped in [ ].
  // Every read site here used to assume an array shape — `(c.campaign_content || [])[0]` — so
  // `[0]` on the real object always came back undefined, silently falling back to `{}`, which
  // made every Banner/Offer Section/Announcement toggle read as OFF regardless of what was
  // actually saved (the save itself, and the database, were correct the whole time — this was
  // purely a read-side bug). Handles either shape, so it stays correct even if a future
  // PostgREST/schema change ever returns an array here instead.
  function unwrapOne(x) {
    if (!x) return {};
    return Array.isArray(x) ? (x[0] || {}) : x;
  }
  // Set right before navigating back into the (freshly re-fetched) editor after a save, so the
  // confirmation survives the re-render instead of vanishing with the old DOM.
  var campaignSaveFeedback = null;
  function computeCampaignStatus(c) {
    if (!c.is_enabled) return { label: 'Disabled', tone: 'cancelled' };
    if (c.is_paused) return { label: 'Paused', tone: 'refunded' };
    var now = new Date();
    if (c.start_at && new Date(c.start_at) > now) return { label: 'Scheduled', tone: 'blue' };
    if (c.end_at && new Date(c.end_at) < now) return { label: 'Expired', tone: 'cancelled' };
    if (!c.start_at && !c.end_at) return { label: 'Draft', tone: 'new' };
    return { label: 'Live', tone: 'delivered' };
  }
  function campaignDateRangeLabel(c) {
    if (!c.start_at && !c.end_at) return 'No schedule set';
    var s = c.start_at ? fmtDate(c.start_at) : '—';
    var e = c.end_at ? fmtDate(c.end_at) : '—';
    return s + ' — ' + e;
  }

  ROUTE_RENDERERS.campaigns = function (param) {
    if (param) return renderCampaignEditor(param);
    renderCampaignList();
  };

  function renderCampaignList() {
    content().innerHTML = '<p class="empty-state">Loading campaigns…</p>';
    AdminAPI.campaigns.list().then(function (campaigns) {
      content().innerHTML =
        '<div class="section-heading-row"><h3 style="font-size:1.1rem;">Campaigns &amp; Offers</h3>' +
          '<button type="button" class="btn-primary btn-sm" id="newCampaignBtn">+ Create Campaign</button></div>' +
        (campaigns.length === 0
          ? '<div class="empty-state"><p><strong>No campaigns yet</strong></p><p>Create a seasonal campaign (Onam, Christmas, a Flash Sale, ...) — nothing appears on the website until you publish one.</p></div>'
          : campaigns.map(function (c) {
              var status = computeCampaignStatus(c);
              var content_ = unwrapOne(c.campaign_content);
              var media = unwrapOne(c.campaign_media);
              var productCount = (c.campaign_products || []).length;
              return '<div class="panel-card campaign-card">' +
                '<div class="campaign-card-head">' +
                  '<div><strong style="font-size:1.05rem;">' + esc(c.name) + '</strong>' +
                    '<div style="font-size:0.78rem;color:var(--text-soft);">' + esc(CAMPAIGN_TYPE_LABELS[c.campaign_type] || c.campaign_type) + '</div></div>' +
                  '<span class="badge badge-' + status.tone + '">' + status.label + '</span>' +
                '</div>' +
                '<p style="font-size:0.82rem;color:var(--text-soft);margin:8px 0;">' + esc(campaignDateRangeLabel(c)) + '</p>' +
                '<div class="campaign-card-flags">' +
                  '<span>Banner <strong>' + (media.banner_enabled ? 'ON' : 'OFF') + '</strong></span>' +
                  '<span>Offer Section <strong>' + (content_.offer_section_enabled ? 'ON' : 'OFF') + '</strong></span>' +
                  '<span>Announcement <strong>' + (content_.announcement_enabled ? 'ON' : 'OFF') + '</strong></span>' +
                '</div>' +
                '<p style="font-size:0.82rem;margin:8px 0;">' + productCount + ' product' + (productCount === 1 ? '' : 's') + '</p>' +
                '<div class="amazon-shipping-actions">' +
                  '<a href="' + BASE_PATH + '/admin/campaigns/' + c.id + '" class="btn-secondary btn-sm">Edit</a>' +
                  (c.is_enabled
                    ? '<button type="button" class="btn-secondary btn-sm" data-toggle-enabled="' + c.id + '" data-next="false">Disable</button>'
                    : '<button type="button" class="btn-primary btn-sm" data-toggle-enabled="' + c.id + '" data-next="true">Enable</button>') +
                  (c.is_enabled && !c.is_paused ? '<button type="button" class="btn-secondary btn-sm" data-toggle-paused="' + c.id + '" data-next="true">Pause</button>' : '') +
                  (c.is_enabled && c.is_paused ? '<button type="button" class="btn-secondary btn-sm" data-toggle-paused="' + c.id + '" data-next="false">Resume</button>' : '') +
                  '<button type="button" class="btn-danger btn-sm" data-delete-campaign="' + c.id + '">Delete</button>' +
                '</div>' +
              '</div>';
            }).join(''));

      var newBtn = document.getElementById('newCampaignBtn');
      if (newBtn) newBtn.addEventListener('click', function () { Router.navigate(BASE_PATH + '/admin/campaigns/new'); });
      content().querySelectorAll('[data-toggle-enabled]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          AdminAPI.campaigns.update(btn.dataset.toggleEnabled, { is_enabled: btn.dataset.next === 'true' }).then(renderCampaignList);
        });
      });
      content().querySelectorAll('[data-toggle-paused]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          AdminAPI.campaigns.update(btn.dataset.togglePaused, { is_paused: btn.dataset.next === 'true' }).then(renderCampaignList);
        });
      });
      content().querySelectorAll('[data-delete-campaign]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (!window.confirm('Delete this campaign permanently? This cannot be undone.')) return;
          AdminAPI.campaigns.remove(btn.dataset.deleteCampaign).then(renderCampaignList).catch(function (err) { window.alert(err.message); });
        });
      });
    });
  }

  var CAMPAIGN_CTA_TARGET_LABELS = {
    product: 'Specific Product', category: 'Category', collection: 'Product Collection',
    new_arrivals: 'New Arrivals', all_products: 'All Products', custom: 'Custom internal route'
  };

  function renderCampaignEditor(param) {
    content().innerHTML = '<p class="empty-state">Loading…</p>';
    var isNew = param === 'new';
    var loadCampaign = isNew
      ? Promise.resolve({ id: null, name: '', internal_name: '', slug: '', campaign_type: 'custom', is_enabled: false, is_paused: false, start_at: null, end_at: null, priority: 100, campaign_content: [{}], campaign_media: [{}], campaign_products: [] })
      : AdminAPI.campaigns.get(param);
    var loadProducts = supabaseClient.from('products').select('id, name, price, sale_price, sku').eq('status', 'active').order('name').then(throwIfError).then(function (r) { return r.data || []; });

    Promise.all([loadCampaign, loadProducts]).then(function (results) {
      var c = results[0], allProducts = results[1];
      var cc = unwrapOne(c.campaign_content);
      var cm = unwrapOne(c.campaign_media);
      var selected = {}; // product_id -> { campaign_price, discount_percentage }
      (c.campaign_products || []).forEach(function (cp) { selected[cp.product_id] = { campaign_price: cp.campaign_price, discount_percentage: cp.discount_percentage }; });

      function toLocalInput(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        var pad = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      }

      content().innerHTML =
        (campaignSaveFeedback ? '<p class="campaign-save-feedback ' + (campaignSaveFeedback.ok ? 'ok' : 'err') + '">' + esc(campaignSaveFeedback.message) + '</p>' : '') +
        '<div class="section-heading-row"><h3 style="font-size:1.1rem;">' + (isNew ? 'Create Campaign' : 'Edit — ' + esc(c.name)) + '</h3>' +
          '<a href="' + BASE_PATH + '/admin/campaigns" class="btn-ghost btn-sm">← Back to Campaigns</a></div>' +

        '<div class="panel-card"><h3>Overview</h3>' +
          '<div class="form-row">' +
            '<div class="form-field"><label>Campaign Name</label><input type="text" id="cName" value="' + esc(c.name) + '" placeholder="Onam Sale 2026"></div>' +
            '<div class="form-field"><label>Internal Campaign Name</label><input type="text" id="cInternalName" value="' + esc(c.internal_name || '') + '" placeholder="onam-2026-internal"></div>' +
          '</div>' +
          '<div class="form-row">' +
            '<div class="form-field"><label>Campaign Type</label><select id="cType">' +
              Object.keys(CAMPAIGN_TYPE_LABELS).map(function (k) { return '<option value="' + k + '"' + (k === c.campaign_type ? ' selected' : '') + '>' + CAMPAIGN_TYPE_LABELS[k] + '</option>'; }).join('') +
            '</select></div>' +
            '<div class="form-field"><label>Priority (1 = highest, used if multiple campaigns are Live at once)</label><input type="number" id="cPriority" value="' + (c.priority != null ? c.priority : 100) + '"></div>' +
          '</div>' +
          '<div class="form-field" style="flex-direction:row;align-items:center;gap:10px;">' +
            '<label style="margin:0;">Campaign Active</label>' +
            '<label class="switch"><input type="checkbox" id="cEnabled"' + (c.is_enabled ? ' checked' : '') + '><span class="switch-track"></span></label>' +
            '<span style="font-size:0.78rem;color:var(--text-soft);">OFF completely hides this campaign from the website — nothing is deleted.</span>' +
          '</div>' +
        '</div>' +

        '<div class="panel-card"><h3>Schedule</h3>' +
          '<div class="form-row">' +
            '<div class="form-field"><label>Start Date &amp; Time</label><input type="datetime-local" id="cStart" value="' + toLocalInput(c.start_at) + '"></div>' +
            '<div class="form-field"><label>End Date &amp; Time</label><input type="datetime-local" id="cEnd" value="' + toLocalInput(c.end_at) + '"></div>' +
          '</div>' +
          '<p style="font-size:0.78rem;color:var(--text-soft);">Leave both blank for a campaign with no fixed schedule (shows whenever Campaign Active is ON). The website updates automatically at these times — no admin action needed.</p>' +
          (!isNew ? '<div class="amazon-shipping-actions">' +
            (c.is_enabled && !c.is_paused ? '<button type="button" class="btn-secondary btn-sm" id="pauseNowBtn">Pause Campaign</button>' : '') +
            (c.is_enabled && c.is_paused ? '<button type="button" class="btn-secondary btn-sm" id="resumeNowBtn">Resume Campaign</button>' : '') +
            '<button type="button" class="btn-danger btn-sm" id="endNowBtn">End Campaign Now</button>' +
          '</div>' : '') +
        '</div>' +

        '<div class="panel-card"><h3>Website Banner</h3>' +
          '<div class="form-field" style="flex-direction:row;align-items:center;gap:10px;">' +
            '<label style="margin:0;">Show Banner</label>' +
            '<label class="switch"><input type="checkbox" id="mEnabled"' + (cm.banner_enabled ? ' checked' : '') + '><span class="switch-track"></span></label>' +
          '</div>' +
          '<div class="form-row">' +
            '<div class="form-field"><label>Banner Type</label><select id="mType">' +
              ['image', 'gif', 'video', 'animated_text', 'image_text'].map(function (t) { return '<option value="' + t + '"' + (t === cm.banner_type ? ' selected' : '') + '>' + t.replace('_', ' + ').replace(/\b\w/g, function (ch) { return ch.toUpperCase(); }) + '</option>'; }).join('') +
            '</select></div>' +
            '<div class="form-field"><label>Placement</label><select id="mPlacement">' +
              ['top_announcement', 'below_header', 'above_hero', 'replace_hero', 'below_hero', 'before_featured', 'before_footer'].map(function (p) { return '<option value="' + p + '"' + (p === (cm.placement || 'above_hero') ? ' selected' : '') + '>' + p.replace(/_/g, ' ').replace(/\b\w/g, function (ch) { return ch.toUpperCase(); }) + '</option>'; }).join('') +
            '</select></div>' +
          '</div>' +
          '<p style="font-size:0.78rem;color:var(--text-soft);margin-bottom:6px;">Image / GIF / Video — upload straight from here (goes to the same Media Library as product photos) or paste an existing Media Library URL.</p>' +
          '<div class="form-row">' +
            '<div class="form-field"><label>Desktop Media URL</label><input type="text" id="mDesktopUrl" value="' + esc(cm.desktop_url || '') + '" placeholder="https://…"></div>' +
            '<div class="form-field"><label>Upload Desktop</label><input type="file" id="mDesktopUpload" accept="image/*,video/*"></div>' +
          '</div>' +
          '<div class="form-row">' +
            '<div class="form-field"><label>Mobile Media URL (optional — falls back to Desktop if blank)</label><input type="text" id="mMobileUrl" value="' + esc(cm.mobile_url || '') + '" placeholder="https://…"></div>' +
            '<div class="form-field"><label>Upload Mobile</label><input type="file" id="mMobileUpload" accept="image/*,video/*"></div>' +
          '</div>' +
          '<div class="form-row" id="mVideoOptionsRow">' +
            '<div class="form-field" style="flex-direction:row;gap:6px;align-items:center;"><input type="checkbox" id="mAutoplay"' + (cm.video_autoplay !== false ? ' checked' : '') + '><label style="margin:0;">Autoplay</label></div>' +
            '<div class="form-field" style="flex-direction:row;gap:6px;align-items:center;"><input type="checkbox" id="mLoop"' + (cm.video_loop !== false ? ' checked' : '') + '><label style="margin:0;">Loop</label></div>' +
            '<div class="form-field" style="flex-direction:row;gap:6px;align-items:center;"><input type="checkbox" id="mMuted"' + (cm.video_muted !== false ? ' checked' : '') + '><label style="margin:0;">Muted</label></div>' +
            '<div class="form-field" style="flex-direction:row;gap:6px;align-items:center;"><input type="checkbox" id="mControls"' + (cm.video_controls ? ' checked' : '') + '><label style="margin:0;">Show Controls</label></div>' +
          '</div>' +
          '<h4 style="font-size:0.85rem;margin:16px 0 8px;">Animated Text Mode (used when no image/video is set, or Banner Type = Animated Text)</h4>' +
          '<div class="form-row">' +
            '<div class="form-field"><label>Headline</label><input type="text" id="mHeadline" value="' + esc(cm.text_headline || '') + '" placeholder="HAPPY ONAM 🌼"></div>' +
            '<div class="form-field"><label>Subheadline</label><input type="text" id="mSubheadline" value="' + esc(cm.text_subheadline || '') + '" placeholder="Celebrate Together"></div>' +
          '</div>' +
          '<div class="form-field"><label>Description</label><textarea id="mDescription" rows="2">' + esc(cm.text_description || '') + '</textarea></div>' +
          '<div class="form-row">' +
            '<div class="form-field"><label>CTA Text</label><input type="text" id="mCtaText" value="' + esc(cm.text_cta_text || '') + '" placeholder="Shop Onam Collection"></div>' +
            '<div class="form-field"><label>Alignment</label><select id="mAlign">' + ['left', 'center', 'right'].map(function (a) { return '<option value="' + a + '"' + (a === (cm.text_align || 'center') ? ' selected' : '') + '>' + a + '</option>'; }).join('') + '</select></div>' +
          '</div>' +
          '<div class="form-row">' +
            '<div class="form-field"><label>Background Color</label><input type="text" id="mBgColor" value="' + esc(cm.text_bg_color || '') + '" placeholder="#F7DEE1"></div>' +
            '<div class="form-field"><label>Text Color</label><input type="text" id="mTextColor" value="' + esc(cm.text_color || '') + '" placeholder="#2E2A26"></div>' +
            '<div class="form-field"><label>Animation</label><select id="mAnimation">' + ['none', 'fade', 'slide_up', 'soft_reveal', 'marquee'].map(function (a) { return '<option value="' + a + '"' + (a === (cm.text_animation || 'fade') ? ' selected' : '') + '>' + a.replace('_', ' ') + '</option>'; }).join('') + '</select></div>' +
          '</div>' +
          '<div class="amazon-shipping-actions"><button type="button" class="btn-secondary btn-sm" id="previewBannerBtn">Preview Desktop / Mobile</button></div>' +
          '<div id="bannerPreviewArea"></div>' +
        '</div>' +

        '<div class="panel-card"><h3>Offer Section</h3>' +
          '<div class="form-field" style="flex-direction:row;align-items:center;gap:10px;">' +
            '<label style="margin:0;">Show Offer Section</label>' +
            '<label class="switch"><input type="checkbox" id="oEnabled"' + (cc.offer_section_enabled ? ' checked' : '') + '><span class="switch-track"></span></label>' +
          '</div>' +
          '<div class="form-row">' +
            '<div class="form-field"><label>Small Label</label><input type="text" id="oLabel" value="' + esc(cc.offer_label || '') + '" placeholder="ONAM SPECIAL"></div>' +
            '<div class="form-field"><label>Heading</label><input type="text" id="oHeading" value="' + esc(cc.offer_heading || '') + '" placeholder="Celebrate Onam Together ♡"></div>' +
          '</div>' +
          '<div class="form-field"><label>Description</label><textarea id="oDescription" rows="2">' + esc(cc.offer_description || '') + '</textarea></div>' +
          '<div class="form-row">' +
            '<div class="form-field"><label>CTA Text</label><input type="text" id="oCtaText" value="' + esc(cc.offer_cta_text || '') + '" placeholder="Shop Onam Collection"></div>' +
            '<div class="form-field"><label>CTA Destination</label><select id="oCtaType">' +
              Object.keys(CAMPAIGN_CTA_TARGET_LABELS).map(function (k) { return '<option value="' + k + '"' + (k === cc.offer_cta_target_type ? ' selected' : '') + '>' + CAMPAIGN_CTA_TARGET_LABELS[k] + '</option>'; }).join('') +
            '</select></div>' +
          '</div>' +
          '<div class="form-field"><label>CTA Destination Value (product ID / category or collection slug / custom path — depends on the type above)</label><input type="text" id="oCtaValue" value="' + esc(cc.offer_cta_target_value || '') + '"></div>' +
          '<div class="form-row">' +
            '<div class="form-field"><label>Offer Percentage (optional — leave blank for no discount)</label><input type="number" id="oPercentage" value="' + (cc.offer_percentage != null ? cc.offer_percentage : '') + '"></div>' +
            '<div class="form-field"><label>Coupon Code (optional)</label><input type="text" id="oCoupon" value="' + esc(cc.offer_coupon_code || '') + '"></div>' +
            '<div class="form-field"><label>Offer End Date (optional)</label><input type="datetime-local" id="oEndAt" value="' + toLocalInput(cc.offer_end_at) + '"></div>' +
          '</div>' +
        '</div>' +

        '<div class="panel-card"><h3>Top Announcement Bar</h3>' +
          '<div class="form-field" style="flex-direction:row;align-items:center;gap:10px;">' +
            '<label style="margin:0;">Enable Announcement Bar</label>' +
            '<label class="switch"><input type="checkbox" id="aEnabled"' + (cc.announcement_enabled ? ' checked' : '') + '><span class="switch-track"></span></label>' +
          '</div>' +
          '<div class="form-field"><label>Text</label><input type="text" id="aText" value="' + esc(cc.announcement_text || '') + '" placeholder="🌼 ONAM SPECIAL — UP TO 20% OFF — SHOP NOW"></div>' +
          '<div class="form-row">' +
            '<div class="form-field"><label>CTA Text (optional)</label><input type="text" id="aCtaText" value="' + esc(cc.announcement_cta_text || '') + '"></div>' +
            '<div class="form-field"><label>Link (optional)</label><input type="text" id="aLink" value="' + esc(cc.announcement_link || '') + '"></div>' +
          '</div>' +
          '<div class="form-row">' +
            '<div class="form-field"><label>Background Color</label><input type="text" id="aBg" value="' + esc(cc.announcement_bg_color || '') + '" placeholder="#F7DEE1"></div>' +
            '<div class="form-field"><label>Text Color</label><input type="text" id="aTextColor" value="' + esc(cc.announcement_text_color || '') + '" placeholder="#2E2A26"></div>' +
            '<div class="form-field"><label>Animation</label><select id="aAnimation">' + ['static', 'scrolling', 'fade'].map(function (a) { return '<option value="' + a + '"' + (a === (cc.announcement_animation || 'static') ? ' selected' : '') + '>' + a + '</option>'; }).join('') + '</select></div>' +
          '</div>' +
        '</div>' +

        '<div class="panel-card"><h3>Campaign Products</h3>' +
          '<p style="font-size:0.78rem;color:var(--text-soft);margin-bottom:10px;">Select real products from your catalog for this campaign. Optional campaign price/discount is stored separately — the product\'s normal price is never overwritten, and returns automatically once the campaign ends.</p>' +
          '<div class="table-wrap"><table class="data-table"><thead><tr><th></th><th>Product</th><th>Normal Price</th><th>Campaign Price</th><th>Discount %</th></tr></thead><tbody>' +
            allProducts.map(function (p) {
              var sel = selected[p.id];
              return '<tr>' +
                '<td><input type="checkbox" class="campaign-product-check" data-product-id="' + p.id + '"' + (sel ? ' checked' : '') + '></td>' +
                '<td>' + esc(p.name) + ' <span style="color:var(--text-soft);font-size:0.75rem;">' + esc(p.sku || '') + '</span></td>' +
                '<td>' + fmtPrice(p.sale_price || p.price) + '</td>' +
                '<td><input type="number" class="campaign-product-price" data-product-id="' + p.id + '" value="' + (sel && sel.campaign_price != null ? sel.campaign_price : '') + '" placeholder="—" style="width:90px;"></td>' +
                '<td><input type="number" class="campaign-product-discount" data-product-id="' + p.id + '" value="' + (sel && sel.discount_percentage != null ? sel.discount_percentage : '') + '" placeholder="—" style="width:70px;"></td>' +
              '</tr>';
            }).join('') +
          '</tbody></table></div>' +
        '</div>' +

        '<div class="amazon-shipping-actions" style="margin:16px 0 40px;">' +
          '<button type="button" class="btn-primary btn-sm" id="saveCampaignBtn">' + (isNew ? 'Create Campaign' : 'Save Changes') + '</button>' +
        '</div>';
      campaignSaveFeedback = null; // shown once, right after the re-fetch-driven re-render that follows a save — not left behind on later visits.

      function updateVideoOptionsVisibility() {
        var type = document.getElementById('mType').value;
        document.getElementById('mVideoOptionsRow').style.display = type === 'video' ? 'flex' : 'none';
      }
      updateVideoOptionsVisibility();
      document.getElementById('mType').addEventListener('change', updateVideoOptionsVisibility);

      function wireUpload(inputId, targetInputId) {
        var input = document.getElementById(inputId);
        if (!input) return;
        input.addEventListener('change', function () {
          var file = input.files && input.files[0];
          if (!file) return;
          input.disabled = true;
          AdminAPI.media.upload(file).then(function (res) {
            document.getElementById(targetInputId).value = res.url;
            input.disabled = false;
          }).catch(function (err) { input.disabled = false; window.alert(err.message || 'Upload failed.'); });
        });
      }
      wireUpload('mDesktopUpload', 'mDesktopUrl');
      wireUpload('mMobileUpload', 'mMobileUrl');

      document.getElementById('previewBannerBtn').addEventListener('click', function () {
        var draftMedia = collectMediaPayload();
        var draftContent = collectContentPayload();
        document.getElementById('bannerPreviewArea').innerHTML =
          '<div class="campaign-preview-cols">' +
            '<div><h4 style="font-size:0.78rem;color:var(--text-soft);">Desktop Preview</h4><div class="campaign-preview-frame desktop">' + renderCampaignBannerPreviewHtml(draftMedia, draftContent, false) + '</div></div>' +
            '<div><h4 style="font-size:0.78rem;color:var(--text-soft);">Mobile Preview</h4><div class="campaign-preview-frame mobile">' + renderCampaignBannerPreviewHtml(draftMedia, draftContent, true) + '</div></div>' +
          '</div>';
      });

      function collectContentPayload() {
        return {
          offer_section_enabled: document.getElementById('oEnabled').checked,
          offer_label: document.getElementById('oLabel').value.trim() || null,
          offer_heading: document.getElementById('oHeading').value.trim() || null,
          offer_description: document.getElementById('oDescription').value.trim() || null,
          offer_cta_text: document.getElementById('oCtaText').value.trim() || null,
          offer_cta_target_type: document.getElementById('oCtaType').value || null,
          offer_cta_target_value: document.getElementById('oCtaValue').value.trim() || null,
          offer_percentage: document.getElementById('oPercentage').value ? Number(document.getElementById('oPercentage').value) : null,
          offer_coupon_code: document.getElementById('oCoupon').value.trim() || null,
          offer_end_at: document.getElementById('oEndAt').value ? new Date(document.getElementById('oEndAt').value).toISOString() : null,
          announcement_enabled: document.getElementById('aEnabled').checked,
          announcement_text: document.getElementById('aText').value.trim() || null,
          announcement_cta_text: document.getElementById('aCtaText').value.trim() || null,
          announcement_link: document.getElementById('aLink').value.trim() || null,
          announcement_bg_color: document.getElementById('aBg').value.trim() || null,
          announcement_text_color: document.getElementById('aTextColor').value.trim() || null,
          announcement_animation: document.getElementById('aAnimation').value
        };
      }
      function collectMediaPayload() {
        return {
          banner_enabled: document.getElementById('mEnabled').checked,
          banner_type: document.getElementById('mType').value,
          placement: document.getElementById('mPlacement').value,
          desktop_url: document.getElementById('mDesktopUrl').value.trim() || null,
          mobile_url: document.getElementById('mMobileUrl').value.trim() || null,
          video_autoplay: document.getElementById('mAutoplay').checked,
          video_loop: document.getElementById('mLoop').checked,
          video_muted: document.getElementById('mMuted').checked,
          video_controls: document.getElementById('mControls').checked,
          text_headline: document.getElementById('mHeadline').value.trim() || null,
          text_subheadline: document.getElementById('mSubheadline').value.trim() || null,
          text_description: document.getElementById('mDescription').value.trim() || null,
          text_cta_text: document.getElementById('mCtaText').value.trim() || null,
          text_align: document.getElementById('mAlign').value,
          text_bg_color: document.getElementById('mBgColor').value.trim() || null,
          text_color: document.getElementById('mTextColor').value.trim() || null,
          text_animation: document.getElementById('mAnimation').value
        };
      }

      document.getElementById('saveCampaignBtn').addEventListener('click', function () {
        var btn = document.getElementById('saveCampaignBtn');
        btn.disabled = true;
        var name = document.getElementById('cName').value.trim();
        if (!name) { window.alert('Campaign Name is required.'); btn.disabled = false; return; }
        var slug = (isNew ? name : c.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + (isNew ? '-' + Date.now().toString(36) : '');
        var payload = {
          name: name,
          internal_name: document.getElementById('cInternalName').value.trim() || null,
          campaign_type: document.getElementById('cType').value,
          priority: Number(document.getElementById('cPriority').value) || 100,
          is_enabled: document.getElementById('cEnabled').checked,
          start_at: document.getElementById('cStart').value ? new Date(document.getElementById('cStart').value).toISOString() : null,
          end_at: document.getElementById('cEnd').value ? new Date(document.getElementById('cEnd').value).toISOString() : null
        };
        if (isNew) payload.slug = slug;

        var products = [];
        content().querySelectorAll('.campaign-product-check:checked').forEach(function (chk) {
          var pid = chk.dataset.productId;
          var priceEl = content().querySelector('.campaign-product-price[data-product-id="' + pid + '"]');
          var discEl = content().querySelector('.campaign-product-discount[data-product-id="' + pid + '"]');
          products.push({
            product_id: Number(pid),
            campaign_price: priceEl.value ? Number(priceEl.value) : null,
            discount_percentage: discEl.value ? Number(discEl.value) : null
          });
        });

        var savePromise = isNew ? AdminAPI.campaigns.create(payload) : AdminAPI.campaigns.update(c.id, payload).then(function () { return c; });
        savePromise.then(function (savedCampaign) {
          var campaignId = savedCampaign.id || c.id;
          return Promise.all([
            AdminAPI.campaigns.saveContent(campaignId, collectContentPayload()),
            AdminAPI.campaigns.saveMedia(campaignId, collectMediaPayload()),
            AdminAPI.campaigns.setProducts(campaignId, products)
          ]).then(function () {
            // Never trust the just-submitted form state as the "true" result — navigating back
            // into the editor re-fetches the campaign from Supabase from scratch (renderCampaignEditor
            // always does), so what's shown next is exactly what was actually saved.
            campaignSaveFeedback = { ok: true, message: 'Campaign updated successfully ✓' };
            Router.navigate(BASE_PATH + '/admin/campaigns/' + campaignId);
          });
        }).catch(function (err) {
          btn.disabled = false;
          var msg = 'Campaign settings could not be saved.' + (err && err.message ? ' (' + err.message + ')' : '');
          var existing = content().querySelector('.campaign-save-feedback');
          if (existing) existing.remove();
          content().insertAdjacentHTML('afterbegin', '<p class="campaign-save-feedback err">' + esc(msg) + '</p>');
        });
      });

      if (!isNew) {
        var pauseBtn = document.getElementById('pauseNowBtn');
        if (pauseBtn) pauseBtn.addEventListener('click', function () { AdminAPI.campaigns.update(c.id, { is_paused: true }).then(function () { renderCampaignEditor(c.id); }); });
        var resumeBtn = document.getElementById('resumeNowBtn');
        if (resumeBtn) resumeBtn.addEventListener('click', function () { AdminAPI.campaigns.update(c.id, { is_paused: false }).then(function () { renderCampaignEditor(c.id); }); });
        var endBtn = document.getElementById('endNowBtn');
        if (endBtn) endBtn.addEventListener('click', function () {
          if (!window.confirm('End this campaign right now? It will disappear from the website immediately.')) return;
          AdminAPI.campaigns.update(c.id, { end_at: new Date().toISOString() }).then(function () { renderCampaignEditor(c.id); });
        });
      }
    });
  }

  // A simplified, admin-only preview of the banner (not the exact live component — good enough
  // to sanity-check headline/colors/media before publishing without leaving Admin).
  function renderCampaignBannerPreviewHtml(media, content_, isMobile) {
    var url = (isMobile && media.mobile_url) || media.desktop_url;
    if (media.banner_type === 'video' && url) {
      return '<video src="' + esc(url) + '" style="width:100%;display:block;" muted autoplay loop playsinline></video>';
    }
    if (url && media.banner_type !== 'animated_text') {
      return '<img src="' + esc(url) + '" style="width:100%;display:block;" alt="">';
    }
    var bg = media.text_bg_color || '#F7DEE1';
    var fg = media.text_color || '#2E2A26';
    return '<div style="background:' + esc(bg) + ';color:' + esc(fg) + ';padding:32px 20px;text-align:' + esc(media.text_align || 'center') + ';">' +
      (media.text_headline ? '<div style="font-size:1.3rem;font-weight:700;">' + esc(media.text_headline) + '</div>' : '') +
      (media.text_subheadline ? '<div style="font-size:0.95rem;margin-top:4px;">' + esc(media.text_subheadline) + '</div>' : '') +
      (media.text_description ? '<div style="font-size:0.8rem;margin-top:8px;">' + esc(media.text_description) + '</div>' : '') +
      (media.text_cta_text ? '<div style="margin-top:14px;"><span style="background:#E68A98;color:#fff;padding:8px 18px;border-radius:999px;font-size:0.8rem;font-weight:600;">' + esc(media.text_cta_text) + '</span></div>' : '') +
    '</div>';
  }

  /* ---------- 12. Settings ---------- */
  ROUTE_RENDERERS.settings = function () {
    content().innerHTML =
      '<div class="panel-card"><h3>Account</h3><p style="font-size:0.85rem;">Logged in as <strong>' + esc(document.getElementById('topbarUsername').textContent) + '</strong>.</p></div>' +
      '<div class="panel-card"><h3>Pickup Address</h3>' +
        '<p style="font-size:0.8rem;color:var(--text-soft);margin-bottom:14px;">Used as the ship-from address on every Amazon Shipping shipment created from an order — see Orders → an order → Shipping.</p>' +
        '<p class="empty-state" id="pickupAddressLoading">Loading…</p>' +
      '</div>' +
      '<div class="panel-card"><h3>Store Info</h3><p style="font-size:0.85rem;color:var(--text-soft);">WhatsApp number, delivery threshold and shipping cost are configured in the customer site\'s <code>CONFIG</code> and in <code>create_order()</code> in the Supabase migration.</p></div>';

    AdminAPI.settings.get().then(function (s) {
      var card = document.getElementById('pickupAddressLoading').closest('.panel-card');
      card.innerHTML = '<h3>Pickup Address</h3>' +
        '<p style="font-size:0.8rem;color:var(--text-soft);margin-bottom:14px;">Used as the ship-from address on every Amazon Shipping shipment created from an order — see Orders → an order → Shipping.</p>' +
        '<div class="form-row">' +
          field('pickupName', 'Contact Name', s.pickup_name) + field('pickupPhone', 'Phone', s.pickup_phone) +
        '</div>' +
        field('pickupLine1', 'Address Line 1', s.pickup_line1) + field('pickupLine2', 'Address Line 2 (optional)', s.pickup_line2) +
        '<div class="form-row">' +
          field('pickupCity', 'City', s.pickup_city) + field('pickupState', 'State', s.pickup_state) +
        '</div>' +
        field('pickupPincode', 'PIN Code', s.pickup_pincode) +
        '<p class="login-error" id="pickupAddressError"></p>' +
        '<button type="button" class="btn-primary btn-sm" id="savePickupAddressBtn">Save Pickup Address</button>';

      function field(id, label, val) {
        return '<div class="form-field"><label for="' + id + '">' + label + '</label><input type="text" id="' + id + '" value="' + esc(val || '') + '"></div>';
      }

      document.getElementById('savePickupAddressBtn').addEventListener('click', function () {
        var payload = {
          name: document.getElementById('pickupName').value.trim(), phone: document.getElementById('pickupPhone').value.trim(),
          line1: document.getElementById('pickupLine1').value.trim(), line2: document.getElementById('pickupLine2').value.trim(),
          city: document.getElementById('pickupCity').value.trim(), state: document.getElementById('pickupState').value.trim(),
          pincode: document.getElementById('pickupPincode').value.trim()
        };
        var errorEl = document.getElementById('pickupAddressError');
        errorEl.textContent = '';
        AdminAPI.settings.savePickupAddress(payload)
          .then(function () { errorEl.style.color = 'var(--sage)'; errorEl.textContent = 'Saved ✓'; })
          .catch(function (err) { errorEl.style.color = ''; errorEl.textContent = err.message; });
      });
    }).catch(function (err) {
      var card = document.getElementById('pickupAddressLoading').closest('.panel-card');
      card.innerHTML = '<h3>Pickup Address</h3><p class="empty-state">Not available yet — ' + esc(err.message) + '</p>';
    });
  };

  /* ---------- 14. New-order notifications (polling) ---------- */
  function startNotifications() {
    var LAST_SEEN_KEY = 'ym_admin_last_seen_order_id';
    function lastSeen() { return Number(window.localStorage.getItem(LAST_SEEN_KEY) || 0); }
    function setLastSeen(id) { window.localStorage.setItem(LAST_SEEN_KEY, String(id)); }

    function beep() {
      try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var o = ctx.createOscillator(); var g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880; g.gain.value = 0.08;
        o.start(); o.stop(ctx.currentTime + 0.15);
      } catch (e) { /* audio not available */ }
    }

    function poll() {
      AdminAPI.dashboard().then(function (d) {
        var newest = d.recentOrders[0];
        if (newest && newest.id > lastSeen()) {
          if (lastSeen() > 0) { // don't notify for orders that already existed before this session started polling
            document.getElementById('orderToastBody').textContent = '#' + newest.orderNumber + ' — ' + newest.customerName + ' — ' + fmtPrice(newest.total);
            var toast = document.getElementById('orderToast');
            toast.hidden = false;
            beep();
            window.setTimeout(function () { toast.hidden = true; }, 6000);
            document.getElementById('notifDot').hidden = false;
          }
          setLastSeen(newest.id);
        }
      }).catch(function () { /* ignore transient poll errors */ });
    }

    document.getElementById('notifBell').addEventListener('click', function () { document.getElementById('notifDot').hidden = true; Router.navigate(BASE_PATH + '/admin/orders'); });

    poll();
    window.setInterval(poll, 15000);
  }

  /* ---------- 15. Init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    initShellChrome();
    initAuth();
  });
})();
