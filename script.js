/* =========================================================
   YOU & ME — site interactions, router + WhatsApp shopping system
   1.  Config
   2.  Product data (single source of truth for every view)
   3.  Utils
   4.  Cart service (localStorage-backed)
   5.  Wishlist service (localStorage-backed)
   6.  Toast
   7.  Panel open/close helpers (shared by all overlays)
   8.  Shared product-card renderer + grid event delegation
   9.  Router (hash-based views: home / kids / all / new-arrivals / family / couples)
   10. Gallery view (Kids Wear / View All / New Arrivals)
   11. Coming Soon view (Family Wear / Couple Sets)
   12. Product detail modal
   13. Cart drawer
   14. Wishlist drawer
   15. Search overlay
   16. Account panel (UI only — no backend yet)
   17. Checkout
   18. Order service (WhatsApp today, pluggable payment methods later)
   19. Order success screen
   20. Chrome: mobile nav, sticky header, testimonial carousel, newsletter
   21. Init
   ========================================================= */

(function () {
  'use strict';

  /* ---------- 1. Config ---------- */
  var CONFIG = {
    whatsappNumber: '919544146751',
    storeName: 'You & Me',
    shippingFlat: 80,
    freeShippingThreshold: 999
  };

  /* ---------- 2. Product data ---------- */
  // Single source of truth: PRODUCTS is now loaded live from the store's own API (see
  // youandme-server/) instead of being hardcoded here. Every view (homepage, View All, Kids
  // Wear, New Arrivals, Search) reads from this same array once loadProducts() resolves —
  // products/images added from the Admin Panel appear here automatically, no HTML edits needed.
  var PRODUCTS = [];

  function loadProducts() {
    return supabaseClient
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('status', 'active')
      .order('id', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        PRODUCTS.length = 0;
        (res.data || []).forEach(function (row) { PRODUCTS.push(mapSupabaseProduct(row)); });
      })
      .catch(function (err) {
        console.error('Could not load products from Supabase:', err);
      });
  }

  // A product image is either one of the site's pastel placeholder classes (legacy/no-photo
  // products — see .placeholder-img / .img-* in style.css) or a real uploaded URL from Admin.
  function isPlaceholderImage(url) { return typeof url === 'string' && url.indexOf('placeholder:') === 0; }
  function placeholderClass(url) { return url.slice('placeholder:'.length); }
  function productImageHtml(url) {
    if (!url) return '<div class="placeholder-img img-beige img-fill-parent"></div>';
    if (isPlaceholderImage(url)) return '<div class="placeholder-img ' + placeholderClass(url) + ' img-fill-parent"></div>';
    return '<img class="img-fill-parent" src="' + escapeHtml(url) + '" alt="">';
  }

  var SUBCATEGORY_LABELS = {
    baby: 'Baby', boys: 'Boys', girls: 'Girls', sets: 'Sets',
    tshirts: 'T-Shirts', dresses: 'Dresses', nightwear: 'Nightwear'
  };
  var SUBCATEGORY_ORDER = ['baby', 'boys', 'girls', 'sets', 'tshirts', 'dresses', 'nightwear'];

  /* ---------- 3. Utils ---------- */
  function formatPrice(value) {
    return '₹' + Number(value).toLocaleString('en-IN');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function findProduct(id) {
    // Product ids come back from the API as numbers, but every data-* attribute in the DOM
    // (dataset.buyNow, dataset.openProduct, …) is always a string — compare loosely so a
    // click handler passing "12" still matches product.id === 12.
    for (var i = 0; i < PRODUCTS.length; i++) {
      if (String(PRODUCTS[i].id) === String(id)) return PRODUCTS[i];
    }
    return null;
  }

  function discountPercent(product) {
    if (!product.oldPrice || product.oldPrice <= product.price) return 0;
    return Math.round((1 - product.price / product.oldPrice) * 100);
  }

  function stockInfo(stock) {
    if (stock <= 0) return { cls: 'out-of-stock', label: 'Out of Stock' };
    if (stock <= 4) return { cls: 'low-stock', label: 'Only a Few Left' };
    return { cls: 'in-stock', label: 'In Stock' };
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function heartIconSVG(filled) {
    return '<svg viewBox="0 0 24 24" width="15" height="15">' +
      '<path d="M12 20s-7-4.4-9.3-9C1.2 7.7 3 4.5 6.4 4.5c2 0 3.4 1.1 5.6 3.5 2.2-2.4 3.6-3.5 5.6-3.5 3.4 0 5.2 3.2 3.7 6.5C19 15.6 12 20 12 20Z" ' +
      (filled ? 'fill="currentColor"' : 'fill="none"') + ' stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  }

  // A product photo is only worth putting in a WhatsApp message as a real, public link the
  // customer's phone can actually open — never localhost/blob/file, and a placeholder (a
  // product with no real photo yet) doesn't get a line at all rather than a broken one.
  function toAbsolutePublicImageUrl(image) {
    if (!image || typeof image !== 'string' || isPlaceholderImage(image)) return null;
    var absolute = /^https?:\/\//i.test(image) ? image : window.location.origin + image;
    var lower = absolute.toLowerCase();
    if (lower.indexOf('localhost') !== -1 || lower.indexOf('127.0.0.1') !== -1 || lower.indexOf('file://') !== -1 || lower.indexOf('blob:') !== -1) return null;
    return absolute;
  }

  /* ---------- 4. Cart service ---------- */
  var CartService = (function () {
    var STORAGE_KEY = 'youandme_cart';
    var items = [];
    var listeners = [];

    function load() {
      try {
        var raw = window.localStorage.getItem(STORAGE_KEY);
        items = raw ? JSON.parse(raw) : [];
      } catch (e) { items = []; }
    }

    function persist() {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) { /* storage unavailable */ }
      listeners.forEach(function (fn) { fn(items); });
    }

    function lineId(productId, size, color) { return productId + '|' + size + '|' + color; }

    function addItem(productId, size, color, qty) {
      var product = findProduct(productId);
      if (!product) return;
      var id = lineId(productId, size, color);
      var existing = items.filter(function (it) { return it.lineId === id; })[0];
      if (existing) {
        existing.qty += qty;
      } else {
        items.push({ lineId: id, productId: productId, name: product.name, price: product.price, img: product.images[0], size: size, color: color, qty: qty });
      }
      persist();
    }

    function updateQty(id, qty) {
      var item = items.filter(function (it) { return it.lineId === id; })[0];
      if (!item) return;
      item.qty = Math.max(1, qty);
      persist();
    }

    function removeItem(id) { items = items.filter(function (it) { return it.lineId !== id; }); persist(); }
    function clear() { items = []; persist(); }
    function getItems() { return items.slice(); }
    function getCount() { return items.reduce(function (sum, it) { return sum + it.qty; }, 0); }

    function getTotals() {
      var subtotal = items.reduce(function (sum, it) { return sum + it.price * it.qty; }, 0);
      var shipping = subtotal === 0 || subtotal >= CONFIG.freeShippingThreshold ? 0 : CONFIG.shippingFlat;
      var discount = 0;
      var total = subtotal + shipping - discount;
      return { subtotal: subtotal, shipping: shipping, discount: discount, total: total };
    }

    function onChange(fn) { listeners.push(fn); }

    load();
    return { addItem: addItem, updateQty: updateQty, removeItem: removeItem, clear: clear, getItems: getItems, getCount: getCount, getTotals: getTotals, onChange: onChange };
  })();

  /* ---------- 5. Wishlist service ---------- */
  var WishlistService = (function () {
    var STORAGE_KEY = 'youandme_wishlist';
    var ids = [];
    var listeners = [];

    function load() {
      try {
        var raw = window.localStorage.getItem(STORAGE_KEY);
        ids = raw ? JSON.parse(raw) : [];
      } catch (e) { ids = []; }
    }
    function persist() {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch (e) { /* unavailable */ }
      listeners.forEach(function (fn) { fn(ids); });
    }
    // Same string-vs-number caveat as findProduct(): ids arriving from a dataset attribute are
    // strings, ids arriving as product.id from the API are numbers — always compare as strings.
    function has(productId) { return ids.some(function (id) { return String(id) === String(productId); }); }
    function toggle(productId) {
      if (has(productId)) ids = ids.filter(function (id) { return String(id) !== String(productId); });
      else ids.push(productId);
      persist();
      return has(productId);
    }
    function remove(productId) { ids = ids.filter(function (id) { return String(id) !== String(productId); }); persist(); }
    function getIds() { return ids.slice(); }
    function getCount() { return ids.length; }
    function onChange(fn) { listeners.push(fn); }

    load();
    return { has: has, toggle: toggle, remove: remove, getIds: getIds, getCount: getCount, onChange: onChange };
  })();

  /* ---------- 6. Toast ---------- */
  var toastTimer = null;
  function showToast(message) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove('visible'); }, 2200);
  }

  /* ---------- 7. Panel open/close helpers ---------- */
  var openPanels = [];
  function getScrim() { return document.getElementById('overlayScrim'); }

  function openPanel(panel) {
    if (!panel) return;
    panel.hidden = false;
    void panel.offsetWidth;
    panel.classList.add('open');
    openPanels.push(panel);
    var scrim = getScrim();
    if (scrim) { scrim.hidden = false; void scrim.offsetWidth; scrim.classList.add('visible'); }
    document.body.style.overflow = 'hidden';
  }

  function closePanel(panel) {
    if (!panel) return;
    panel.classList.remove('open');
    openPanels = openPanels.filter(function (p) { return p !== panel; });
    window.setTimeout(function () { if (!panel.classList.contains('open')) panel.hidden = true; }, 300);
    if (openPanels.length === 0) {
      var scrim = getScrim();
      if (scrim) { scrim.classList.remove('visible'); window.setTimeout(function () { scrim.hidden = true; }, 250); }
      document.body.style.overflow = '';
    }
  }

  function closeAllPanels() {
    openPanels.slice().forEach(function (p) { closePanel(p); });
  }

  function closeTopPanel() {
    var panel = openPanels[openPanels.length - 1];
    if (panel) closePanel(panel);
  }

  function initPanelChrome() {
    var scrim = getScrim();
    if (scrim) scrim.addEventListener('click', closeTopPanel);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeTopPanel(); });
    ['productModalClose', 'cartDrawerClose', 'checkoutModalClose', 'successModalClose', 'searchOverlayClose', 'wishlistDrawerClose', 'accountPanelClose', 'infoModalClose'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', closeTopPanel);
    });
  }

  /* ---------- 8. Shared product-card renderer + grid event delegation ---------- */
  function renderProductCard(product) {
    var discount = discountPercent(product);
    var stock = stockInfo(product.stock);
    var oldPriceHtml = product.oldPrice ? '<span class="product-old-price">' + formatPrice(product.oldPrice) + '</span>' : '';
    var discountHtml = discount > 0 ? '<span class="product-discount">' + discount + '% OFF</span>' : '';
    var sizeChips = product.sizes.slice(0, 4).map(function (s) { return '<span class="product-chip">' + escapeHtml(s) + '</span>'; }).join('');
    var moreSizes = product.sizes.length > 4 ? '<span class="product-chip">+' + (product.sizes.length - 4) + '</span>' : '';
    var colorDots = product.colors.map(function (c) { return '<span class="product-color-dot" style="background:' + c.hex + '" title="' + escapeHtml(c.name) + '"></span>'; }).join('');
    var wishActive = WishlistService.has(product.id);

    return (
      '<article class="product-card" data-id="' + product.id + '">' +
        '<div class="product-img" data-open-product="' + product.id + '">' +
          productImageHtml(product.images[0]) +
          '<button class="wishlist-btn' + (wishActive ? ' active' : '') + '" type="button" aria-label="Toggle wishlist for ' + escapeHtml(product.name) + '" data-wishlist="' + product.id + '">' +
            heartIconSVG(wishActive) +
          '</button>' +
        '</div>' +
        '<h3 data-open-product="' + product.id + '">' + escapeHtml(product.name) + '</h3>' +
        '<div class="product-price-row">' +
          '<span class="product-price">' + formatPrice(product.price) + '</span>' + oldPriceHtml + discountHtml +
        '</div>' +
        '<div class="product-stock ' + stock.cls + '">' + stock.label + '</div>' +
        '<div class="product-chip-row">' + sizeChips + moreSizes + '</div>' +
        '<div class="product-chip-row">' + colorDots + '</div>' +
        '<div class="product-card-actions">' +
          '<button class="btn btn-outline btn-sm btn-block" type="button" data-add-to-cart="' + product.id + '"' + (product.stock <= 0 ? ' disabled' : '') + '>Add to Cart</button>' +
          '<button class="btn btn-primary btn-sm btn-block" type="button" data-buy-now="' + product.id + '"' + (product.stock <= 0 ? ' disabled' : '') + '>Buy Now</button>' +
        '</div>' +
      '</article>'
    );
  }

  function renderProductGrid(container, products, emptyMessage) {
    if (!container) return;
    if (products.length === 0) {
      container.innerHTML = '';
      if (emptyMessage) container.innerHTML = '<p class="gallery-empty-inline">' + emptyMessage + '</p>';
      return;
    }
    container.innerHTML = products.map(renderProductCard).join('');
  }

  // One delegated listener handles Add to Cart / Buy Now / Wishlist / Open Product for every
  // grid on the site (home featured, gallery, search results, wishlist) — added once on <body>.
  function initGlobalGridEvents() {
    document.body.addEventListener('click', function (event) {
      var wishlistBtn = event.target.closest('[data-wishlist]');
      if (wishlistBtn) {
        event.preventDefault();
        event.stopPropagation();
        var active = WishlistService.toggle(wishlistBtn.dataset.wishlist);
        // Every heart button for this product (it can appear in more than one open view/panel
        // at once — e.g. the product modal and the grid behind it) updates in the same tick.
        document.querySelectorAll('[data-wishlist="' + wishlistBtn.dataset.wishlist + '"]').forEach(function (btn) {
          btn.classList.toggle('active', active);
          btn.innerHTML = heartIconSVG(active);
        });
        showToast(active ? 'Added to Wishlist ♡' : 'Removed from Wishlist');
        return;
      }

      var openTarget = event.target.closest('[data-open-product]');
      if (openTarget) { ProductModal.open(openTarget.dataset.openProduct); return; }

      var addBtn = event.target.closest('[data-add-to-cart]');
      if (addBtn && !addBtn.disabled) { ProductModal.open(addBtn.dataset.addToCart, 'cart'); return; }

      var buyBtn = event.target.closest('[data-buy-now]');
      if (buyBtn && !buyBtn.disabled) { ProductModal.open(buyBtn.dataset.buyNow, 'buynow'); return; }
    });
  }

  /* ---------- 9. Router ---------- */
  var Router = (function () {
    var views = { home: null, gallery: null, comingSoon: null };

    function parseHash() {
      var raw = window.location.hash.replace(/^#/, '') || 'home';
      var parts = raw.split('?');
      var route = parts[0] || 'home';
      var params = {};
      if (parts[1]) {
        parts[1].split('&').forEach(function (pair) {
          var kv = pair.split('=');
          if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
        });
      }
      return { route: route, params: params };
    }

    function setActiveNav(route) {
      document.querySelectorAll('[data-nav-link]').forEach(function (link) {
        link.classList.toggle('active', link.dataset.navLink === route);
      });
    }

    function showView(name) {
      views.home.hidden = name !== 'home';
      views.gallery.hidden = name !== 'gallery';
      views.comingSoon.hidden = name !== 'comingSoon';
    }

    function handle() {
      var parsed = parseHash();
      var route = parsed.route;

      closeAllPanels();

      if (route === 'about' || route === 'contact') {
        showView('home');
        setActiveNav(route);
        window.setTimeout(function () {
          var el = document.getElementById(route);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 30);
        return;
      }

      if (route === 'kids') {
        showView('gallery');
        setActiveNav('kids');
        Gallery.renderKids(parsed.params.filter);
        window.scrollTo(0, 0);
        return;
      }

      if (route === 'all') {
        showView('gallery');
        setActiveNav('all');
        Gallery.renderAll();
        window.scrollTo(0, 0);
        return;
      }

      if (route === 'new-arrivals') {
        showView('gallery');
        setActiveNav('new-arrivals');
        Gallery.renderNewArrivals();
        window.scrollTo(0, 0);
        return;
      }

      if (route === 'family') {
        showView('comingSoon');
        setActiveNav('family');
        ComingSoon.render('family');
        window.scrollTo(0, 0);
        return;
      }

      if (route === 'couples') {
        showView('comingSoon');
        setActiveNav('couples');
        ComingSoon.render('couples');
        window.scrollTo(0, 0);
        return;
      }

      // default: home
      showView('home');
      setActiveNav('home');
      window.scrollTo(0, 0);
    }

    function navigate(hash) { window.location.hash = hash; }

    function init() {
      views.home = document.getElementById('viewHome');
      views.gallery = document.getElementById('viewGallery');
      views.comingSoon = document.getElementById('viewComingSoon');
      window.addEventListener('hashchange', handle);
      handle();
    }

    return { init: init, navigate: navigate };
  })();

  /* ---------- 10. Gallery view (Kids Wear / View All / New Arrivals) ---------- */
  var Gallery = (function () {
    var currentFilter = 'all';
    var currentMode = 'kids';

    function titleEl() { return document.getElementById('galleryTitle'); }
    function subtitleEl() { return document.getElementById('gallerySubtitle'); }
    function filtersEl() { return document.getElementById('galleryFilters'); }
    function gridEl() { return document.getElementById('galleryGrid'); }
    function emptyEl() { return document.getElementById('galleryEmpty'); }

    function renderKids(initialFilter) {
      currentMode = 'kids';
      currentFilter = initialFilter && SUBCATEGORY_ORDER.indexOf(initialFilter) !== -1 ? initialFilter : 'all';
      titleEl().textContent = 'Kids Wear';
      subtitleEl().textContent = 'Comfort-first styles for every little moment.';

      var kidsProducts = PRODUCTS.filter(function (p) { return p.category === 'kids'; });
      var availableSubs = SUBCATEGORY_ORDER.filter(function (sub) {
        return kidsProducts.some(function (p) { return p.subcategory === sub; });
      });

      var chips = ['<button type="button" class="gallery-filter-chip' + (currentFilter === 'all' ? ' active' : '') + '" data-filter="all">All</button>']
        .concat(availableSubs.map(function (sub) {
          return '<button type="button" class="gallery-filter-chip' + (currentFilter === sub ? ' active' : '') + '" data-filter="' + sub + '">' + SUBCATEGORY_LABELS[sub] + '</button>';
        }));
      filtersEl().innerHTML = chips.join('');
      filtersEl().hidden = false;

      renderList(currentFilter === 'all' ? kidsProducts : kidsProducts.filter(function (p) { return p.subcategory === currentFilter; }));
    }

    function renderAll() {
      currentMode = 'all';
      titleEl().textContent = 'All Products';
      subtitleEl().textContent = 'Everything from You & Me, in one place.';
      filtersEl().hidden = true;
      renderList(PRODUCTS.slice());
    }

    function renderNewArrivals() {
      currentMode = 'new-arrivals';
      titleEl().textContent = 'New Arrivals';
      subtitleEl().textContent = 'Fresh styles, just landed.';
      filtersEl().hidden = true;
      renderList(PRODUCTS.filter(function (p) { return p.newArrival; }));
    }

    function renderList(products) {
      var grid = gridEl();
      var empty = emptyEl();
      if (products.length === 0) {
        grid.innerHTML = '';
        empty.hidden = false;
      } else {
        empty.hidden = true;
        renderProductGrid(grid, products);
      }
    }

    function onFilterClick(event) {
      var chip = event.target.closest('[data-filter]');
      if (!chip || currentMode !== 'kids') return;
      currentFilter = chip.dataset.filter;
      filtersEl().querySelectorAll('.gallery-filter-chip').forEach(function (c) {
        c.classList.toggle('active', c === chip);
      });
      var kidsProducts = PRODUCTS.filter(function (p) { return p.category === 'kids'; });
      renderList(currentFilter === 'all' ? kidsProducts : kidsProducts.filter(function (p) { return p.subcategory === currentFilter; }));
    }

    function init() {
      var back = document.getElementById('galleryBack');
      if (back) back.addEventListener('click', function () { Router.navigate('home'); });
      var filters = filtersEl();
      if (filters) filters.addEventListener('click', onFilterClick);
    }

    return { renderKids: renderKids, renderAll: renderAll, renderNewArrivals: renderNewArrivals, init: init };
  })();

  /* ---------- 11. Coming Soon view (Family Wear / Couple Sets) ---------- */
  var ComingSoon = (function () {
    var COPY = {
      family: { title: 'Family Wear', message: 'Matching styles for the whole family are on the way.', backLabel: 'Back to Kids Wear' },
      couples: { title: 'Couple Sets', message: 'Something special for two is coming soon.', backLabel: 'Continue Shopping Kids Wear' }
    };

    function render(kind) {
      var copy = COPY[kind] || COPY.family;
      document.getElementById('comingSoonTitle').textContent = copy.title + ' — Coming Soon ♡';
      document.getElementById('comingSoonMessage').textContent = copy.message;
      document.getElementById('comingSoonBack').textContent = copy.backLabel;
      document.getElementById('notifyFeedback').textContent = '';
      var emailInput = document.getElementById('notifyEmail');
      if (emailInput) emailInput.value = '';
    }

    function init() {
      var backBtn = document.getElementById('comingSoonBack');
      if (backBtn) backBtn.addEventListener('click', function () { Router.navigate('kids'); });

      var form = document.getElementById('notifyForm');
      if (form) form.addEventListener('submit', function (event) {
        event.preventDefault();
        var input = document.getElementById('notifyEmail');
        var email = input ? input.value.trim() : '';
        var feedback = document.getElementById('notifyFeedback');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          if (feedback) { feedback.textContent = 'Please enter a valid email address.'; feedback.style.color = '#C5677A'; }
          return;
        }
        try {
          var raw = window.localStorage.getItem('youandme_notify');
          var list = raw ? JSON.parse(raw) : [];
          list.push({ email: email, route: window.location.hash.replace('#', ''), at: new Date().toISOString() });
          window.localStorage.setItem('youandme_notify', JSON.stringify(list));
        } catch (e) { /* storage unavailable */ }
        if (feedback) { feedback.textContent = "You're on the list! We'll email you the moment this launches."; feedback.style.color = ''; }
        form.reset();
      });
    }

    return { render: render, init: init };
  })();

  /* ---------- 12. Product detail modal ---------- */
  var ProductModal = (function () {
    var state = { product: null, size: null, color: null, qty: 1, galleryIndex: 0, sizeGuideOpen: false };

    function panel() { return document.getElementById('productModal'); }
    function body() { return document.getElementById('productModalBody'); }

    function open(productId, intent) {
      var product = findProduct(productId);
      if (!product) return;
      state.product = product;
      state.size = null;
      state.color = null;
      state.qty = 1;
      state.galleryIndex = 0;
      state.sizeGuideOpen = false;
      state.pendingIntent = intent || null;
      render();
      openPanel(panel());
    }

    function close() { closePanel(panel()); }

    function render() {
      var p = state.product;
      if (!p || !body()) return;
      var discount = discountPercent(p);
      var stock = stockInfo(p.stock);
      var wishActive = WishlistService.has(p.id);

      var thumbs = p.images.map(function (url, i) {
        return '<button type="button" data-thumb="' + i + '" class="' + (i === state.galleryIndex ? 'active' : '') + '">' +
          productImageHtml(url) + '</button>';
      }).join('');

      var sizeBtns = p.sizes.map(function (s) {
        return '<button type="button" class="pm-size-btn' + (state.size === s ? ' selected' : '') + '" data-size="' + escapeHtml(s) + '">' + escapeHtml(s) + '</button>';
      }).join('');

      var colorBtns = p.colors.map(function (c) {
        return '<button type="button" class="pm-color-btn' + (state.color === c.name ? ' selected' : '') + '" data-color="' + escapeHtml(c.name) + '" aria-label="' + escapeHtml(c.name) + '">' +
          '<span class="swatch" style="background:' + c.hex + '"></span></button>';
      }).join('');

      var sizeGuideHtml = state.sizeGuideOpen ? (
        '<table class="pm-size-guide-table"><thead><tr><th>Size</th><th>Age / Fit</th><th>Chest (in)</th></tr></thead><tbody>' +
        p.sizes.map(function (s, i) {
          return '<tr><td>' + escapeHtml(s) + '</td><td>' + (i === 0 ? 'Smallest' : i === p.sizes.length - 1 ? 'Largest' : 'Mid-range') + '</td><td>' + (14 + i * 2) + '&ndash;' + (16 + i * 2) + '</td></tr>';
        }).join('') + '</tbody></table>'
      ) : '';

      body().innerHTML =
        '<div class="pm-gallery-main">' +
          productImageHtml(p.images[state.galleryIndex]) +
          '<button type="button" class="wishlist-btn' + (wishActive ? ' active' : '') + '" style="position:absolute;top:14px;right:14px;" aria-label="Toggle wishlist" data-wishlist="' + p.id + '">' + heartIconSVG(wishActive) + '</button>' +
        '</div>' +
        '<div class="pm-gallery-thumbs">' + thumbs + '</div>' +
        '<h2 class="pm-name" id="productModalTitle">' + escapeHtml(p.name) + '</h2>' +
        '<div class="pm-price-row">' +
          '<span class="pm-price">' + formatPrice(p.price) + '</span>' +
          (p.oldPrice ? '<span class="product-old-price">' + formatPrice(p.oldPrice) + '</span>' : '') +
          (discount > 0 ? '<span class="product-discount">' + discount + '% OFF</span>' : '') +
        '</div>' +
        '<div class="pm-stock ' + stock.cls + '">' + stock.label + '</div>' +
        '<p class="pm-desc">' + escapeHtml(p.description) + '</p>' +
        '<p class="pm-fabric"><strong>Fabric:</strong> ' + escapeHtml(p.fabric) + '</p>' +
        '<div class="pm-option-block">' +
          '<div class="pm-option-label"><span>Size</span><button type="button" class="pm-size-guide-link" id="pmSizeGuideToggle">' + (state.sizeGuideOpen ? 'Hide size guide' : 'Size guide') + '</button></div>' +
          '<div class="pm-size-options">' + sizeBtns + '</div>' + sizeGuideHtml +
        '</div>' +
        '<div class="pm-option-block">' +
          '<div class="pm-option-label"><span>Color</span></div>' +
          '<div class="pm-color-options">' + colorBtns + '</div>' +
        '</div>' +
        '<div class="pm-qty-row">' +
          '<span class="pm-option-label" style="margin:0;">Quantity</span>' +
          '<div class="qty-stepper">' +
            '<button type="button" data-qty="-1" aria-label="Decrease quantity">&minus;</button>' +
            '<span id="pmQtyValue">' + state.qty + '</span>' +
            '<button type="button" data-qty="1" aria-label="Increase quantity">+</button>' +
          '</div>' +
        '</div>' +
        '<p class="pm-selection-error" id="pmSelectionError"></p>' +
        '<div class="pm-actions">' +
          '<button type="button" class="btn btn-outline" id="pmAddToCart"' + (p.stock <= 0 ? ' disabled' : '') + '>Add to Cart</button>' +
          '<button type="button" class="btn btn-primary" id="pmBuyNow"' + (p.stock <= 0 ? ' disabled' : '') + '>Buy Now</button>' +
        '</div>' +
        '<p class="pm-stock-note">Final availability will be confirmed by our team on WhatsApp.</p>' +
        '<div class="pm-sticky-actions">' +
          '<button type="button" class="btn btn-outline" id="pmAddToCartSticky"' + (p.stock <= 0 ? ' disabled' : '') + '>Add to Cart</button>' +
          '<button type="button" class="btn btn-primary" id="pmBuyNowSticky"' + (p.stock <= 0 ? ' disabled' : '') + '>Buy Now</button>' +
        '</div>';
    }

    function showError(msg) {
      var el = document.getElementById('pmSelectionError');
      if (el) el.textContent = msg;
    }

    function validate() {
      if (!state.size) { showError('Please select a size to continue.'); return false; }
      if (!state.color) { showError('Please select a color to continue.'); return false; }
      showError('');
      return true;
    }

    function doAddToCart(thenBuyNow) {
      if (!validate()) return;
      CartService.addItem(state.product.id, state.size, state.color, state.qty);
      if (thenBuyNow) {
        close();
        window.setTimeout(function () { Checkout.open(); }, 320);
      } else {
        showToast(state.product.name + ' added to cart');
        close();
      }
    }

    function onBodyClick(event) {
      if (event.target.closest('[data-wishlist]')) return; // handled by global delegated listener

      var thumb = event.target.closest('[data-thumb]');
      if (thumb) { state.galleryIndex = Number(thumb.dataset.thumb); render(); return; }

      var sizeBtn = event.target.closest('[data-size]');
      if (sizeBtn) { state.size = sizeBtn.dataset.size; render(); return; }

      var colorBtn = event.target.closest('[data-color]');
      if (colorBtn) { state.color = colorBtn.dataset.color; render(); return; }

      var qtyBtn = event.target.closest('[data-qty]');
      if (qtyBtn) {
        state.qty = Math.max(1, state.qty + Number(qtyBtn.dataset.qty));
        var qtyEl = document.getElementById('pmQtyValue');
        if (qtyEl) qtyEl.textContent = state.qty;
        return;
      }

      if (event.target.id === 'pmSizeGuideToggle') { state.sizeGuideOpen = !state.sizeGuideOpen; render(); return; }
      if (event.target.id === 'pmAddToCart' || event.target.id === 'pmAddToCartSticky') { doAddToCart(false); return; }
      if (event.target.id === 'pmBuyNow' || event.target.id === 'pmBuyNowSticky') { doAddToCart(true); return; }
    }

    function init() {
      var b = body();
      if (b) b.addEventListener('click', onBodyClick);
    }

    return { open: open, close: close, init: init };
  })();

  /* ---------- 13. Cart drawer ---------- */
  var CartDrawer = (function () {
    function panel() { return document.getElementById('cartDrawer'); }
    function bodyEl() { return document.getElementById('cartDrawerBody'); }
    function footerEl() { return document.getElementById('cartDrawerFooter'); }

    function open() { render(); openPanel(panel()); }
    function close() { closePanel(panel()); }

    function render() {
      var items = CartService.getItems();
      var b = bodyEl();
      var f = footerEl();
      if (!b || !f) return;

      if (items.length === 0) {
        b.innerHTML =
          '<div class="cart-empty">' +
            '<svg viewBox="0 0 24 24" width="40" height="40"><path d="M6 8h12l-1 12H7L6 8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 8a3 3 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>' +
            '<p>Your cart is empty.</p>' +
          '</div>';
        f.innerHTML = '<button type="button" class="btn btn-primary btn-block" id="cartContinueShopping">Continue Shopping</button>';
        return;
      }

      b.innerHTML = items.map(function (item) {
        return (
          '<div class="cart-item" data-line-id="' + item.lineId + '">' +
            '<div class="cart-item-img">' + productImageHtml(item.img) + '</div>' +
            '<div>' +
              '<div class="cart-item-name">' + escapeHtml(item.name) + '</div>' +
              '<div class="cart-item-meta">Size: ' + escapeHtml(item.size) + ' &middot; Color: ' + escapeHtml(item.color) + '</div>' +
              '<div class="cart-item-price">' + formatPrice(item.price * item.qty) + '</div>' +
            '</div>' +
            '<div class="cart-item-controls">' +
              '<button type="button" class="cart-item-remove" data-remove="' + item.lineId + '">Remove</button>' +
              '<div class="qty-stepper">' +
                '<button type="button" data-cart-qty="-1" data-line="' + item.lineId + '" aria-label="Decrease quantity">&minus;</button>' +
                '<span>' + item.qty + '</span>' +
                '<button type="button" data-cart-qty="1" data-line="' + item.lineId + '" aria-label="Increase quantity">+</button>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      var totals = CartService.getTotals();
      f.innerHTML =
        '<div class="cart-totals-row"><span>Subtotal</span><span>' + formatPrice(totals.subtotal) + '</span></div>' +
        '<div class="cart-totals-row"><span>Delivery</span><span>' + (totals.shipping === 0 ? 'Free' : formatPrice(totals.shipping)) + '</span></div>' +
        (totals.discount > 0 ? '<div class="cart-totals-row"><span>Discount</span><span>&minus;' + formatPrice(totals.discount) + '</span></div>' : '') +
        '<div class="cart-totals-row grand"><span>Grand Total</span><span>' + formatPrice(totals.total) + '</span></div>' +
        '<div class="cart-footer-actions">' +
          '<button type="button" class="btn btn-primary btn-block" id="cartCheckoutBtn">Checkout</button>' +
          '<button type="button" class="link-btn" id="cartContinueShopping2">Continue Shopping</button>' +
          '<button type="button" class="link-btn" id="cartClearBtn">Clear Cart</button>' +
        '</div>';
    }

    function onClick(event) {
      var qtyBtn = event.target.closest('[data-cart-qty]');
      if (qtyBtn) {
        var line = qtyBtn.dataset.line;
        var current = CartService.getItems().filter(function (it) { return it.lineId === line; })[0];
        if (current) CartService.updateQty(line, current.qty + Number(qtyBtn.dataset.cartQty));
        render();
        return;
      }
      var removeBtn = event.target.closest('[data-remove]');
      if (removeBtn) { CartService.removeItem(removeBtn.dataset.remove); render(); return; }

      if (event.target.id === 'cartContinueShopping' || event.target.id === 'cartContinueShopping2') { close(); return; }
      if (event.target.id === 'cartClearBtn') { CartService.clear(); render(); return; }
      if (event.target.id === 'cartCheckoutBtn') {
        if (CartService.getItems().length === 0) return;
        close();
        window.setTimeout(function () { Checkout.open(); }, 320);
      }
    }

    function init() {
      [bodyEl(), footerEl()].forEach(function (el) { if (el) el.addEventListener('click', onClick); });
    }

    return { open: open, close: close, render: render, init: init };
  })();

  /* ---------- 14. Wishlist drawer ---------- */
  var WishlistDrawer = (function () {
    function panel() { return document.getElementById('wishlistDrawer'); }
    function headingEl() { return document.querySelector('#wishlistDrawer .cart-drawer-header h2'); }
    function bodyEl() { return document.getElementById('wishlistDrawerBody'); }

    function open() { render(); openPanel(panel()); }
    function close() { closePanel(panel()); }

    function render() {
      var b = bodyEl();
      if (!b) return;
      if (headingEl()) headingEl().textContent = 'Your Wishlist ♡';
      var products = WishlistService.getIds().map(findProduct).filter(Boolean);
      if (products.length === 0) {
        b.innerHTML =
          '<div class="cart-empty">' + heartIconSVG(false).replace('width="15" height="15"', 'width="40" height="40"') +
          '<p>Your wishlist is waiting for something lovely ♡</p>' +
          '<button type="button" class="btn btn-primary" id="wishlistExploreBtn" style="margin-top:14px;">Explore Kids Wear</button></div>';
        var exploreBtn = document.getElementById('wishlistExploreBtn');
        if (exploreBtn) exploreBtn.addEventListener('click', function () { close(); Router.navigate('kids'); });
        return;
      }
      b.innerHTML = '<div class="product-grid" style="grid-template-columns:repeat(2,1fr);gap:14px;">' + products.map(renderProductCard).join('') + '</div>';
    }

    WishlistService.onChange(function () { if (panel() && !panel().hidden) render(); });

    function init() {
      var btn = document.getElementById('wishlistBtn');
      if (btn) btn.addEventListener('click', open);
    }

    return { open: open, close: close, render: render, init: init };
  })();

  /* ---------- 15. Search overlay ---------- */
  var SearchOverlay = (function () {
    function panel() { return document.getElementById('searchOverlay'); }
    function input() { return document.getElementById('searchInput'); }
    function body() { return document.getElementById('searchOverlayBody'); }

    function open() {
      openPanel(panel());
      window.setTimeout(function () { if (input()) input().focus(); }, 100);
    }
    function close() { closePanel(panel()); }

    function matches(product, query) {
      var haystack = [product.name, product.category, product.subcategory, product.description]
        .concat(product.tags || [])
        .concat(product.colors.map(function (c) { return c.name; }))
        .join(' ')
        .toLowerCase();
      return haystack.indexOf(query) !== -1;
    }

    function runSearch(query) {
      var b = body();
      query = query.trim().toLowerCase();

      if (!query) {
        b.innerHTML = '<p class="search-hint">Try &ldquo;baby&rdquo;, &ldquo;cotton&rdquo;, &ldquo;pink&rdquo; or a product name.</p>';
        return;
      }

      var results = PRODUCTS.filter(function (p) { return matches(p, query); });

      if (results.length === 0) {
        b.innerHTML = '<div class="gallery-empty"><p><strong>No products found</strong></p><p>Try another search term.</p></div>';
        return;
      }

      b.innerHTML = '<p class="search-results-count">' + results.length + ' result' + (results.length === 1 ? '' : 's') + ' for &ldquo;' + escapeHtml(query) + '&rdquo;</p>' +
        '<div class="product-grid search-results-grid">' + results.map(renderProductCard).join('') + '</div>';
    }

    function init() {
      var btn = document.getElementById('searchBtn');
      if (btn) btn.addEventListener('click', open);
      var inp = input();
      if (inp) inp.addEventListener('input', function () { runSearch(inp.value); });
    }

    return { open: open, close: close, init: init };
  })();

  /* ---------- 15b. Session service ---------- */
  // One real authentication system for the whole site — customers and admins log in through
  // the exact same Supabase Auth call. The `profiles` table decides `role`, enforced by RLS;
  // this service just reflects whatever the database says, it never invents or trusts a role itself.
  var SessionService = (function () {
    var current = null; // null = unknown/unauthenticated, else { email, name, role }

    // Every profile lookup goes through the `profiles` table (id/email/name/role), which is
    // what actually decides `role` — never trust anything the client itself claims about it.
    function loadProfile(authUser) {
      return supabaseClient.from('profiles').select('name, role').eq('id', authUser.id).single()
        .then(function (res) {
          if (res.error) throw res.error;
          return { id: authUser.id, email: authUser.email, name: res.data.name, role: res.data.role };
        });
    }

    function check() {
      return supabaseClient.auth.getSession()
        .then(function (res) {
          var session = res.data && res.data.session;
          if (!session) { current = null; return null; }
          return loadProfile(session.user).then(function (u) { current = u; return current; });
        })
        .catch(function () { current = null; return null; });
    }
    function getUser() { return current; }

    function login(email, password) {
      return supabaseClient.auth.signInWithPassword({ email: email, password: password })
        .then(function (res) {
          if (res.error) return { ok: false, data: { error: res.error.message } };
          return loadProfile(res.data.user).then(function (u) { current = u; return { ok: true, data: { user: u } }; });
        });
    }

    function register(name, email, password) {
      return supabaseClient.auth.signUp({ email: email, password: password, options: { data: { name: name } } })
        .then(function (res) {
          if (res.error) return { ok: false, data: { error: res.error.message } };
          if (!res.data.session) {
            // Email confirmation is required before a session exists — nothing to log in with yet.
            return { ok: false, data: { error: 'Check your email to confirm your account, then log in.' } };
          }
          return loadProfile(res.data.user).then(function (u) { current = u; return { ok: true, data: { user: u } }; });
        });
    }

    function logout() {
      return supabaseClient.auth.signOut().then(function () { current = null; });
    }

    // Full-page redirect to Google, then back to `redirectTo` with the session already parsed
    // into localStorage by the Supabase SDK (detectSessionInUrl, on by default) before this
    // page's own scripts run again — SessionService.check() picks it up like any other session.
    // Requires the Google provider to actually be enabled in the Supabase dashboard first; see
    // supabase/README-google-oauth.md for that one-time setup (a Supabase/Google Cloud
    // Console step, not something this code can do on its own).
    function loginWithGoogle() {
      return supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname }
      });
    }

    // Sends a real Supabase Auth reset email — resetPasswordForEmail deliberately never
    // reveals whether the address has an account (resolves the same either way), which is
    // exactly the neutral, enumeration-safe behaviour the UI relies on.
    function resetPassword(email) {
      return supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + BASE_PATH + '/reset-password'
      }).then(function (res) { if (res.error) throw res.error; return res; });
    }

    // Only ever callable with a valid password-recovery session already in place (the
    // customer arrived via the emailed link, which signs them in via a recovery token) —
    // see openResetPassword() in AccountPanel and the /reset-password handling in Init.
    function updatePassword(newPassword) {
      return supabaseClient.auth.updateUser({ password: newPassword });
    }

    return { check: check, getUser: getUser, login: login, register: register, logout: logout, loginWithGoogle: loginWithGoogle, resetPassword: resetPassword, updatePassword: updatePassword };
  })();

  /* ---------- 16. Account panel ---------- */
  // This panel is the sign-in/create-account gate — the only place any customer authenticates.
  // A logged-in customer never sees it (the header Account icon goes straight to the /account
  // dashboard instead, and this panel redirects there itself if somehow opened while signed in).
  // Turns a raw Supabase Auth error into something safe and useful to show a customer —
  // never the technical message verbatim (matches Checkout/Orders' own "never trust/never
  // expose raw provider errors to the customer" pattern used elsewhere in this file).
  function friendlyAuthError(err) {
    var msg = (err && err.message) || '';
    if (/password/i.test(msg) && /(least|short|6 char|8 char)/i.test(msg)) return 'Password is too short — use at least 8 characters.';
    if (/network|fetch/i.test(msg)) return 'Network error — please check your connection and try again.';
    if (/(expired|invalid).*(token|session|link)|token.*(expired|invalid)/i.test(msg)) return 'This link has expired. Please request a new one.';
    if (/invalid login|invalid.*credentials/i.test(msg)) return 'Incorrect email or password.';
    return 'Something went wrong. Please try again.';
  }

  // Google's own official multicolor "G" mark (the standard four-path logo from Google's
  // sign-in button guidelines) — not a single-color approximation, not an emoji.
  var GOOGLE_G_ICON =
    '<svg class="google-g-icon" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">' +
      '<path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"/>' +
      '<path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"/>' +
      '<path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2822-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.964 10.71z"/>' +
      '<path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"/>' +
    '</svg>';

  var AccountPanel = (function () {
    function panel() { return document.getElementById('accountPanel'); }
    function body() { return document.getElementById('accountPanelBody'); }
    var mode = 'login'; // login | signup | forgot | forgotSent | newPassword | newPasswordDone | resetInvalid
    var message = ''; // optional context line shown above the login/signup form, e.g. "Sign in to continue your order."
    var lastForgotEmail = '';

    function field(id, label, type) {
      return '<div class="form-field"><label for="' + id + '">' + label + '</label><input type="' + type + '" id="' + id + '"></div>';
    }

    function open(customMessage) {
      if (SessionService.getUser()) { window.location.href = BASE_PATH + '/account'; return; }
      mode = 'login';
      message = customMessage || '';
      render();
      openPanel(panel());
    }
    // Entry points for the /reset-password landing page (see the Init section) — always
    // opened directly, never via the header Account icon.
    function openResetPassword() { mode = 'newPassword'; render(); openPanel(panel()); }
    function openResetInvalid() { mode = 'resetInvalid'; render(); openPanel(panel()); }
    function close() { closePanel(panel()); }

    function render() {
      var b = body();
      if (!b) return;
      // A logged-in user should never see the login/signup form — but a password-recovery
      // session (mode 'newPassword'/'newPasswordDone') is ALSO a signed-in session, so this
      // guard only applies to the pre-login modes, not the reset-password ones.
      var user = SessionService.getUser();
      if (user && mode !== 'newPassword' && mode !== 'newPasswordDone') { window.location.href = BASE_PATH + '/account'; return; }

      if (mode === 'forgot') return renderForgot(b);
      if (mode === 'forgotSent') return renderForgotSent(b);
      if (mode === 'newPassword') return renderNewPassword(b);
      if (mode === 'newPasswordDone') return renderNewPasswordDone(b);
      if (mode === 'resetInvalid') return renderResetInvalid(b);
      renderLoginOrSignup(b);
    }

    function renderLoginOrSignup(b) {
      var heading =
        '<div class="account-welcome">' +
          '<h3>Welcome to You &amp; Me &hearts;</h3>' +
          '<p>' + escapeHtml(message || 'Sign in to continue shopping.') + '</p>' +
        '</div>';

      var googleBtn =
        '<button type="button" class="btn-google btn-block" id="googleSignInBtn">' +
          GOOGLE_G_ICON + '<span>Continue with Google</span>' +
        '</button>' +
        '<div class="account-divider"><span>or</span></div>';

      var tabs =
        '<div class="account-tabs">' +
          '<button type="button" class="account-tab' + (mode === 'login' ? ' active' : '') + '" data-mode="login">Login</button>' +
          '<button type="button" class="account-tab' + (mode === 'signup' ? ' active' : '') + '" data-mode="signup">Create Account</button>' +
        '</div>';

      var formHtml = mode === 'login'
        ? (
          '<form id="accountForm">' +
            field('accEmail', 'Email', 'email') +
            field('accPassword', 'Password', 'password') +
            '<div class="account-forgot"><button type="button" id="forgotPasswordBtn">Forgot Password?</button></div>' +
            '<button type="submit" class="btn btn-primary btn-block" style="margin-top:16px;">Sign In</button>' +
          '</form>'
        )
        : (
          '<form id="accountForm">' +
            field('accFullName', 'Full Name', 'text') +
            field('accEmail', 'Email', 'email') +
            field('accPassword2', 'Password', 'password') +
            field('accConfirmPassword', 'Confirm Password', 'password') +
            '<button type="submit" class="btn btn-primary btn-block" style="margin-top:8px;">Create Account</button>' +
          '</form>'
        );

      b.innerHTML = heading + googleBtn + tabs + formHtml + '<p class="account-submit-feedback" id="accountFeedback"></p>';

      var googleBtnEl = document.getElementById('googleSignInBtn');
      if (googleBtnEl) googleBtnEl.addEventListener('click', function () {
        googleBtnEl.disabled = true;
        SessionService.loginWithGoogle().catch(function (err) {
          googleBtnEl.disabled = false;
          var feedback = document.getElementById('accountFeedback');
          if (feedback) feedback.textContent = friendlyAuthError(err);
        });
      });

      var form = document.getElementById('accountForm');
      if (form) form.addEventListener('submit', onSubmit);

      var forgot = document.getElementById('forgotPasswordBtn');
      if (forgot) forgot.addEventListener('click', function () { mode = 'forgot'; render(); });
    }

    function renderForgot(b) {
      b.innerHTML =
        '<div class="account-welcome">' +
          '<h3>Reset your password</h3>' +
          '<p>Enter the email address linked to your You &amp; Me account. We\'ll send you a secure password reset link.</p>' +
        '</div>' +
        '<form id="forgotForm">' +
          field('forgotEmail', 'Email Address', 'email') +
          '<button type="submit" class="btn btn-primary btn-block" style="margin-top:16px;">Send Reset Link</button>' +
        '</form>' +
        '<div class="account-forgot" style="text-align:center;margin-top:14px;"><button type="button" id="backToSignInBtn">Back to Sign In</button></div>' +
        '<p class="account-submit-feedback" id="accountFeedback"></p>';

      document.getElementById('forgotForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var email = document.getElementById('forgotEmail').value.trim();
        var feedback = document.getElementById('accountFeedback');
        var submitBtn = e.target.querySelector('button[type="submit"]');
        if (!email) { feedback.textContent = 'Please enter your email address.'; return; }
        submitBtn.disabled = true;
        SessionService.resetPassword(email)
          // Supabase's resetPasswordForEmail intentionally never reveals whether the account
          // exists — treat any resolved call as success, exactly matching that neutral
          // behaviour, so this UI can't be used to enumerate registered emails either.
          .then(function () { lastForgotEmail = email; mode = 'forgotSent'; render(); })
          .catch(function (err) { submitBtn.disabled = false; feedback.textContent = friendlyAuthError(err); });
      });
      document.getElementById('backToSignInBtn').addEventListener('click', function () { mode = 'login'; render(); });
    }

    function renderForgotSent(b) {
      b.innerHTML =
        '<div class="account-welcome">' +
          '<h3>Check your inbox &hearts;</h3>' +
          '<p>We\'ve sent a password reset link to:<br><strong>' + escapeHtml(lastForgotEmail) + '</strong></p>' +
          '<p>Open the email and follow the link to create a new password.</p>' +
        '</div>' +
        '<button type="button" class="btn btn-outline btn-block" id="backToSignInBtn">Back to Sign In</button>';
      document.getElementById('backToSignInBtn').addEventListener('click', function () { mode = 'login'; render(); });
    }

    function renderNewPassword(b) {
      b.innerHTML =
        '<div class="account-welcome"><h3>Create a new password</h3></div>' +
        '<form id="newPasswordForm">' +
          field('newPassword1', 'New Password', 'password') +
          field('newPassword2', 'Confirm New Password', 'password') +
          '<button type="submit" class="btn btn-primary btn-block" style="margin-top:16px;">Update Password</button>' +
        '</form>' +
        '<p class="account-submit-feedback" id="accountFeedback"></p>';

      document.getElementById('newPasswordForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var pw1 = document.getElementById('newPassword1').value;
        var pw2 = document.getElementById('newPassword2').value;
        var feedback = document.getElementById('accountFeedback');
        var submitBtn = e.target.querySelector('button[type="submit"]');
        if (!pw1 || !pw2) { feedback.textContent = 'Please fill in both fields.'; return; }
        if (pw1.length < 8) { feedback.textContent = 'Password is too short — use at least 8 characters.'; return; }
        if (pw1 !== pw2) { feedback.textContent = 'Passwords do not match.'; return; }
        submitBtn.disabled = true;
        SessionService.updatePassword(pw1)
          .then(function (r) { if (r.error) throw r.error; mode = 'newPasswordDone'; render(); })
          .catch(function (err) { submitBtn.disabled = false; feedback.textContent = friendlyAuthError(err); });
      });
    }

    function renderNewPasswordDone(b) {
      b.innerHTML =
        '<div class="account-welcome"><h3>Password updated &hearts;</h3><p>Your password has been changed successfully.</p></div>' +
        '<button type="button" class="btn btn-primary btn-block" id="goToAccountBtn">Sign In</button>';
      // The password-recovery link already left this browser signed in with the new password —
      // no reason to make the customer type it again right away.
      document.getElementById('goToAccountBtn').addEventListener('click', function () { window.location.href = BASE_PATH + '/account'; });
    }

    function renderResetInvalid(b) {
      b.innerHTML =
        '<div class="account-welcome"><h3>This link has expired</h3><p>Password reset links are valid for a limited time. Request a new one below.</p></div>' +
        '<button type="button" class="btn btn-primary btn-block" id="requestNewResetBtn">Request New Link</button>';
      document.getElementById('requestNewResetBtn').addEventListener('click', function () { mode = 'forgot'; render(); });
    }

    function onSubmit(event) {
      event.preventDefault();
      var feedback = document.getElementById('accountFeedback');
      var submitBtn = event.target.querySelector('button[type="submit"]');
      if (feedback) feedback.textContent = '';
      if (submitBtn) submitBtn.disabled = true;

      var request = mode === 'login'
        ? SessionService.login(document.getElementById('accEmail').value.trim(), document.getElementById('accPassword').value)
        : (function () {
            var name = document.getElementById('accFullName').value.trim();
            var email = document.getElementById('accEmail').value.trim();
            var pw = document.getElementById('accPassword2').value;
            var confirm = document.getElementById('accConfirmPassword').value;
            if (!name) return Promise.resolve({ ok: false, data: { error: 'Please enter your full name.' } });
            if (pw !== confirm) return Promise.resolve({ ok: false, data: { error: 'Passwords do not match.' } });
            // Every signup lands as role='customer' — see handle_new_user() in the Supabase
            // migration. Nothing in this form (or anywhere client-side) can request 'admin'.
            return SessionService.register(name, email, pw);
          })();

      request.then(function (r) {
        if (submitBtn) submitBtn.disabled = false;
        if (!r.ok) { if (feedback) feedback.textContent = r.data.error || 'Something went wrong.'; return; }
        redirectAfterLogin(r.data.user);
      });
    }

    function redirectAfterLogin(user) {
      if (user.role === 'admin') { window.location.href = BASE_PATH + '/admin'; return; }
      // A checkout that got interrupted by this login requirement takes priority over any
      // other post-login destination — the whole point is to return the customer to it.
      if (Checkout.consumePendingFlag()) { close(); window.setTimeout(function () { Checkout.open(); }, 250); return; }
      if (window.location.pathname === BASE_PATH + '/login') { window.location.href = BASE_PATH + '/account'; return; }
      showToast('Welcome back, ' + user.name + '!');
      close();
    }

    function onTabClick(event) {
      var tab = event.target.closest('[data-mode]');
      if (!tab) return;
      mode = tab.dataset.mode;
      render();
    }

    function init() {
      var btn = document.getElementById('accountBtn');
      if (btn) btn.addEventListener('click', function () {
        // Logged in: the Account icon is a shortcut straight to the full dashboard, not this
        // small sign-in panel — matches the header icon everywhere else on the site (cart,
        // wishlist) being a launcher for its own dedicated view.
        if (SessionService.getUser()) { window.location.href = BASE_PATH + '/account'; }
        else open();
      });
      var b = body();
      if (b) b.addEventListener('click', onTabClick);
    }

    return { open: open, close: close, render: render, init: init, openResetPassword: openResetPassword, openResetInvalid: openResetInvalid };
  })();

  /* ---------- 17. Checkout ---------- */
  var Checkout = (function () {
    function panel() { return document.getElementById('checkoutModal'); }
    function body() { return document.getElementById('checkoutModalBody'); }

    var FIELDS = [
      { id: 'coFullName', label: 'Full Name', required: true },
      { id: 'coMobile', label: 'Mobile Number', required: true, type: 'tel' },
      { id: 'coEmail', label: 'Email (optional)', required: false, type: 'email' },
      { id: 'coHouse', label: 'House / Flat / Building', required: true },
      { id: 'coStreet', label: 'Street / Area', required: true },
      { id: 'coLandmark', label: 'Landmark (optional)', required: false },
      { id: 'coCity', label: 'City', required: true },
      { id: 'coDistrict', label: 'District', required: true },
      { id: 'coState', label: 'State', required: true },
      { id: 'coPin', label: 'PIN Code', required: true }
    ];

    var PENDING_KEY = 'ym_checkout_after_login';
    var savedAddresses = [];

    // The one gate every purchase path (Buy Now, Add to Cart → Checkout, cart drawer's
    // "Checkout" button) funnels through — see CONFIG-level note at the top of this file.
    // Authentication is enforced again at the database level too (create_order() rejects an
    // anonymous caller, and only 'authenticated' may even call it — see
    // supabase/migrations/0002_customer_accounts.sql), so this is a UX convenience, not the
    // actual security boundary.
    function open() {
      if (CartService.getItems().length === 0) { showToast('Your cart is empty'); return; }
      if (!SessionService.getUser()) {
        try { sessionStorage.setItem(PENDING_KEY, '1'); } catch (e) { /* ignore */ }
        AccountPanel.open('Sign in to continue your order.');
        return;
      }
      loadSavedAddresses().then(render);
      openPanel(panel());
    }
    function close() { closePanel(panel()); }

    // Called once, right after a login/signup/Google redirect resolves — consumes the flag so
    // it only ever fires once per interrupted checkout, never on a later, unrelated login.
    function consumePendingFlag() {
      try {
        if (sessionStorage.getItem(PENDING_KEY) === '1') { sessionStorage.removeItem(PENDING_KEY); return true; }
      } catch (e) { /* ignore */ }
      return false;
    }

    function loadSavedAddresses() {
      return supabaseClient.from('addresses').select('*').order('is_default', { ascending: false }).order('created_at', { ascending: false })
        .then(function (res) { savedAddresses = (res.data || []); })
        .catch(function () { savedAddresses = []; });
    }

    function render() {
      var b = body();
      if (!b) return;
      var items = CartService.getItems();
      var totals = CartService.getTotals();
      var user = SessionService.getUser();

      var rows = items.map(function (item) {
        return (
          '<tr><td><div class="order-summary-item-name">' + escapeHtml(item.name) + '</div>' +
          '<div class="order-summary-item-meta">' + escapeHtml(item.size) + ' &middot; ' + escapeHtml(item.color) + ' &middot; Qty ' + item.qty + '</div></td>' +
          '<td>' + formatPrice(item.price * item.qty) + '</td></tr>'
        );
      }).join('');

      var savedAddressPicker = savedAddresses.length === 0 ? '' :
        '<div class="form-field"><label for="coSavedAddress">Use a saved address</label>' +
          '<select id="coSavedAddress"><option value="">+ Add New Address</option>' +
          savedAddresses.map(function (a, i) {
            return '<option value="' + i + '">' + escapeHtml(a.name) + ' — ' + escapeHtml(a.line1) + ', ' + escapeHtml(a.city) + (a.is_default ? ' (Default)' : '') + '</option>';
          }).join('') + '</select></div>';

      b.innerHTML =
        '<form id="checkoutForm" novalidate>' +
          '<div class="checkout-section"><h3>Customer Information</h3>' +
            field('coFullName', 'Full Name', 'text', true) + field('coMobile', 'Mobile Number', 'tel', true) + field('coEmail', 'Email (optional)', 'email', false) +
          '</div>' +
          '<div class="checkout-section"><h3>Shipping Address</h3>' +
            savedAddressPicker +
            field('coHouse', 'House / Flat / Building', 'text', true) + field('coStreet', 'Street / Area', 'text', true) + field('coLandmark', 'Landmark (optional)', 'text', false) +
            '<div class="form-row">' + field('coCity', 'City', 'text', true) + field('coDistrict', 'District', 'text', true) + '</div>' +
            '<div class="form-row">' + field('coState', 'State', 'text', true) + field('coPin', 'PIN Code', 'text', true) + '</div>' +
          '</div>' +
          '<div class="checkout-section"><h3>Order Summary</h3>' +
            '<table class="order-summary-table">' + rows + '</table>' +
            '<div class="cart-totals-row"><span>Subtotal</span><span>' + formatPrice(totals.subtotal) + '</span></div>' +
            '<div class="cart-totals-row"><span>Delivery</span><span>' + (totals.shipping === 0 ? 'Free' : formatPrice(totals.shipping)) + '</span></div>' +
            (totals.discount > 0 ? '<div class="cart-totals-row"><span>Discount</span><span>&minus;' + formatPrice(totals.discount) + '</span></div>' : '') +
            '<div class="cart-totals-row grand"><span>Total</span><span>' + formatPrice(totals.total) + '</span></div>' +
          '</div>' +
          '<div class="checkout-section"><h3>Payment Method</h3>' +
            '<label class="payment-method-card"><input type="radio" name="paymentMethod" value="whatsapp" checked>' +
            '<span><strong>WhatsApp Order / Manual Payment</strong><p>Place your order through WhatsApp. Our team will confirm availability and send you the payment QR / payment details.</p></span></label>' +
          '</div>' +
          '<p class="checkout-stock-note">Final availability will be confirmed by our team on WhatsApp.</p>' +
          '<p class="pm-selection-error" id="checkoutSubmitError"></p>' +
          '<button type="submit" class="btn whatsapp-place-order-btn">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8 1-.2.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.2.2-.4.1-.2 0-.3 0-.4 0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2 1 2.4c.1.2 1.6 2.5 3.9 3.4.5.2.9.4 1.3.5.5.2 1 .1 1.3.1.4-.1 1.3-.5 1.4-1 .2-.5.2-.9.1-1Z"/></svg>' +
            'Place Order on WhatsApp' +
          '</button>' +
        '</form>';

      function field(id, label, type, required) {
        return '<div class="form-field"><label for="' + id + '">' + label + (required ? ' *' : '') + '</label>' +
          '<input type="' + type + '" id="' + id + '"' + (required ? ' required' : '') + '><span class="field-error" id="' + id + 'Error"></span></div>';
      }

      function applyAddress(a) {
        document.getElementById('coHouse').value = a.line1 || '';
        document.getElementById('coStreet').value = a.line2 || '';
        document.getElementById('coLandmark').value = a.landmark || '';
        document.getElementById('coCity').value = a.city || '';
        document.getElementById('coDistrict').value = a.district || '';
        document.getElementById('coState').value = a.state || '';
        document.getElementById('coPin').value = a.pincode || '';
        document.getElementById('coFullName').value = a.name || document.getElementById('coFullName').value;
        document.getElementById('coMobile').value = a.phone || document.getElementById('coMobile').value;
      }

      // Pre-fill from the account and, if there's a default saved address, from that too — the
      // customer only has to type anything at all the first time they ever check out.
      if (user) {
        document.getElementById('coFullName').value = user.name || '';
        document.getElementById('coEmail').value = user.email || '';
      }
      var savedSelect = document.getElementById('coSavedAddress');
      if (savedSelect) {
        savedSelect.addEventListener('change', function () {
          if (savedSelect.value === '') return;
          applyAddress(savedAddresses[Number(savedSelect.value)]);
        });
        if (savedAddresses.length > 0) { savedSelect.value = '0'; applyAddress(savedAddresses[0]); }
      }

      var form = document.getElementById('checkoutForm');
      if (form) form.addEventListener('submit', onSubmit);
    }

    function validateField(f) {
      var input = document.getElementById(f.id);
      var errorEl = document.getElementById(f.id + 'Error');
      if (!input) return true;
      var value = input.value.trim();
      var valid = true, message = '';
      if (f.required && !value) { valid = false; message = 'Required'; }
      else if (f.id === 'coMobile' && value && !/^[0-9+\-\s]{7,15}$/.test(value)) { valid = false; message = 'Enter a valid mobile number'; }
      else if (f.id === 'coEmail' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { valid = false; message = 'Enter a valid email'; }
      else if (f.id === 'coPin' && value && !/^[0-9]{4,8}$/.test(value)) { valid = false; message = 'Enter a valid PIN code'; }
      input.classList.toggle('invalid', !valid);
      if (errorEl) errorEl.textContent = message;
      return valid;
    }

    function collectValues() {
      var values = {};
      FIELDS.forEach(function (f) { var input = document.getElementById(f.id); values[f.id] = input ? input.value.trim() : ''; });
      return values;
    }

    function onSubmit(event) {
      event.preventDefault();
      var allValid = true;
      FIELDS.forEach(function (f) { if (!validateField(f)) allValid = false; });
      if (!allValid) {
        var firstInvalid = document.querySelector('.form-field input.invalid');
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      var values = collectValues();
      var items = CartService.getItems();

      var customer = { name: values.coFullName, phone: values.coMobile, email: values.coEmail || null };
      var address = { house: values.coHouse, street: values.coStreet, landmark: values.coLandmark || null, city: values.coCity, state: values.coState, pincode: values.coPin };
      var rpcItems = items.map(function (it) { return { productId: it.productId, size: it.size, color: it.color, quantity: it.qty }; });

      var submitBtn = document.querySelector('.whatsapp-place-order-btn');
      var errorEl = document.getElementById('checkoutSubmitError');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Placing your order…'; }
      if (errorEl) errorEl.textContent = '';

      // The order is saved to the database FIRST — WhatsApp only opens once that succeeds, so
      // the store's own records are always the source of truth, never dependent on WhatsApp.
      // create_order() is a SECURITY DEFINER Postgres function: it independently re-validates
      // stock and recomputes every price itself, ignoring anything the client sends here.
      supabaseClient.rpc('create_order', { p_customer: customer, p_address: address, p_items: rpcItems })
        .then(function (res) {
          if (res.error) throw new Error(res.error.message || 'Could not place your order. Please try again.');
          var rpcResult = res.data;
          // The function only returns id/orderNumber/totals (it doesn't echo back item names or
          // photos) — build the full shape the WhatsApp message needs from the cart + the
          // already-loaded product catalog, which is fine here since the order is already saved.
          var fullItems = items.map(function (it) {
            var product = findProduct(it.productId) || {};
            var unitPrice = product.price || 0;
            return { name: product.name || 'Item', image: (product.images || [])[0] || null, size: it.size, color: it.color, quantity: it.qty, totalPrice: unitPrice * it.qty };
          });
          var savedOrder = { id: rpcResult.id, orderNumber: rpcResult.orderNumber, items: fullItems, totals: rpcResult.totals, customer: customer, address: address };
          var whatsappUrl = OrderService.placeOrder('whatsapp', savedOrder).url;
          close();
          CartService.clear();
          window.setTimeout(function () { SuccessScreen.show(savedOrder, whatsappUrl); }, 320);
        })
        .catch(function (err) {
          if (errorEl) errorEl.textContent = err.message;
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Place Order on WhatsApp'; }
        });
    }

    function init() { /* body listeners attach in render() */ }

    return { open: open, close: close, init: init, consumePendingFlag: consumePendingFlag };
  })();

  /* ---------- 18. Order service (pluggable payment methods) ---------- */
  var OrderService = {
    methods: {
      // `order` here is built right after create_order() (a SECURITY DEFINER Postgres function)
      // already saved the order — with its real order number and server-computed prices — by the
      // time this ever runs. WhatsApp is purely the communication channel, never the source of truth.
      whatsapp: function (order) {
        var lines = [];
        lines.push('Hi You & Me 👋', '', 'I would like to place an order.', '', 'Order ID: ' + order.orderNumber, '', '🛍 ORDER DETAILS', '');
        order.items.forEach(function (item, i) {
          lines.push((i + 1) + '. ' + item.name, '', 'Size: ' + item.size, 'Color: ' + item.color, 'Quantity: ' + item.quantity, 'Price: ' + formatPrice(item.totalPrice));
          var absoluteImageUrl = toAbsolutePublicImageUrl(item.image);
          if (absoluteImageUrl) lines.push('', 'Product Photo:', absoluteImageUrl);
          lines.push('', '--------------------', '');
        });
        lines.push('Subtotal: ' + formatPrice(order.totals.subtotal));
        lines.push('Delivery: ' + (order.totals.delivery === 0 ? 'Free' : formatPrice(order.totals.delivery)));
        if (order.totals.discount > 0) lines.push('Discount: -' + formatPrice(order.totals.discount));
        lines.push('TOTAL: ' + formatPrice(order.totals.total), '', '👤 CUSTOMER', '', 'Name: ' + order.customer.name, 'Phone: ' + order.customer.phone);
        if (order.customer.email) lines.push('Email: ' + order.customer.email);
        lines.push('', '📍 DELIVERY ADDRESS', '');
        lines.push('House / Building: ' + order.address.house);
        lines.push('Area: ' + order.address.street + (order.address.landmark ? ' (near ' + order.address.landmark + ')' : ''));
        lines.push('City: ' + order.address.city, 'State: ' + order.address.state, 'PIN: ' + order.address.pincode, '');
        lines.push('The order has already been registered as #' + order.orderNumber + '.', '', 'Please confirm availability and send me the payment QR/details.', '', 'Thank you ♡');

        var message = lines.join('\n');
        var url = 'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent(message);
        window.open(url, '_blank');
        return { success: true, orderNumber: order.orderNumber, url: url };
      }
    },
    placeOrder: function (methodName, order) {
      var method = this.methods[methodName];
      if (!method) throw new Error('Unknown order method: ' + methodName);
      return method(order);
    }
  };

  /* ---------- 19. Order success screen ---------- */
  var SuccessScreen = (function () {
    function panel() { return document.getElementById('successModal'); }
    function body() { return document.getElementById('successModalBody'); }

    // `order` is what create_order() actually returned + what the cart/form held — payment is
    // never marked confirmed here, no matter what: only Admin manually marking an order Paid
    // ever changes that, and the customer's own Account → My Orders reflects it once they do.
    function show(order, whatsappUrl) {
      var b = body();
      if (b) {
        b.innerHTML =
          '<div class="success-icon">&#9825;</div><h2>Order Confirmed &hearts;</h2>' +
          '<p>Thank you for shopping with You &amp; Me.</p>' +
          '<p class="success-order-id">Order #' + escapeHtml(order.orderNumber) + '</p>' +
          '<p>Your order has been successfully registered.</p>' +
          '<p class="success-payment-status">Payment: <strong>Pending Confirmation</strong></p>' +
          '<div class="success-actions">' +
            '<a class="btn whatsapp-place-order-btn" href="' + whatsappUrl + '" target="_blank" rel="noopener">Continue on WhatsApp</a>' +
            '<button type="button" class="btn btn-outline" id="successViewOrder">View My Order</button>' +
            '<button type="button" class="btn btn-outline" id="successContinueShopping">Continue Shopping</button>' +
          '</div>';
        var continueBtn = document.getElementById('successContinueShopping');
        if (continueBtn) continueBtn.addEventListener('click', close);
        var viewBtn = document.getElementById('successViewOrder');
        if (viewBtn) viewBtn.addEventListener('click', function () {
          close();
          try { sessionStorage.setItem('ym_account_focus_order', String(order.id)); } catch (e) { /* ignore */ }
          window.location.href = BASE_PATH + '/account';
        });
      }
      openPanel(panel());
    }
    function close() { closePanel(panel()); }
    return { show: show };
  })();

  function statusLabel(s) { return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

  /* ---------- 18b. Account dashboard (/account) ---------- */
  // Every query in this module reads through the anon-key Supabase client, same as everywhere
  // else on the site — what actually limits a customer to their own orders/addresses is Row
  // Level Security (see "customer reads own" policies in
  // supabase/migrations/0002_customer_accounts.sql), not anything client-side. A customer who
  // edits the URL or forges a request still can't see or touch another customer's data.
  var AccountDashboard = (function () {
    var currentTab = 'overview';
    var ordersCache = null; // reloaded once per dashboard visit, invalidated on tab re-entry

    function content() { return document.getElementById('accountDashContent'); }

    function setActiveNav(tab) {
      document.querySelectorAll('.account-nav-item[data-tab]').forEach(function (a) {
        a.classList.toggle('active', a.dataset.tab === tab);
      });
    }

    function render(tab) {
      currentTab = tab || currentTab || 'overview';
      setActiveNav(currentTab);
      var c = content();
      if (!c) return;
      c.innerHTML = '<p class="account-dash-loading">Loading…</p>';
      if (currentTab === 'overview') renderOverview();
      else if (currentTab === 'orders') renderOrders();
      else if (currentTab === 'addresses') renderAddresses();
      else if (currentTab === 'wishlist') renderWishlist();
      else if (currentTab === 'profile') renderProfile();
    }

    function fetchOrders() {
      if (ordersCache) return Promise.resolve(ordersCache);
      return supabaseClient.from('orders').select('*, order_items(*)').order('created_at', { ascending: false })
        .then(function (res) { ordersCache = res.data || []; return ordersCache; })
        .catch(function () { ordersCache = []; return ordersCache; });
    }

    function orderThumbAndSummary(o) {
      var items = o.order_items || [];
      var thumb = items.length ? items[0].product_image : null;
      var summary = items.length === 0 ? '—' : items.length === 1
        ? items[0].product_name + ' — Size: ' + items[0].size + ', Color: ' + items[0].color + ', Qty: ' + items[0].quantity
        : items[0].product_name + ' +' + (items.length - 1) + ' more item' + (items.length - 1 === 1 ? '' : 's');
      return { thumb: thumb, summary: summary };
    }

    /* ---- Overview ---- */
    function renderOverview() {
      fetchOrders().then(function (orders) {
        var user = SessionService.getUser();
        var active = orders.filter(function (o) { return o.order_status !== 'delivered' && o.order_status !== 'cancelled'; }).length;
        var delivered = orders.filter(function (o) { return o.order_status === 'delivered'; }).length;

        content().innerHTML =
          '<h3 class="account-hello">Hello, ' + escapeHtml((user && user.name) || 'there') + ' &hearts;</h3>' +
          '<p class="account-welcome-line">Welcome back to You &amp; Me.</p>' +
          '<div class="account-stat-grid">' +
            accountStat(orders.length, 'Total Orders') +
            accountStat(active, 'Active Orders') +
            accountStat(delivered, 'Delivered Orders') +
            accountStat(WishlistService.getCount(), 'Wishlist Items') +
          '</div>' +
          '<div class="account-dash-section-head"><h3>Recent Orders</h3>' + (orders.length ? '<button type="button" class="link-btn" data-goto-tab="orders">View All</button>' : '') + '</div>' +
          (orders.length === 0 ? emptyOrdersState() : orders.slice(0, 3).map(orderCardHtml).join(''));

        bindOrderCardActions();
        var gotoBtn = content().querySelector('[data-goto-tab]');
        if (gotoBtn) gotoBtn.addEventListener('click', function () { render('orders'); });
      });
    }

    function accountStat(value, label) {
      return '<div class="account-stat-card"><div class="account-stat-value">' + value + '</div><div class="account-stat-label">' + label + '</div></div>';
    }

    /* ---- My Orders (list) ---- */
    function renderOrders() {
      fetchOrders().then(function (orders) {
        content().innerHTML =
          '<h3>My Orders</h3>' +
          (orders.length === 0 ? emptyOrdersState() : orders.map(orderCardHtml).join(''));
        bindOrderCardActions();
      });
    }

    function emptyOrdersState() {
      return '<div class="account-empty-state">' +
        '<div class="account-empty-icon">&hearts;</div>' +
        '<p><strong>No orders yet &hearts;</strong></p>' +
        '<p>When you place your first You &amp; Me order, you\'ll find it here.</p>' +
        '<button type="button" class="btn btn-primary" id="accountExploreBtn">Explore Kids Wear</button>' +
      '</div>';
    }

    function orderCardHtml(o) {
      var ts = orderThumbAndSummary(o);
      return '<div class="order-card">' +
        '<div class="order-card-thumb">' + productImageHtml(ts.thumb) + '</div>' +
        '<div class="order-card-info">' +
          '<div class="order-card-top"><strong>Order #' + escapeHtml(o.order_number) + '</strong><span class="order-card-date">' + formatDate(o.created_at) + '</span></div>' +
          '<p class="order-card-summary">' + escapeHtml(ts.summary) + '</p>' +
          '<div class="order-card-badges">' +
            '<span class="badge badge-' + o.payment_status + '">' + statusLabel(o.payment_status) + '</span>' +
            '<span class="badge badge-' + o.order_status + '">' + statusLabel(o.order_status) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="order-card-right"><div class="order-card-total">' + formatPrice(o.total) + '</div>' +
          '<button type="button" class="btn btn-sm btn-outline" data-view-order="' + o.id + '">View Order</button></div>' +
      '</div>';
    }

    function bindOrderCardActions() {
      content().querySelectorAll('[data-view-order]').forEach(function (btn) {
        btn.addEventListener('click', function () { renderOrderDetail(Number(btn.dataset.viewOrder)); });
      });
      var exploreBtn = document.getElementById('accountExploreBtn');
      if (exploreBtn) exploreBtn.addEventListener('click', function () { hideAccountDashboardView(); Router.navigate('kids'); });
    }

    /* ---- Order detail ---- */
    var TRACKING_STEPS = [
      { key: 'placed', label: 'Order Placed' },
      { key: 'paid', label: 'Payment Confirmed' },
      { key: 'confirmed', label: 'Confirmed' },
      { key: 'packing', label: 'Packed' },
      { key: 'shipped', label: 'Shipped' },
      { key: 'out_for_delivery', label: 'Out for Delivery' },
      { key: 'delivered', label: 'Delivered' }
    ];
    var ORDER_STATUS_RANK = { new: 0, confirmed: 1, packing: 2, ready_to_ship: 2, shipped: 3, out_for_delivery: 4, delivered: 5 };

    function trackingStepsDone(o) {
      var rank = ORDER_STATUS_RANK[o.order_status] != null ? ORDER_STATUS_RANK[o.order_status] : 0;
      return {
        placed: true,
        paid: o.payment_status === 'paid',
        confirmed: rank >= 1,
        packing: rank >= 2,
        shipped: rank >= 3,
        out_for_delivery: rank >= 4,
        delivered: rank >= 5
      };
    }

    // Once a real courier shipment exists (Amazon Shipping or Delhivery — any provider whose
    // shipments table row has a normalized_status), that provider's own normalized_status is
    // the source of truth for the timeline — never the generic order_status one above. Every
    // step here reflects something the provider itself reported (via its own Edge Function),
    // nothing synthesized on the customer's own browser. Every provider shares the same
    // normalized_status vocabulary (see supabase/migrations/0003_shipping_providers.sql), so
    // one rank map and one "steps done" function work for all of them — only the label for the
    // handoff-to-courier step differs per provider.
    var COURIER_TRACKING_STEPS = {
      amazon_shipping: [
        { key: 'confirmed', label: 'Order Confirmed' },
        { key: 'packed', label: 'Packed' },
        { key: 'handed', label: 'Handed to Amazon Shipping' },
        { key: 'in_transit', label: 'In Transit' },
        { key: 'out_for_delivery', label: 'Out for Delivery' },
        { key: 'delivered', label: 'Delivered' }
      ],
      delhivery: [
        { key: 'confirmed', label: 'Order Confirmed' },
        { key: 'packed', label: 'Packed' },
        { key: 'handed', label: 'Shipped' },
        { key: 'in_transit', label: 'In Transit' },
        { key: 'out_for_delivery', label: 'Out for Delivery' },
        { key: 'delivered', label: 'Delivered' }
      ]
    };
    var COURIER_STATUS_RANK = { shipment_created: 0, pickup_scheduled: 0, picked_up: 1, in_transit: 2, out_for_delivery: 3, delivered: 4 };
    function courierTrackingStepsDone(shipment) {
      var rank = COURIER_STATUS_RANK[shipment.normalized_status] != null ? COURIER_STATUS_RANK[shipment.normalized_status] : 0;
      return { confirmed: true, packed: true, handed: rank >= 1, in_transit: rank >= 2, out_for_delivery: rank >= 3, delivered: rank >= 4 };
    }

    function renderOrderDetail(id) {
      content().innerHTML = '<p class="account-dash-loading">Loading order…</p>';
      // shipment_events is fetched separately (not nested in this select) so that an older
      // database schema without it yet (migration 0003 not applied) degrades to "no tracking
      // events" instead of breaking the entire order page — see the .catch below.
      supabaseClient.from('orders').select('*, order_items(*), order_status_history(*), shipments(*)').eq('id', id).single()
        .then(function (res) {
          if (res.error || !res.data) throw new Error('Order not found.');
          var o = res.data;
          var shipment = (o.shipments || [])[0] || null;
          // Any provider with its own real tracking (Amazon Shipping, Delhivery, …) — Manual
          // Shipping and "no shipment yet" both fall back to the generic order-status timeline.
          var courierSteps = shipment && COURIER_TRACKING_STEPS[shipment.provider];
          var isCourier = !!courierSteps;
          var eventsPromise = shipment
            ? supabaseClient.from('shipment_events').select('*').eq('shipment_id', shipment.id).then(function (r) { return r.data || []; }).catch(function () { return []; })
            : Promise.resolve([]);
          return eventsPromise.then(function (events) { if (shipment) shipment.shipment_events = events; return { o: o, shipment: shipment, isCourier: isCourier, courierSteps: courierSteps }; });
        })
        .then(function (ctx) {
          var o = ctx.o, shipment = ctx.shipment, isCourier = ctx.isCourier, courierSteps = ctx.courierSteps;
          var done = o.order_status === 'cancelled' ? null : (isCourier ? courierTrackingStepsDone(shipment) : trackingStepsDone(o));

          content().innerHTML =
            '<button type="button" class="link-btn" id="orderDetailBack">&#8592; Back to My Orders</button>' +
            '<div class="order-detail-head"><h3>Order #' + escapeHtml(o.order_number) + '</h3><span class="order-detail-date">Order Placed &middot; ' + formatDate(o.created_at) + '</span></div>' +
            '<div class="panel-card"><h4>Product' + ((o.order_items || []).length > 1 ? 's' : '') + '</h4>' +
              (o.order_items || []).map(function (it) {
                return '<div class="order-detail-item">' + '<div class="order-detail-item-thumb">' + productImageHtml(it.product_image) + '</div>' +
                  '<div class="order-detail-item-info"><strong>' + escapeHtml(it.product_name) + '</strong>' +
                  '<p>Size: ' + escapeHtml(it.size) + ' &middot; Color: ' + escapeHtml(it.color) + ' &middot; Quantity: ' + it.quantity + '</p></div>' +
                  '<div class="order-detail-item-price">' + formatPrice(it.total_price) + '</div>' +
                '</div>';
              }).join('') +
            '</div>' +
            '<div class="panel-card"><h4>Delivery Address</h4>' +
              '<p>' + escapeHtml(o.customer_name) + '<br>' + escapeHtml(o.house) + ', ' + escapeHtml(o.street) + (o.landmark ? ' (near ' + escapeHtml(o.landmark) + ')' : '') +
              '<br>' + escapeHtml(o.city) + ', ' + escapeHtml(o.state) + ' — ' + escapeHtml(o.pincode) + '<br>Phone: ' + escapeHtml(o.phone) + '</p>' +
            '</div>' +
            '<div class="panel-card"><h4>Order Summary</h4>' +
              '<div class="cart-totals-row"><span>Subtotal</span><span>' + formatPrice(o.subtotal) + '</span></div>' +
              '<div class="cart-totals-row"><span>Delivery</span><span>' + (o.delivery_charge === 0 ? 'Free' : formatPrice(o.delivery_charge)) + '</span></div>' +
              (o.discount > 0 ? '<div class="cart-totals-row"><span>Discount</span><span>&minus;' + formatPrice(o.discount) + '</span></div>' : '') +
              '<div class="cart-totals-row grand"><span>Total</span><span>' + formatPrice(o.total) + '</span></div>' +
            '</div>' +
            '<div class="panel-card"><h4>Payment</h4>' +
              '<p>Method: ' + escapeHtml(o.payment_method === 'whatsapp' ? 'WhatsApp / Manual Payment' : o.payment_method) + '</p>' +
              '<p class="success-payment-status">Payment Status: <span class="badge badge-' + o.payment_status + '">' + statusLabel(o.payment_status) + '</span></p>' +
              '<p class="account-payment-note">Payment is confirmed manually by our team once received — you\'ll see this update automatically, no action needed here.</p>' +
            '</div>' +
            (o.order_status === 'cancelled'
              ? '<div class="panel-card"><h4>Order Status</h4><p><span class="badge badge-cancelled">Cancelled</span></p></div>'
              : '<div class="panel-card"><h4>Order Status</h4>' +
                  (isCourier && ['delivery_failed', 'returned', 'cancelled'].indexOf(shipment.normalized_status) !== -1
                    ? '<p><span class="badge badge-' + escapeHtml(shipment.normalized_status) + '">' + statusLabel(shipment.normalized_status) + '</span></p>'
                    : trackingTimelineHtml(done, isCourier ? courierSteps : TRACKING_STEPS)) +
                '</div>') +
            '<div class="panel-card"><h4>Shipping</h4>' + shippingSectionHtml(shipment) +
            '</div>';

          var back = document.getElementById('orderDetailBack');
          if (back) back.addEventListener('click', function () { render('orders'); });
        })
        .catch(function (err) {
          content().innerHTML = '<button type="button" class="link-btn" id="orderDetailBack">&#8592; Back to My Orders</button><p class="account-empty-state">' + escapeHtml(err.message) + '</p>';
          var back = document.getElementById('orderDetailBack');
          if (back) back.addEventListener('click', function () { render('orders'); });
        });
    }

    function trackingTimelineHtml(done, steps) {
      return '<div class="tracking-timeline">' + (steps || TRACKING_STEPS).map(function (step) {
        return '<div class="tracking-step' + (done[step.key] ? ' done' : '') + '"><span class="tracking-dot">' + (done[step.key] ? '&#10003;' : '') + '</span><span>' + step.label + '</span></div>';
      }).join('') + '</div>';
    }

    var COURIER_PROVIDER_LABELS = { amazon_shipping: 'Amazon Shipping', delhivery: 'Delhivery' };
    var PREPARING_MESSAGE = '<p>Preparing your order &hearts;</p><p class="account-payment-note">Tracking information will appear here once your order has been shipped.</p>';

    function shippingSectionHtml(shipment) {
      if (!shipment) return PREPARING_MESSAGE;

      if (COURIER_PROVIDER_LABELS[shipment.provider]) {
        if (!shipment.provider_shipment_id) {
          // A shipment attempt exists but the courier hasn't confirmed one yet (e.g. still
          // being created, or the last attempt failed) — never show a technical API error here.
          return PREPARING_MESSAGE;
        }
        return '<p>Shipping Partner: <strong>' + COURIER_PROVIDER_LABELS[shipment.provider] + '</strong></p>' +
          '<p>Tracking / AWB: <strong>' + (shipment.tracking_id ? escapeHtml(shipment.tracking_id) : 'Unavailable') + '</strong></p>' +
          '<p>Current Status: <strong><span class="badge badge-' + escapeHtml(shipment.normalized_status) + '">' + statusLabel(shipment.normalized_status) + '</span></strong></p>' +
          (shipment.estimated_delivery ? '<p>Estimated Delivery: <strong>' + formatDate(shipment.estimated_delivery) + '</strong></p>' : '') +
          (shipment.tracking_url ? '<a class="btn btn-sm btn-outline" href="' + escapeHtml(shipment.tracking_url) + '" target="_blank" rel="noopener">Track Package</a>' : '');
      }

      // Manual Shipping
      return shipment.tracking_id
        ? '<p>Courier Partner: <strong>' + escapeHtml(shipment.courier || '—') + '</strong></p>' +
          '<p>Tracking ID: <strong>' + escapeHtml(shipment.tracking_id) + '</strong></p>' +
          (shipment.estimated_delivery ? '<p>Estimated Delivery: <strong>' + formatDate(shipment.estimated_delivery) + '</strong></p>' : '') +
          (shipment.tracking_url ? '<a class="btn btn-sm btn-outline" href="' + escapeHtml(shipment.tracking_url) + '" target="_blank" rel="noopener">Track Package</a>' : '')
        : PREPARING_MESSAGE;
    }

    /* ---- Addresses ---- */
    var editingAddressId = null;
    var ADDRESS_FIELDS = ['name', 'phone', 'line1', 'line2', 'landmark', 'city', 'district', 'state', 'pincode'];

    function renderAddresses() {
      supabaseClient.from('addresses').select('*').order('is_default', { ascending: false }).order('created_at', { ascending: false })
        .then(function (res) {
          var addresses = res.data || [];
          content().innerHTML =
            '<div class="account-dash-section-head"><h3>Addresses</h3><button type="button" class="btn btn-sm btn-primary" id="addAddressBtn">+ Add Address</button></div>' +
            (addresses.length === 0
              ? '<div class="account-empty-state"><p><strong>No saved addresses yet</strong></p><p>Add one to make checkout faster next time.</p></div>'
              : addresses.map(addressCardHtml).join(''));

          document.getElementById('addAddressBtn').addEventListener('click', function () { openAddressForm(null); });
          content().querySelectorAll('[data-edit-address]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var a = addresses.find(function (x) { return String(x.id) === btn.dataset.editAddress; });
              if (a) openAddressForm(a);
            });
          });
          content().querySelectorAll('[data-delete-address]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              if (!window.confirm('Delete this address?')) return;
              supabaseClient.from('addresses').delete().eq('id', btn.dataset.deleteAddress).then(function () { renderAddresses(); });
            });
          });
          content().querySelectorAll('[data-default-address]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var uid = SessionService.getUser().id;
              supabaseClient.from('addresses').update({ is_default: false }).eq('user_id', uid)
                .then(function () { return supabaseClient.from('addresses').update({ is_default: true }).eq('id', btn.dataset.defaultAddress); })
                .then(function () { renderAddresses(); });
            });
          });
        });
    }

    function addressCardHtml(a) {
      return '<div class="address-card">' +
        '<div class="address-card-head"><strong>' + escapeHtml(a.name) + '</strong>' + (a.is_default ? '<span class="badge badge-active">Default</span>' : '') + '</div>' +
        '<p>' + escapeHtml(a.line1) + (a.line2 ? ', ' + escapeHtml(a.line2) : '') + (a.landmark ? ' (near ' + escapeHtml(a.landmark) + ')' : '') +
        '<br>' + escapeHtml(a.city) + (a.district ? ', ' + escapeHtml(a.district) : '') + ', ' + escapeHtml(a.state) + ' — ' + escapeHtml(a.pincode) +
        '<br>Phone: ' + escapeHtml(a.phone) + '</p>' +
        '<div class="address-card-actions">' +
          (a.is_default ? '' : '<button type="button" class="btn btn-sm btn-outline" data-default-address="' + a.id + '">Set Default</button>') +
          '<button type="button" class="btn btn-sm btn-outline" data-edit-address="' + a.id + '">Edit</button>' +
          '<button type="button" class="btn btn-sm btn-outline" data-delete-address="' + a.id + '">Delete</button>' +
        '</div>' +
      '</div>';
    }

    function openAddressForm(address) {
      editingAddressId = address ? address.id : null;
      var panel = document.getElementById('addressFormPanel');
      var body = document.getElementById('addressFormBody');
      document.getElementById('addressFormTitle').textContent = address ? 'Edit Address' : 'Add Address';
      body.innerHTML =
        '<form id="addressForm">' +
          field('addrName', 'Full Name', 'text') + field('addrPhone', 'Phone', 'tel') +
          field('addrLine1', 'Address Line 1', 'text') + field('addrLine2', 'Address Line 2 (optional)', 'text') +
          field('addrLandmark', 'Landmark (optional)', 'text') +
          '<div class="form-row">' + field('addrCity', 'City', 'text') + field('addrDistrict', 'District (optional)', 'text') + '</div>' +
          '<div class="form-row">' + field('addrState', 'State', 'text') + field('addrPincode', 'PIN Code', 'text') + '</div>' +
          '<div class="toggle-row" style="display:flex;align-items:center;gap:8px;margin:10px 0;"><input type="checkbox" id="addrDefault"><label for="addrDefault">Set as default address</label></div>' +
          '<p class="account-submit-feedback" id="addressFormFeedback"></p>' +
          '<button type="submit" class="btn btn-primary btn-block">' + (address ? 'Save Changes' : 'Add Address') + '</button>' +
        '</form>';

      function field(id, label, type) { return '<div class="form-field"><label for="' + id + '">' + label + '</label><input type="' + type + '" id="' + id + '"></div>'; }

      if (address) {
        document.getElementById('addrName').value = address.name || '';
        document.getElementById('addrPhone').value = address.phone || '';
        document.getElementById('addrLine1').value = address.line1 || '';
        document.getElementById('addrLine2').value = address.line2 || '';
        document.getElementById('addrLandmark').value = address.landmark || '';
        document.getElementById('addrCity').value = address.city || '';
        document.getElementById('addrDistrict').value = address.district || '';
        document.getElementById('addrState').value = address.state || '';
        document.getElementById('addrPincode').value = address.pincode || '';
        document.getElementById('addrDefault').checked = !!address.is_default;
      }

      document.getElementById('addressForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var payload = {
          user_id: SessionService.getUser().id,
          name: document.getElementById('addrName').value.trim(),
          phone: document.getElementById('addrPhone').value.trim(),
          line1: document.getElementById('addrLine1').value.trim(),
          line2: document.getElementById('addrLine2').value.trim() || null,
          landmark: document.getElementById('addrLandmark').value.trim() || null,
          city: document.getElementById('addrCity').value.trim(),
          district: document.getElementById('addrDistrict').value.trim() || null,
          state: document.getElementById('addrState').value.trim(),
          pincode: document.getElementById('addrPincode').value.trim(),
          is_default: document.getElementById('addrDefault').checked
        };
        var feedback = document.getElementById('addressFormFeedback');
        if (!payload.name || !payload.phone || !payload.line1 || !payload.city || !payload.state || !payload.pincode) {
          feedback.textContent = 'Please fill in all required fields.'; return;
        }
        var req = editingAddressId
          ? supabaseClient.from('addresses').update(payload).eq('id', editingAddressId)
          : supabaseClient.from('addresses').insert(payload);
        req.then(function (res) {
          if (res.error) { feedback.textContent = res.error.message; return; }
          closeAddressForm();
          renderAddresses();
        });
      });

      openPanel(panel);
    }
    function closeAddressForm() { closePanel(document.getElementById('addressFormPanel')); }

    /* ---- Wishlist ---- */
    function renderWishlist() {
      var products = WishlistService.getIds().map(findProduct).filter(Boolean);
      content().innerHTML = '<h3>Wishlist</h3>' +
        (products.length === 0
          ? '<div class="account-empty-state"><p><strong>Your wishlist is empty &hearts;</strong></p><p>Save products you love to find them here later.</p><button type="button" class="btn btn-primary" id="accountWishlistExplore">Explore Kids Wear</button></div>'
          : '<div class="product-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;">' + products.map(renderProductCard).join('') + '</div>');
      var exploreBtn = document.getElementById('accountWishlistExplore');
      if (exploreBtn) exploreBtn.addEventListener('click', function () { hideAccountDashboardView(); Router.navigate('kids'); });
    }
    WishlistService.onChange(function () { if (currentTab === 'wishlist' && document.getElementById('viewAccountDashboard') && !document.getElementById('viewAccountDashboard').hidden) renderWishlist(); });

    /* ---- Profile ---- */
    function renderProfile() {
      var user = SessionService.getUser();
      content().innerHTML =
        '<h3>Profile</h3>' +
        '<div class="panel-card">' +
          '<div class="form-field"><label for="profileName">Full Name</label><input type="text" id="profileName" value="' + escapeHtml(user.name || '') + '"></div>' +
          '<div class="form-field"><label>Email</label><input type="text" value="' + escapeHtml(user.email || '') + '" disabled></div>' +
          '<p class="account-submit-feedback" id="profileFeedback"></p>' +
          '<button type="button" class="btn btn-primary" id="profileSaveBtn">Save Changes</button>' +
        '</div>' +
        '<button type="button" class="btn btn-outline" id="accountDashLogoutInline">Logout</button>';

      document.getElementById('profileSaveBtn').addEventListener('click', function () {
        var name = document.getElementById('profileName').value.trim();
        var feedback = document.getElementById('profileFeedback');
        if (!name) { feedback.textContent = 'Name cannot be empty.'; return; }
        supabaseClient.from('profiles').update({ name: name }).eq('id', user.id).then(function (res) {
          if (res.error) { feedback.textContent = res.error.message; return; }
          user.name = name;
          feedback.textContent = 'Saved ✓';
        });
      });
      document.getElementById('accountDashLogoutInline').addEventListener('click', doLogout);
    }

    function doLogout() {
      SessionService.logout().then(function () { window.location.href = BASE_PATH + '/'; });
    }

    function init() {
      var nav = document.getElementById('accountSideNav');
      if (nav) nav.addEventListener('click', function (e) {
        var tabBtn = e.target.closest('[data-tab]');
        if (tabBtn) { render(tabBtn.dataset.tab); return; }
        if (e.target.id === 'accountDashLogout') doLogout();
      });
      var back = document.getElementById('accountBackHome');
      if (back) back.addEventListener('click', function (e) { e.preventDefault(); window.location.href = BASE_PATH + '/'; });
      var closeAddrBtn = document.getElementById('addressFormClose');
      if (closeAddrBtn) closeAddrBtn.addEventListener('click', closeAddressForm);
    }

    // Reset caches (fresh data) every time the dashboard view is (re-)entered.
    function enter(focusOrderId) {
      ordersCache = null;
      if (focusOrderId) { setActiveNav('orders'); currentTab = 'orders'; renderOrderDetail(focusOrderId); }
      else render('overview');
    }

    return { init: init, render: render, enter: enter };
  })();

  function showAccountDashboardView() {
    ['viewHome', 'viewGallery', 'viewComingSoon'].forEach(function (id) { var el = document.getElementById(id); if (el) el.hidden = true; });
    var dash = document.getElementById('viewAccountDashboard');
    if (dash) dash.hidden = false;
    window.scrollTo(0, 0);
  }
  function hideAccountDashboardView() {
    var dash = document.getElementById('viewAccountDashboard');
    if (dash) dash.hidden = true;
    var home = document.getElementById('viewHome');
    if (home) home.hidden = false;
  }

  /* ---------- Cart / Wishlist badges ---------- */
  function initBadgesAndButtons() {
    var cartBadge = document.getElementById('cartBadge');
    var wishlistBadge = document.getElementById('wishlistBadge');
    var cartBtn = document.getElementById('cartBtn');

    function updateCartBadge() { if (cartBadge) cartBadge.textContent = String(CartService.getCount()); }
    function updateWishlistBadge() {
      if (!wishlistBadge) return;
      var count = WishlistService.getCount();
      wishlistBadge.textContent = String(count);
      wishlistBadge.hidden = count === 0;
    }

    CartService.onChange(updateCartBadge);
    WishlistService.onChange(updateWishlistBadge);
    updateCartBadge();
    updateWishlistBadge();

    if (cartBtn) cartBtn.addEventListener('click', function () { CartDrawer.open(); });
  }

  /* ---------- 20. Chrome: mobile nav, sticky header, testimonial carousel, newsletter ---------- */
  function initMobileNav() {
    var toggle = document.getElementById('navToggle');
    var nav = document.getElementById('mainNav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function initScrollEffects() {
    var header = document.getElementById('siteHeader');
    function onScroll() {
      if (header) header.style.boxShadow = window.scrollY > 8 ? '0 4px 16px rgba(64,46,33,0.06)' : 'none';
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function initTestimonialCarousel() {
    var track = document.getElementById('testimonialTrack');
    var dotsWrap = document.getElementById('testimonialDots');
    var prevBtn = document.getElementById('testimonialPrev');
    var nextBtn = document.getElementById('testimonialNext');
    if (!track || !dotsWrap) return;

    var cards = Array.prototype.slice.call(track.children);
    var current = 0;
    function isMobile() { return window.innerWidth <= 860; }

    function renderDots() {
      dotsWrap.innerHTML = cards.map(function (_, index) {
        return '<button class="dot' + (index === current ? ' active' : '') + '" data-index="' + index + '" aria-label="Show testimonial ' + (index + 1) + '"></button>';
      }).join('');
    }

    function update() {
      if (!isMobile()) { track.style.transform = ''; return; }
      track.style.transition = 'transform 0.3s ease';
      track.style.transform = 'translateX(-' + (current * 100) + '%)';
      dotsWrap.querySelectorAll('.dot').forEach(function (dot, index) { dot.classList.toggle('active', index === current); });
    }

    function go(delta) { current = (current + delta + cards.length) % cards.length; update(); }

    renderDots();
    update();

    if (prevBtn) prevBtn.addEventListener('click', function () { go(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { go(1); });
    dotsWrap.addEventListener('click', function (event) {
      var dot = event.target.closest('[data-index]');
      if (!dot) return;
      current = Number(dot.dataset.index);
      update();
    });

    window.addEventListener('resize', update);
  }

  function bindNewsletterForm(formId, emailInputId, feedbackId) {
    var form = document.getElementById(formId);
    var feedback = document.getElementById(feedbackId);
    if (!form || !feedback) return;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var emailInput = document.getElementById(emailInputId);
      var email = emailInput ? emailInput.value.trim() : '';
      var isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!isValid) { feedback.textContent = 'Please enter a valid email address.'; feedback.style.color = '#C5677A'; return; }
      feedback.textContent = 'Thanks for subscribing! Welcome to the You & Me family.';
      feedback.style.color = '';
      form.reset();
    });
  }

  function initNewsletterForm() {
    bindNewsletterForm('newsletterForm', 'newsletterEmail', 'newsletterFeedback');
    bindNewsletterForm('footerNewsletterForm', 'footerNewsletterEmail', 'footerNewsletterFeedback');
  }

  /* ---------- Footer: logo, info modal, footer-link routing ---------- */
  var InfoModal = (function () {
    var CONTENT = {
      shipping: {
        title: 'Shipping Information',
        html: '<p>We currently ship across India. Orders are dispatched within 1&ndash;2 business days of your order being confirmed on WhatsApp, and typically arrive within 5&ndash;7 business days depending on your location.</p>' +
          '<p>Delivery charges (if any) are calculated at checkout and shown before you place your order &mdash; orders over &#8377;999 ship free.</p>'
      },
      returns: {
        title: 'Returns & Exchanges',
        html: '<p>If something isn&rsquo;t quite right, we accept exchanges within 7 days of delivery for unused items with tags intact.</p>' +
          '<p>To start a return or exchange, message us on WhatsApp with your Order ID and we&rsquo;ll take it from there.</p>'
      },
      sizeGuide: {
        title: 'Size Guide',
        html: '<p>Sizing varies slightly by style &mdash; each product&rsquo;s own size guide (in the product details) is the most accurate for that item. As a general guide:</p>' +
          '<table class="pm-size-guide-table"><thead><tr><th>Age</th><th>Approx. Height (cm)</th><th>Chest (in)</th></tr></thead><tbody>' +
          '<tr><td>0&ndash;12M</td><td>50&ndash;75</td><td>14&ndash;18</td></tr>' +
          '<tr><td>1&ndash;3Y</td><td>75&ndash;95</td><td>18&ndash;20</td></tr>' +
          '<tr><td>3&ndash;5Y</td><td>95&ndash;110</td><td>20&ndash;22</td></tr>' +
          '<tr><td>5&ndash;7Y</td><td>110&ndash;125</td><td>22&ndash;24</td></tr>' +
          '</tbody></table>'
      },
      faq: {
        title: 'Frequently Asked Questions',
        html: '<h3>How do I place an order?</h3><p>Add items to your cart, go to checkout, fill in your details, and tap &ldquo;Place Order on WhatsApp&rdquo; &mdash; it opens WhatsApp with everything filled in for you.</p>' +
          '<h3>Do you accept online payment?</h3><p>Not yet &mdash; our team shares payment details/QR directly on WhatsApp once your order is confirmed.</p>' +
          '<h3>Can I change my size after ordering?</h3><p>Yes, just let us know on WhatsApp before the order ships.</p>'
      },
      orderHelp: {
        title: 'Order Help',
        html: '<p>Every order on this site is confirmed manually over WhatsApp &mdash; after checkout, you&rsquo;ll get a ready-made message to send us with your order details.</p>' +
          '<p>Our team replies to confirm availability and share payment details. If you need help with an existing order, just message us on WhatsApp with your Order ID.</p>'
      },
      privacy: {
        title: 'Privacy Policy',
        html: '<p>We collect only the details you give us at checkout &mdash; your name, phone number, email (optional) and delivery address &mdash; solely to fulfil your order via WhatsApp. We don&rsquo;t sell or share your information with third parties.</p>' +
          '<p>Your cart and wishlist are stored locally in your own browser, not on a server.</p>' +
          '<p class="info-disclaimer">This is placeholder policy text for the current version of the site &mdash; replace with your finalized policy before launch.</p>'
      },
      terms: {
        title: 'Terms & Conditions',
        html: '<p>Orders placed through this site are requests for purchase, confirmed manually by our team over WhatsApp &mdash; availability and final pricing are confirmed at that stage, not guaranteed at checkout.</p>' +
          '<p>Product colors may vary slightly from what you see on screen. By placing an order you agree to be contacted on WhatsApp regarding that order.</p>' +
          '<p class="info-disclaimer">This is placeholder terms text for the current version of the site &mdash; replace with your finalized terms before launch.</p>'
      }
    };

    function panel() { return document.getElementById('infoModal'); }

    function open(key) {
      var entry = CONTENT[key];
      if (!entry) return;
      document.getElementById('infoModalTitle').textContent = entry.title;
      document.getElementById('infoModalBody').innerHTML = entry.html;
      openPanel(panel());
    }

    function init() {
      document.body.addEventListener('click', function (event) {
        var trigger = event.target.closest('[data-info]');
        if (trigger) open(trigger.dataset.info);
      });
    }

    return { open: open, init: init };
  })();

  function initFooter() {
    // Reuse the exact official logo already embedded in the navbar rather than duplicating the base64 asset.
    var navLogo = document.querySelector('.navbar-brand-logo');
    var footerLogo = document.getElementById('footerLogo');
    if (navLogo && footerLogo) footerLogo.src = navLogo.src;
  }

  /* ---------- 21. Init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    // Chrome that doesn't depend on product data can wire up immediately.
    initGlobalGridEvents();
    initPanelChrome();
    ProductModal.init();
    CartDrawer.init();
    WishlistDrawer.init();
    SearchOverlay.init();
    AccountPanel.init();
    AccountDashboard.init();
    Checkout.init();
    Gallery.init();
    ComingSoon.init();
    InfoModal.init();
    initFooter();
    initBadgesAndButtons();
    initMobileNav();
    initScrollEffects();
    initTestimonialCarousel();
    initNewsletterForm();

    var grid = document.getElementById('productGrid');
    if (grid) grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--color-text-soft);padding:40px 0;">Loading products…</p>';

    // Everything that reads PRODUCTS (featured grid, and the router — Kids Wear / View All /
    // New Arrivals / Search all filter the same live array) waits for the store API first.
    loadProducts().then(function () {
      renderProductGrid(grid, PRODUCTS.filter(function (p) { return p.featured; }));
      Router.init();

      // /login and /account are real, bookmarkable URLs (this same index.html serves both,
      // via the GitHub Pages 404.html SPA fallback) — on load, check the session once and
      // open the right view. An admin who lands on either is sent straight to /admin. This
      // runs strictly after Router.init() above (not in parallel with it) because the
      // router's own initial-route handling closes every open panel — opening the account
      // panel first and letting the router run after would just have it slammed shut again.
      SessionService.check().then(function (user) {
        var path = window.location.pathname;
        var loginPath = BASE_PATH + '/login', accountPath = BASE_PATH + '/account', resetPasswordPath = BASE_PATH + '/reset-password';

        // A Supabase password-recovery link lands here with its token already exchanged for a
        // session by SessionService.check() above (detectSessionInUrl parses it from the URL on
        // load) — if that produced a user, let them set a new password; otherwise the link was
        // invalid or had already expired. Checked before the checkout-resume/account/login
        // branches below since a recovery session is a real session and would otherwise match
        // the "logged in" paths meant for normal browsing.
        if (path === resetPasswordPath) {
          if (user) AccountPanel.openResetPassword(); else AccountPanel.openResetInvalid();
          return;
        }

        // A checkout interrupted by the login requirement resumes here — this is also how
        // Google Sign-In finishes: it's a full-page redirect away and back, so this is the
        // very first moment (after that reload) a signed-in customer can be detected at all.
        if (user && user.role !== 'admin' && Checkout.consumePendingFlag()) {
          if (path === loginPath || path === accountPath) window.history.replaceState(null, '', BASE_PATH + '/');
          Checkout.open();
          return;
        }

        if (path === accountPath) {
          if (user && user.role === 'admin') { window.location.href = BASE_PATH + '/admin'; return; }
          if (!user) { window.location.href = loginPath; return; }
          showAccountDashboardView();
          var focusOrderId = null;
          try { focusOrderId = sessionStorage.getItem('ym_account_focus_order'); sessionStorage.removeItem('ym_account_focus_order'); } catch (e) { /* ignore */ }
          AccountDashboard.enter(focusOrderId ? Number(focusOrderId) : null);
          return;
        }
        if (path === loginPath) {
          if (user && user.role === 'admin') { window.location.href = BASE_PATH + '/admin'; return; }
          if (user) { window.location.href = accountPath; return; }
          AccountPanel.open();
        }
      });
    });
  });
})();
