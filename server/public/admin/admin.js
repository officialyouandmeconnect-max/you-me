/* =========================================================
   YOU & ME — Admin Panel
   1. API helper
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

  /* ---------- 1. API helper ---------- */
  function api(path, options) {
    options = options || {};
    return fetch('/api' + path, Object.assign({
      credentials: 'include',
      headers: options.body ? { 'Content-Type': 'application/json' } : {}
    }, options)).then(function (res) {
      if (res.status === 401) { showLogin(); throw new Error('Not authenticated'); }
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
      });
    });
  }
  function apiGet(path) { return api(path); }
  function apiPost(path, body) { return api(path, { method: 'POST', body: JSON.stringify(body) }); }
  function apiPut(path, body) { return api(path, { method: 'PUT', body: JSON.stringify(body) }); }
  function apiPatch(path, body) { return api(path, { method: 'PATCH', body: JSON.stringify(body) }); }
  function apiDelete(path) { return api(path, { method: 'DELETE' }); }

  function fmtPrice(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
  function fmtDate(iso) { if (!iso) return '—'; var d = new Date(iso.replace(' ', 'T') + (iso.indexOf('Z') === -1 && iso.indexOf('+') === -1 ? 'Z' : '')); return isNaN(d) ? iso : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function statusLabel(s) { return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

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

  /* ---------- 2. Auth ---------- */
  function showLogin() {
    document.getElementById('loginScreen').hidden = false;
    document.getElementById('adminApp').hidden = true;
  }
  function showApp(username) {
    document.getElementById('loginScreen').hidden = true;
    document.getElementById('adminApp').hidden = false;
    document.getElementById('topbarUsername').textContent = username || '';
  }

  function initAuth() {
    apiGet('/admin/session').then(function (data) {
      if (data.authenticated) { showApp(data.username); Router.start(); startNotifications(); }
      else showLogin();
    }).catch(function () { showLogin(); });

    document.getElementById('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var errorEl = document.getElementById('loginError');
      errorEl.textContent = '';
      apiPost('/admin/login', {
        username: document.getElementById('loginUsername').value.trim(),
        password: document.getElementById('loginPassword').value
      }).then(function (data) {
        showApp(data.username);
        Router.start();
        startNotifications();
      }).catch(function (err) { errorEl.textContent = err.message; });
    });

    document.getElementById('logoutBtn').addEventListener('click', function () {
      apiPost('/admin/logout', {}).then(function () { window.location.hash = ''; showLogin(); });
    });
  }

  /* ---------- 3. Router + shell chrome ---------- */
  var ROUTE_TITLES = {
    dashboard: 'Dashboard', products: 'Products', orders: 'Orders', customers: 'Customers',
    inventory: 'Inventory', shipping: 'Shipping', categories: 'Categories', media: 'Media Library', settings: 'Settings'
  };
  var ROUTE_RENDERERS = {}; // filled in by each section below

  var Router = (function () {
    function currentRoute() {
      var raw = (window.location.hash || '#dashboard').replace('#', '');
      return raw.split('/')[0].split('?')[0] || 'dashboard';
    }
    function currentParam() {
      var raw = (window.location.hash || '').replace('#', '');
      var parts = raw.split('/');
      return parts[1] || null;
    }
    function render() {
      var route = currentRoute();
      document.getElementById('pageTitle').textContent = ROUTE_TITLES[route] || 'Dashboard';
      document.querySelectorAll('.sidebar-nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.route === route); });
      document.getElementById('adminSidebar').classList.remove('open');
      var renderer = ROUTE_RENDERERS[route] || ROUTE_RENDERERS.dashboard;
      renderer(currentParam());
    }
    function start() { window.addEventListener('hashchange', render); render(); }
    return { start: start, currentParam: currentParam };
  })();

  function initShellChrome() {
    document.getElementById('mobileNavToggle').addEventListener('click', function () {
      document.getElementById('adminSidebar').classList.toggle('open');
    });
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
    apiGet('/admin/dashboard').then(function (d) {
      content().innerHTML =
        '<div class="stat-grid">' +
          statCard('Total Orders', d.orders.total, 'pink') +
          statCard('New', d.orders.new, 'amber') +
          statCard('Confirmed', d.orders.confirmed, 'blue') +
          statCard('Packing', d.orders.packing, 'blue') +
          statCard('Shipped', d.orders.shipped, 'sage') +
          statCard('Delivered', d.orders.delivered, 'sage') +
          statCard('Cancelled', d.orders.cancelled, 'red') +
        '</div>' +
        '<div class="stat-grid">' +
          // Revenue only counts orders actually marked Paid — never just placed. See
          // routes/adminDashboard.js for the exact query this comes from.
          statCard('Revenue (Paid)', fmtPrice(d.revenue.paid), 'sage') +
          statCard('Pending Payment', fmtPrice(d.revenue.pending), 'amber') +
          statCard('Customers', d.customers.total, 'blue') +
          statCard('Total Products', d.products.total, 'blue') +
          statCard('Low Stock', d.products.lowStock, 'amber') +
          statCard('Out of Stock', d.products.outOfStock, 'red') +
        '</div>' +
        '<div class="stat-grid">' +
          statCard("Today's Orders", d.orders.today, 'pink') +
          statCard("This Week", d.orders.thisWeek, 'pink') +
          statCard("This Month", d.orders.thisMonth, 'pink') +
        '</div>' +
        '<div class="panel-card">' +
          '<h3>Recent Orders</h3>' +
          (d.recentOrders.length === 0
            ? '<div class="empty-state"><p><strong>No orders yet</strong></p><p>New customer orders will appear here automatically.</p></div>'
            : recentOrdersTable(d.recentOrders)) +
        '</div>';
    });
  };

  function statCard(label, value, accent) {
    return '<div class="stat-card accent-' + accent + '"><div class="stat-value">' + value + '</div><div class="stat-label">' + label + '</div></div>';
  }

  function recentOrdersTable(orders) {
    return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Order</th><th>Customer</th><th>Photo</th><th>Amount</th><th>Payment</th><th>Status</th><th>Date</th><th></th>' +
      '</tr></thead><tbody>' +
      orders.map(function (o) {
        return '<tr>' +
          '<td>' + esc(o.orderNumber) + '</td>' +
          '<td>' + esc(o.customerName) + '</td>' +
          '<td>' + imageHtml(o.thumbnail) + '</td>' +
          '<td>' + fmtPrice(o.total) + '</td>' +
          '<td><span class="badge badge-' + o.paymentStatus + '">' + statusLabel(o.paymentStatus) + '</span></td>' +
          '<td><span class="badge badge-' + o.orderStatus + '">' + statusLabel(o.orderStatus) + '</span></td>' +
          '<td>' + fmtDate(o.createdAt) + '</td>' +
          '<td><a href="#orders/' + o.id + '" class="btn-ghost btn-sm">View</a></td>' +
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
    apiGet('/admin/products').then(function (products) {
      var filtered = productListState.q
        ? products.filter(function (p) { return (p.name + ' ' + p.sku).toLowerCase().indexOf(productListState.q.toLowerCase()) !== -1; })
        : products;

      content().innerHTML =
        '<div class="section-heading-row">' +
          '<div class="search-box"><input type="text" id="productSearch" placeholder="Search by name or SKU…" value="' + esc(productListState.q) + '"></div>' +
          '<a href="#products/new" class="btn-primary">+ Add Product</a>' +
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
              '<a href="#products/' + p.id + '" class="btn-ghost btn-sm">Edit</a> ' +
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
        btn.addEventListener('click', function () { apiPost('/admin/products/' + btn.dataset.dup + '/duplicate', {}).then(renderProductList); });
      });
      content().querySelectorAll('[data-toggle-status]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var next = btn.dataset.current === 'active' ? 'draft' : 'active';
          apiPatch('/admin/products/' + btn.dataset.toggleStatus + '/status', { status: next }).then(renderProductList);
        });
      });
      content().querySelectorAll('[data-delete]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (!window.confirm('Delete this product? If it appears in past orders it will be set to Draft instead.')) return;
          apiDelete('/admin/products/' + btn.dataset.delete).then(renderProductList);
        });
      });
    });
  }

  function renderProductForm(id) {
    var isNew = !id;
    var load = isNew ? Promise.resolve({ id: null, sku: '', name: '', description: '', fabric: '', category: 'kids', subcategory: '', ageGroup: '', price: '', oldPrice: '', images: [], sizes: [], colors: [], variants: [], featured: false, newArrival: false, status: 'active' }) : apiGet('/admin/products/' + id);

    load.then(function (p) {
      var state = { images: p.images.slice(), sizes: p.sizes.slice(), colors: p.colors.slice(), variants: p.variants || [] };

      content().innerHTML =
        '<div class="section-heading-row"><h3 style="font-size:1.05rem;">' + (isNew ? 'Add Product' : 'Edit Product') + '</h3>' +
          '<a href="#products" class="btn-ghost btn-sm">← Back to Products</a></div>' +
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
          '<label class="image-slot image-slot-add"><span>📷</span><span>Add Image</span><input type="file" accept="image/*" id="imageFileInput" multiple></label>';

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
          files.forEach(function (file) {
            var formData = new FormData();
            formData.append('image', file);
            fetch('/api/admin/upload', { method: 'POST', credentials: 'include', body: formData })
              .then(function (r) { return r.json(); })
              .then(function (data) {
                if (data.url) { state.images.push(data.url); renderImageGrid(); }
                else window.alert(data.error || 'Upload failed');
              });
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
            apiPatch('/admin/products/' + p.id + '/variant-stock', { variantId: Number(btn.dataset.saveVariant), stock: Number(input.value) })
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
        var req = isNew ? apiPost('/admin/products', payload) : apiPut('/admin/products/' + p.id, payload);
        req.then(function (saved) { window.location.hash = '#products/' + saved.id; renderProductForm(saved.id); })
          .catch(function (err) { errorEl.textContent = err.message; });
      });
    });
  }

  /* ---------- 6. Orders ---------- */
  var orderListState = { status: 'all', q: '' };
  var ORDER_STATUSES = ['new', 'confirmed', 'packing', 'ready_to_ship', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];
  var PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

  ROUTE_RENDERERS.orders = function (param) {
    if (param) return renderOrderDetail(param);
    renderOrderList();
  };

  function renderOrderList() {
    content().innerHTML = '<p class="empty-state">Loading orders…</p>';
    var qs = [];
    if (orderListState.status !== 'all') qs.push('status=' + encodeURIComponent(orderListState.status));
    if (orderListState.q) qs.push('q=' + encodeURIComponent(orderListState.q));

    apiGet('/admin/orders' + (qs.length ? '?' + qs.join('&') : '')).then(function (orders) {
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
            '<td><a href="#orders/' + o.id + '" class="btn-ghost btn-sm">View</a></td>' +
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

  function renderOrderDetail(id) {
    content().innerHTML = '<p class="empty-state">Loading order…</p>';
    apiGet('/admin/orders/' + id).then(function (o) {
      apiGet('/admin/shipments/' + o.id).catch(function () { return null; }).then(function (shipment) {
        o.shipment = shipment || o.shipment;
        content().innerHTML =
          '<div class="section-heading-row"><h3 style="font-size:1.1rem;">Order ' + esc(o.orderNumber) + '</h3>' +
            '<a href="#orders" class="btn-ghost btn-sm">← Back to Orders</a></div>' +
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
                '<p>Method: ' + esc(o.paymentMethod) + '<br>Status: <span class="badge badge-' + o.paymentStatus + '">' + statusLabel(o.paymentStatus) + '</span></p>' +
                (o.paymentReference ? '<p style="font-size:0.8rem;">Reference: ' + esc(o.paymentReference) + '</p>' : '') +
                (o.paymentNotes ? '<p style="font-size:0.8rem;">Notes: ' + esc(o.paymentNotes) + '</p>' : '') +
                '<div class="form-field"><label for="paymentStatusSelect">Update payment status</label>' +
                  '<select id="paymentStatusSelect">' + PAYMENT_STATUSES.map(function (s) { return '<option value="' + s + '"' + (s === o.paymentStatus ? ' selected' : '') + '>' + statusLabel(s) + '</option>'; }).join('') + '</select></div>' +
                '<div class="form-field"><label for="paymentRefInput">Payment reference / notes</label><input type="text" id="paymentRefInput" placeholder="UPI ref, screenshot note…"></div>' +
                '<button type="button" class="btn-primary btn-sm" id="savePaymentBtn">Update Payment</button>' +
              '</div>' +
              '<div class="panel-card"><h3>Order Status</h3>' +
                '<div class="status-timeline">' + o.statusHistory.map(function (h) {
                  return '<div class="status-timeline-item"><span class="status-timeline-dot"></span><div><strong>' + statusLabel(h.status) + '</strong><br><span style="color:var(--text-soft);">' + fmtDate(h.created_at) + (h.note ? ' — ' + esc(h.note) : '') + '</span></div></div>';
                }).join('') + '</div>' +
                '<div class="status-select-row">' +
                  '<select id="orderStatusSelect">' + ORDER_STATUSES.map(function (s) { return '<option value="' + s + '"' + (s === o.orderStatus ? ' selected' : '') + '>' + statusLabel(s) + '</option>'; }).join('') + '</select>' +
                  '<button type="button" class="btn-primary btn-sm" id="saveStatusBtn">Update</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>';

        document.getElementById('savePaymentBtn').addEventListener('click', function () {
          apiPatch('/admin/orders/' + o.id + '/payment', {
            paymentStatus: document.getElementById('paymentStatusSelect').value,
            paymentNotes: document.getElementById('paymentRefInput').value.trim() || null
          }).then(function () { renderOrderDetail(o.id); });
        });
        document.getElementById('saveStatusBtn').addEventListener('click', function () {
          apiPatch('/admin/orders/' + o.id + '/status', { status: document.getElementById('orderStatusSelect').value })
            .then(function () { renderOrderDetail(o.id); });
        });
        bindShippingForm(o);
      });
    });
  }

  function renderShippingCard(o) {
    var s = o.shipment;
    return '<div class="panel-card"><h3>Shipping</h3>' +
      '<div class="form-row">' +
        '<div class="form-field"><label>Courier</label><input type="text" id="shipCourier" value="' + esc(s ? s.courier : '') + '" placeholder="e.g. Manual / India Post"></div>' +
        '<div class="form-field"><label>AWB / Tracking ID</label><input type="text" id="shipAwb" value="' + esc(s ? s.awb : '') + '"></div>' +
      '</div>' +
      '<div class="form-field"><label>Tracking URL</label><input type="text" id="shipUrl" value="' + esc(s ? s.tracking_url : '') + '"></div>' +
      '<div class="form-row">' +
        '<div class="form-field"><label>Shipping Cost (₹)</label><input type="number" id="shipCost" value="' + esc(s ? s.shipping_cost : '') + '"></div>' +
        '<div class="form-field"><label>Estimated Delivery</label><input type="date" id="shipEta" value="' + esc(s ? s.estimated_delivery : '') + '"></div>' +
      '</div>' +
      '<div class="form-field"><label>Pickup Date</label><input type="date" id="shipPickup" value="' + esc(s ? s.pickup_date : '') + '"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button type="button" class="btn-primary btn-sm" id="shipSaveBtn">' + (s ? 'Update Shipment' : 'Create Shipment') + '</button>' +
        '<button type="button" class="btn-secondary btn-sm" id="shipPrintBtn"' + (s ? '' : ' disabled') + '>Print Label</button>' +
        '<button type="button" class="btn-secondary btn-sm" id="shipCopyBtn"' + (s && s.awb ? '' : ' disabled') + '>Copy Tracking ID</button>' +
        (s && s.tracking_url ? '<a href="' + esc(s.tracking_url) + '" target="_blank" class="btn-secondary btn-sm">Track Shipment</a>' : '<button type="button" class="btn-secondary btn-sm" disabled>Track Shipment</button>') +
      '</div>' +
      '<p style="font-size:0.72rem;color:var(--text-soft);margin-top:10px;">Manual shipping today. Amazon Shipping / Ekart / DTDC can be plugged in later without changing this order.</p>' +
    '</div>';
  }

  function bindShippingForm(o) {
    var saveBtn = document.getElementById('shipSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      apiPost('/admin/shipments/' + o.id, {
        courier: document.getElementById('shipCourier').value.trim(),
        awb: document.getElementById('shipAwb').value.trim(),
        trackingUrl: document.getElementById('shipUrl').value.trim(),
        shippingCost: document.getElementById('shipCost').value ? Number(document.getElementById('shipCost').value) : null,
        pickupDate: document.getElementById('shipPickup').value || null,
        estimatedDelivery: document.getElementById('shipEta').value || null
      }).then(function () { renderOrderDetail(o.id); });
    });
    var printBtn = document.getElementById('shipPrintBtn');
    if (printBtn) printBtn.addEventListener('click', function () {
      var w = window.open('', '_blank');
      w.document.write('<html><head><title>Shipping Label ' + esc(o.orderNumber) + '</title></head><body style="font-family:sans-serif;padding:30px;">' +
        '<h2>You & Me — Shipping Label</h2><p><strong>Order:</strong> ' + esc(o.orderNumber) + '</p>' +
        '<p><strong>To:</strong><br>' + esc(o.customer.name) + '<br>' + esc(o.customer.phone) + '<br>' +
        esc(o.address.house) + ', ' + esc(o.address.street) + '<br>' + esc(o.address.city) + ', ' + esc(o.address.state) + ' — ' + esc(o.address.pincode) + '</p>' +
        '<p><strong>Courier:</strong> ' + esc(document.getElementById('shipCourier').value) + '<br><strong>AWB:</strong> ' + esc(document.getElementById('shipAwb').value) + '</p>' +
        '</body></html>');
      w.document.close(); w.print();
    });
    var copyBtn = document.getElementById('shipCopyBtn');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(document.getElementById('shipAwb').value).then(function () { copyBtn.textContent = 'Copied ✓'; window.setTimeout(function () { copyBtn.textContent = 'Copy Tracking ID'; }, 1200); });
    });
  }

  /* ---------- 7. Customers ---------- */
  ROUTE_RENDERERS.customers = function (param) {
    if (param) return renderCustomerDetail(param);
    content().innerHTML = '<p class="empty-state">Loading customers…</p>';
    apiGet('/admin/customers').then(function (customers) {
      content().innerHTML = '<div class="table-wrap"><table class="data-table"><thead><tr>' +
        '<th>Name</th><th>Phone</th><th>Email</th><th>Orders</th><th>Total Value</th><th>Last Order</th><th></th></tr></thead><tbody>' +
        (customers.length === 0 ? '' : customers.map(function (c) {
          return '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.phone) + '</td><td>' + esc(c.email || '—') + '</td>' +
            '<td>' + c.orderCount + '</td><td>' + fmtPrice(c.totalValue) + '</td><td>' + fmtDate(c.lastOrderAt) + '</td>' +
            '<td><a href="#customers/' + encodeURIComponent(c.phone) + '" class="btn-ghost btn-sm">View</a></td></tr>';
        }).join('')) + '</tbody></table></div>' +
        (customers.length === 0 ? '<p class="empty-state">No customers yet — they appear here after the first order.</p>' : '');
    });
  };

  function renderCustomerDetail(phone) {
    apiGet('/admin/customers/' + phone).then(function (c) {
      content().innerHTML =
        '<div class="section-heading-row"><h3 style="font-size:1.05rem;">' + esc(c.name) + '</h3><a href="#customers" class="btn-ghost btn-sm">← Back</a></div>' +
        '<div class="panel-card"><h3>Details</h3><p>Phone: ' + esc(c.phone) + '<br>Email: ' + esc(c.email || '—') + '<br>Orders: ' + c.orderCount + ' &middot; Total Spent: ' + fmtPrice(c.totalValue) + '</p></div>' +
        '<div class="panel-card"><h3>Addresses</h3>' + c.addresses.map(function (a) {
          return '<p>' + esc(a.house) + ', ' + esc(a.street) + (a.landmark ? ' (near ' + esc(a.landmark) + ')' : '') + '<br>' + esc(a.city) + ', ' + esc(a.state) + ' — ' + esc(a.pincode) + '</p>';
        }).join('<hr style="border:none;border-top:1px solid var(--border);margin:10px 0;">') + '</div>' +
        '<div class="panel-card"><h3>Previous Orders</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>' +
          c.orders.map(function (o) {
            return '<tr><td>' + esc(o.orderNumber) + '</td><td>' + fmtDate(o.createdAt) + '</td><td>' + fmtPrice(o.total) + '</td>' +
              '<td><span class="badge badge-' + o.orderStatus + '">' + statusLabel(o.orderStatus) + '</span></td><td><a href="#orders/' + o.id + '" class="btn-ghost btn-sm">View</a></td></tr>';
          }).join('') + '</tbody></table></div></div>';
    });
  }

  /* ---------- 8. Inventory ---------- */
  ROUTE_RENDERERS.inventory = function () {
    content().innerHTML = '<p class="empty-state">Loading inventory…</p>';
    apiGet('/admin/products').then(function (products) {
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
              '<td><a href="#products/' + r.productId + '" class="btn-ghost btn-sm">Edit Product</a></td></tr>';
          }).join('') + '</tbody></table></div></div>';

      content().querySelectorAll('.inv-stock-input').forEach(function (input) {
        input.addEventListener('change', function () {
          apiPatch('/admin/products/' + input.dataset.pid + '/variant-stock', { variantId: Number(input.dataset.vid), stock: Number(input.value) });
        });
      });
    });
  };

  /* ---------- 9. Shipping (overview across orders) ---------- */
  ROUTE_RENDERERS.shipping = function () {
    content().innerHTML = '<p class="empty-state">Loading…</p>';
    apiGet('/admin/orders?status=all').then(function (orders) {
      var relevant = orders.filter(function (o) { return ['packing', 'ready_to_ship', 'shipped', 'out_for_delivery', 'delivered'].indexOf(o.orderStatus) !== -1; });
      content().innerHTML = '<div class="panel-card"><h3>Orders Ready for / In Shipping</h3>' +
        (relevant.length === 0 ? '<p class="empty-state">No orders in packing or shipping stages yet.</p>' :
          '<div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th></th></tr></thead><tbody>' +
          relevant.map(function (o) {
            return '<tr><td>' + esc(o.orderNumber) + '</td><td>' + esc(o.customerName) + '</td>' +
              '<td><span class="badge badge-' + o.orderStatus + '">' + statusLabel(o.orderStatus) + '</span></td>' +
              '<td><a href="#orders/' + o.id + '" class="btn-ghost btn-sm">Manage Shipment</a></td></tr>';
          }).join('') + '</tbody></table></div>') +
        '</div>' +
        '<div class="panel-card"><h3>Courier Integrations</h3><p style="font-size:0.85rem;color:var(--text-soft);">Manual shipping is active today. Amazon Shipping, Ekart and DTDC can be connected here later — each order\'s shipment record already has a <code>carrier_code</code> field ready for that, so this won\'t require rebuilding Orders.</p></div>';
    });
  };

  /* ---------- 10. Categories ---------- */
  ROUTE_RENDERERS.categories = function () {
    content().innerHTML = '<p class="empty-state">Loading…</p>';
    apiGet('/admin/products').then(function (products) {
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
    apiGet('/admin/media').then(function (media) {
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
        Promise.all(files.map(function (file) {
          var fd = new FormData(); fd.append('image', file);
          return fetch('/api/admin/upload', { method: 'POST', credentials: 'include', body: fd }).then(function (r) { return r.json(); });
        })).then(function () { ROUTE_RENDERERS.media(); });
      });
      content().querySelectorAll('[data-copy-url]').forEach(function (btn) {
        btn.addEventListener('click', function () { navigator.clipboard.writeText(btn.dataset.copyUrl); btn.textContent = 'Copied ✓'; window.setTimeout(function () { btn.textContent = 'Copy URL'; }, 1200); });
      });
      content().querySelectorAll('[data-delete-media]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          apiDelete('/admin/media/' + btn.dataset.deleteMedia).then(function () { ROUTE_RENDERERS.media(); }).catch(function (err) { window.alert(err.message); });
        });
      });
    });
  };

  /* ---------- 12. Settings ---------- */
  ROUTE_RENDERERS.settings = function () {
    content().innerHTML =
      '<div class="panel-card"><h3>Account</h3><p style="font-size:0.85rem;">Logged in as <strong>' + esc(document.getElementById('topbarUsername').textContent) + '</strong>.</p></div>' +
      '<div class="panel-card"><h3>Store Info</h3><p style="font-size:0.85rem;color:var(--text-soft);">WhatsApp number, delivery threshold and shipping cost are configured in the server\'s <code>CONFIG</code> (customer site) and route defaults — a dedicated settings form can be added here once you tell me which of these you want editable from the UI.</p></div>';
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
      apiGet('/admin/dashboard').then(function (d) {
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

    document.getElementById('notifBell').addEventListener('click', function () { document.getElementById('notifDot').hidden = true; window.location.hash = '#orders'; });

    poll();
    window.setInterval(poll, 15000);
  }

  /* ---------- 15. Init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    initShellChrome();
    initAuth();
  });
})();
