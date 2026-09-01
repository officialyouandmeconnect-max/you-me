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

  // BUG FIX: toLocaleDateString('en-IN', ...) without an explicit timeZone renders in the
  // VIEWER's own system/browser timezone — 'en-IN' only affects date formatting conventions, not
  // the actual timezone. Pinned to Asia/Kolkata explicitly, once, so a courier event near
  // midnight IST never shows the wrong calendar day to a customer whose device is set elsewhere.
  function formatDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Date + time (e.g. "29 Aug, 1:48 pm") for real per-stage timeline timestamps — same
  // Asia/Kolkata pin as formatDate, applied once here.
  function formatDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
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

  // Shared eye/eye-off line icons + password field markup — used by every password input on the
  // site (login, signup, confirm, reset, confirm-new). Toggling only flips type
  // password<->text; the value itself is never touched.
  function eyeIconSVG(open) {
    return open
      ? '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 3l18 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10.6 5.2A11.4 11.4 0 0 1 12 5c7 0 11 8 11 8a17.6 17.6 0 0 1-3.4 4.4M7.4 6.7C4.4 8.4 1 12 1 12s4 8 11 8c1.5 0 2.9-.3 4.1-.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  }
  function passwordFieldHtml(id, label) {
    return '<div class="form-field password-field"><label for="' + id + '">' + label + '</label>' +
      '<div class="password-input-wrap">' +
        '<input type="password" id="' + id + '">' +
        '<button type="button" class="password-toggle-btn" data-toggle-pw="' + id + '" aria-label="Show password" aria-pressed="false">' + eyeIconSVG(true) + '</button>' +
      '</div></div>';
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
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-toggle-pw]');
      if (!btn) return;
      var input = document.getElementById(btn.dataset.togglePw);
      if (!input) return;
      var shown = input.type === 'text';
      input.type = shown ? 'password' : 'text';
      btn.innerHTML = eyeIconSVG(shown);
      btn.setAttribute('aria-label', shown ? 'Show password' : 'Hide password');
      btn.setAttribute('aria-pressed', String(!shown));
    });
    ['productModalClose', 'cartDrawerClose', 'checkoutModalClose', 'successModalClose', 'searchOverlayClose', 'wishlistDrawerClose', 'accountPanelClose', 'infoModalClose', 'addressPickerClose', 'confirmModalClose', 'shopFilterSheetClose', 'shopSortSheetClose', 'locationSheetClose'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', closeTopPanel);
    });
  }

  /* ---------- 8. Shared product-card renderer + grid event delegation ---------- */
  // Redesigned (Phase 2 shop upgrade): the image is the focus — no permanent full-width Add to
  // Cart / Buy Now pair on every card anymore (data-add-to-cart already just opens the product
  // modal pre-set to the cart intent, same as before — clicking Quick Add here still goes
  // through the exact same size/color validation there, nothing about that changed). Only a
  // low-stock/out-of-stock note is shown — "In Stock" on every single card was just noise.
  function renderProductCard(product) {
    var discount = discountPercent(product);
    var stock = stockInfo(product.stock);
    var oldPriceHtml = product.oldPrice ? '<span class="product-old-price">' + formatPrice(product.oldPrice) + '</span>' : '';
    var discountHtml = discount > 0 ? '<span class="product-discount">' + discount + '% OFF</span>' : '';
    var colorDots = product.colors.slice(0, 5).map(function (c) { return '<span class="product-color-dot" style="background:' + c.hex + '" title="' + escapeHtml(c.name) + '"></span>'; }).join('');
    var wishActive = WishlistService.has(product.id);

    return (
      '<article class="product-card" data-id="' + product.id + '">' +
        '<div class="product-img" data-open-product="' + product.id + '">' +
          productImageHtml(product.images[0]) +
          '<button class="wishlist-btn' + (wishActive ? ' active' : '') + '" type="button" aria-label="Toggle wishlist for ' + escapeHtml(product.name) + '" data-wishlist="' + product.id + '">' +
            heartIconSVG(wishActive) +
          '</button>' +
          '<button class="product-quick-add" type="button" aria-label="Add ' + escapeHtml(product.name) + ' to cart" data-add-to-cart="' + product.id + '"' + (product.stock <= 0 ? ' disabled' : '') + '>' +
            '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>' +
          '</button>' +
        '</div>' +
        '<h3 data-open-product="' + product.id + '">' + escapeHtml(product.name) + '</h3>' +
        '<div class="product-price-row">' +
          '<span class="product-price">' + formatPrice(product.price) + '</span>' + oldPriceHtml + discountHtml +
        '</div>' +
        (product.colors.length ? '<div class="product-chip-row">' + colorDots + '</div>' : '') +
        (stock.cls !== 'in-stock' ? '<div class="product-stock ' + stock.cls + '">' + stock.label + '</div>' : '') +
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

  /* ---------- 10. Gallery / Shop view (Kids Wear / View All / New Arrivals) ----------
     Phase 2 shop upgrade: sidebar (desktop) + Filter/Sort bottom sheets (mobile) + quick chips
     + sort + result count + Load More. Every filter option is computed from the real product
     data actually in the current mode's pool — a facet with zero real values never renders, and
     nothing here is ever a hardcoded/fake option list. */
  var Gallery = (function () {
    var GENDER_LABELS = { boys: 'Boys', girls: 'Girls', unisex: 'Unisex' };
    var SORT_OPTIONS = [
      { value: 'recommended', label: 'Recommended' },
      { value: 'new', label: 'New Arrivals' },
      { value: 'price-asc', label: 'Price: Low to High' },
      { value: 'price-desc', label: 'Price: High to Low' },
      { value: 'discount', label: 'Discount' }
    ];
    var PAGE_SIZE = 12;

    var mode = 'kids';        // kids | all | new-arrivals
    var pool = [];             // the mode's base product set, before filters
    var quickChipKey = null;   // subcategory (kids) | category (all) | null (new-arrivals)
    var filters = {};          // { gender, ageGroup, color, minPrice, maxPrice, inStockOnly, discountOnly, quickChip }
    var sort = 'recommended';
    var visibleCount = PAGE_SIZE;

    function resetFilters() {
      filters = { gender: null, ageGroup: null, color: null, minPrice: null, maxPrice: null, inStockOnly: false, discountOnly: false, quickChip: 'all' };
      sort = 'recommended';
      visibleCount = PAGE_SIZE;
    }

    function titleEl() { return document.getElementById('galleryTitle'); }
    function subtitleEl() { return document.getElementById('gallerySubtitle'); }
    function quickChipsEl() { return document.getElementById('shopQuickChips'); }
    function gridEl() { return document.getElementById('galleryGrid'); }
    function emptyEl() { return document.getElementById('galleryEmpty'); }
    function sidebarEl() { return document.getElementById('shopSidebar'); }
    function resultCountEl() { return document.getElementById('shopResultCount'); }
    function loadMoreBtn() { return document.getElementById('shopLoadMoreBtn'); }

    /* ---- facet computation (only ever from real data actually present in `pool`) ---- */
    function distinctValues(list, key) {
      var seen = {}, out = [];
      list.forEach(function (p) { var v = p[key]; if (v && !seen[v]) { seen[v] = true; out.push(v); } });
      return out;
    }
    function distinctColors(list) {
      var seen = {}, out = [];
      list.forEach(function (p) { (p.colors || []).forEach(function (c) { if (!seen[c.name]) { seen[c.name] = true; out.push(c); } }); });
      return out;
    }
    function priceRange(list) {
      if (!list.length) return { min: 0, max: 0 };
      var prices = list.map(function (p) { return p.price; });
      return { min: Math.min.apply(null, prices), max: Math.max.apply(null, prices) };
    }

    /* ---- applying filters + sort to the pool ---- */
    function applyFilters(list) {
      return list.filter(function (p) {
        if (quickChipKey && filters.quickChip && filters.quickChip !== 'all' && p[quickChipKey] !== filters.quickChip) return false;
        if (filters.gender && p.gender !== filters.gender) return false;
        if (filters.ageGroup && p.ageGroup !== filters.ageGroup) return false;
        if (filters.color && !(p.colors || []).some(function (c) { return c.name === filters.color; })) return false;
        if (filters.minPrice != null && p.price < filters.minPrice) return false;
        if (filters.maxPrice != null && p.price > filters.maxPrice) return false;
        if (filters.inStockOnly && p.stock <= 0) return false;
        if (filters.discountOnly && discountPercent(p) <= 0) return false;
        return true;
      });
    }
    function applySort(list) {
      var sorted = list.slice();
      if (sort === 'price-asc') sorted.sort(function (a, b) { return a.price - b.price; });
      else if (sort === 'price-desc') sorted.sort(function (a, b) { return b.price - a.price; });
      else if (sort === 'discount') sorted.sort(function (a, b) { return discountPercent(b) - discountPercent(a); });
      else if (sort === 'new') sorted.sort(function (a, b) { return (b.newArrival ? 1 : 0) - (a.newArrival ? 1 : 0) || b.id - a.id; });
      else sorted.sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || a.id - b.id; }); // Recommended — no fake "popularity", just featured-first then catalog order
      return sorted;
    }
    function activeFilterCount() {
      var n = 0;
      if (filters.gender) n++;
      if (filters.ageGroup) n++;
      if (filters.color) n++;
      if (filters.minPrice != null || filters.maxPrice != null) n++;
      if (filters.inStockOnly) n++;
      if (filters.discountOnly) n++;
      return n;
    }

    /* ---- rendering ---- */
    function render() {
      var filtered = applySort(applyFilters(pool));
      var grid = gridEl(), empty = emptyEl();

      resultCountEl().textContent = filtered.length + (filtered.length === 1 ? ' Product' : ' Products');
      var filterCountBadge = document.getElementById('shopFilterCount');
      var n = activeFilterCount();
      if (filterCountBadge) { filterCountBadge.hidden = n === 0; filterCountBadge.textContent = String(n); }
      var sortLabelEl = document.getElementById('shopSortLabel');
      if (sortLabelEl) sortLabelEl.textContent = sort === 'recommended' ? 'Sort' : (SORT_OPTIONS.filter(function (o) { return o.value === sort; })[0] || {}).label || 'Sort';

      if (filtered.length === 0) {
        grid.innerHTML = '';
        empty.hidden = false;
        loadMoreBtn().hidden = true;
      } else {
        empty.hidden = true;
        var slice = filtered.slice(0, visibleCount);
        renderProductGrid(grid, slice);
        var lm = loadMoreBtn();
        lm.hidden = filtered.length <= visibleCount;
      }

      renderQuickChips();
      renderSidebar();
    }

    function renderQuickChips() {
      var el = quickChipsEl();
      if (!quickChipKey) { el.hidden = true; return; }
      var values = quickChipKey === 'subcategory'
        ? SUBCATEGORY_ORDER.filter(function (sub) { return pool.some(function (p) { return p.subcategory === sub; }); })
        : distinctValues(pool, quickChipKey);
      if (values.length < 2) { el.hidden = true; return; } // a single real option isn't a useful chip row
      var labelFor = function (v) { return quickChipKey === 'subcategory' ? (SUBCATEGORY_LABELS[v] || v) : (v.charAt(0).toUpperCase() + v.slice(1)); };
      el.innerHTML = ['<button type="button" class="gallery-filter-chip' + (filters.quickChip === 'all' ? ' active' : '') + '" data-chip="all">All</button>']
        .concat(values.map(function (v) {
          return '<button type="button" class="gallery-filter-chip' + (filters.quickChip === v ? ' active' : '') + '" data-chip="' + escapeHtml(v) + '">' + escapeHtml(labelFor(v)) + '</button>';
        })).join('');
      el.hidden = false;
    }

    /* ---- filter form (shared markup for the desktop sidebar AND the mobile sheet) ---- */
    function filterFormHtml() {
      var genders = distinctValues(pool, 'gender');
      var ages = distinctValues(pool, 'ageGroup');
      var colors = distinctColors(pool);
      var range = priceRange(pool);
      var anyDiscount = pool.some(function (p) { return discountPercent(p) > 0; });
      var html = '';

      if (genders.length > 1) {
        html += '<div class="shop-filter-group"><h4>Gender</h4>' + genders.map(function (g) {
          return '<label class="shop-filter-option"><input type="radio" name="shopGender" value="' + g + '"' + (filters.gender === g ? ' checked' : '') + '><span>' + (GENDER_LABELS[g] || g) + '</span></label>';
        }).join('') + '<label class="shop-filter-option"><input type="radio" name="shopGender" value=""' + (!filters.gender ? ' checked' : '') + '><span>Any</span></label></div>';
      }
      if (ages.length > 1) {
        html += '<div class="shop-filter-group"><h4>Age</h4>' + ages.map(function (a) {
          return '<label class="shop-filter-option"><input type="radio" name="shopAge" value="' + escapeHtml(a) + '"' + (filters.ageGroup === a ? ' checked' : '') + '><span>' + escapeHtml(a) + '</span></label>';
        }).join('') + '<label class="shop-filter-option"><input type="radio" name="shopAge" value=""' + (!filters.ageGroup ? ' checked' : '') + '><span>Any</span></label></div>';
      }
      if (range.max > range.min) {
        html += '<div class="shop-filter-group"><h4>Price</h4><div class="shop-price-inputs">' +
          '<input type="number" id="shopMinPrice" placeholder="₹' + range.min + '" value="' + (filters.minPrice != null ? filters.minPrice : '') + '" min="' + range.min + '" max="' + range.max + '">' +
          '<span>to</span>' +
          '<input type="number" id="shopMaxPrice" placeholder="₹' + range.max + '" value="' + (filters.maxPrice != null ? filters.maxPrice : '') + '" min="' + range.min + '" max="' + range.max + '">' +
          '</div></div>';
      }
      if (colors.length > 1) {
        html += '<div class="shop-filter-group"><h4>Color</h4><div class="shop-color-options">' + colors.map(function (c) {
          return '<button type="button" class="shop-color-swatch' + (filters.color === c.name ? ' active' : '') + '" data-color="' + escapeHtml(c.name) + '" style="background:' + c.hex + '" title="' + escapeHtml(c.name) + '" aria-label="' + escapeHtml(c.name) + '"></button>';
        }).join('') + '</div></div>';
      }
      html += '<div class="shop-filter-group"><h4>Availability</h4>' +
        '<label class="shop-filter-option"><input type="checkbox" id="shopInStockOnly"' + (filters.inStockOnly ? ' checked' : '') + '><span>In Stock Only</span></label></div>';
      if (anyDiscount) {
        html += '<div class="shop-filter-group"><h4>Discount</h4>' +
          '<label class="shop-filter-option"><input type="checkbox" id="shopDiscountOnly"' + (filters.discountOnly ? ' checked' : '') + '><span>On Sale</span></label></div>';
      }
      return html || '<p class="shop-filter-empty">No filters available for this view yet.</p>';
    }

    function bindFilterFormEvents(root, onChange) {
      root.querySelectorAll('input[name="shopGender"]').forEach(function (r) { r.addEventListener('change', function () { filters.gender = r.value || null; onChange(); }); });
      root.querySelectorAll('input[name="shopAge"]').forEach(function (r) { r.addEventListener('change', function () { filters.ageGroup = r.value || null; onChange(); }); });
      root.querySelectorAll('[data-color]').forEach(function (btn) {
        btn.addEventListener('click', function () { filters.color = filters.color === btn.dataset.color ? null : btn.dataset.color; onChange(); });
      });
      var minEl = root.querySelector('#shopMinPrice'), maxEl = root.querySelector('#shopMaxPrice');
      if (minEl) minEl.addEventListener('change', function () { filters.minPrice = minEl.value ? Number(minEl.value) : null; onChange(); });
      if (maxEl) maxEl.addEventListener('change', function () { filters.maxPrice = maxEl.value ? Number(maxEl.value) : null; onChange(); });
      var inStockEl = root.querySelector('#shopInStockOnly');
      if (inStockEl) inStockEl.addEventListener('change', function () { filters.inStockOnly = inStockEl.checked; onChange(); });
      var discountEl = root.querySelector('#shopDiscountOnly');
      if (discountEl) discountEl.addEventListener('change', function () { filters.discountOnly = discountEl.checked; onChange(); });
    }

    function renderSidebar() {
      var el = sidebarEl();
      if (!el) return;
      el.innerHTML = '<div class="shop-sidebar-head"><h3>Filters</h3>' +
        (activeFilterCount() > 0 ? '<button type="button" class="link-btn" id="shopSidebarClear">Clear All</button>' : '') +
        '</div>' + filterFormHtml();
      bindFilterFormEvents(el, function () { visibleCount = PAGE_SIZE; render(); });
      var clearBtn = document.getElementById('shopSidebarClear');
      if (clearBtn) clearBtn.addEventListener('click', function () { resetFilters(); render(); });
    }

    /* ---- mobile Filter / Sort bottom sheets ---- */
    function openFilterSheet() {
      document.getElementById('shopFilterSheetBody').innerHTML = filterFormHtml();
      bindFilterFormEvents(document.getElementById('shopFilterSheetBody'), function () { /* apply live, "Show Results" just closes */ render(); refreshFilterSheetBody(); });
      openPanel(document.getElementById('shopFilterSheet'));
    }
    function refreshFilterSheetBody() {
      var body = document.getElementById('shopFilterSheetBody');
      if (!body || document.getElementById('shopFilterSheet').hidden) return;
      body.innerHTML = filterFormHtml();
      bindFilterFormEvents(body, function () { render(); refreshFilterSheetBody(); });
    }
    function openSortSheet() {
      document.getElementById('shopSortSheetBody').innerHTML = SORT_OPTIONS.map(function (o) {
        return '<label class="shop-filter-option shop-sort-option"><input type="radio" name="shopSort" value="' + o.value + '"' + (sort === o.value ? ' checked' : '') + '><span>' + o.label + '</span></label>';
      }).join('');
      document.querySelectorAll('input[name="shopSort"]').forEach(function (r) {
        r.addEventListener('change', function () { sort = r.value; visibleCount = PAGE_SIZE; render(); closePanel(document.getElementById('shopSortSheet')); });
      });
      openPanel(document.getElementById('shopSortSheet'));
    }

    function renderKids(initialFilter) {
      mode = 'kids';
      pool = PRODUCTS.filter(function (p) { return p.category === 'kids'; });
      quickChipKey = 'subcategory';
      resetFilters();
      if (initialFilter && SUBCATEGORY_ORDER.indexOf(initialFilter) !== -1) filters.quickChip = initialFilter;
      titleEl().textContent = 'Kids Wear';
      subtitleEl().textContent = 'Comfort-first styles for every little moment.';
      render();
    }

    function renderAll() {
      mode = 'all';
      pool = PRODUCTS.slice();
      quickChipKey = 'category';
      resetFilters();
      titleEl().textContent = 'All Products';
      subtitleEl().textContent = 'Everything from You & Me, in one place.';
      render();
    }

    function renderNewArrivals() {
      mode = 'new-arrivals';
      pool = PRODUCTS.filter(function (p) { return p.newArrival; });
      quickChipKey = null;
      resetFilters();
      titleEl().textContent = 'New Arrivals';
      subtitleEl().textContent = 'Fresh styles, just landed.';
      render();
    }

    function onQuickChipClick(event) {
      var chip = event.target.closest('[data-chip]');
      if (!chip) return;
      filters.quickChip = chip.dataset.chip;
      visibleCount = PAGE_SIZE;
      render();
    }

    function init() {
      var back = document.getElementById('galleryBack');
      if (back) back.addEventListener('click', function () { Router.navigate('home'); });
      var chips = quickChipsEl();
      if (chips) chips.addEventListener('click', onQuickChipClick);

      var lm = loadMoreBtn();
      if (lm) lm.addEventListener('click', function () { visibleCount += PAGE_SIZE; render(); });

      var emptyClear = document.getElementById('galleryEmptyClear');
      if (emptyClear) emptyClear.addEventListener('click', function () { resetFilters(); render(); });

      var filterBtn = document.getElementById('shopFilterBtn');
      if (filterBtn) filterBtn.addEventListener('click', openFilterSheet);
      var sortBtn = document.getElementById('shopSortBtn');
      if (sortBtn) sortBtn.addEventListener('click', openSortSheet);
      var filterClearBtn = document.getElementById('shopFilterClearBtn');
      if (filterClearBtn) filterClearBtn.addEventListener('click', function () { resetFilters(); render(); refreshFilterSheetBody(); });
      var filterApplyBtn = document.getElementById('shopFilterApplyBtn');
      if (filterApplyBtn) filterApplyBtn.addEventListener('click', function () { closePanel(document.getElementById('shopFilterSheet')); });
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
        '</div>' +
        '<div class="pm-delivery-block">' + deliveryBlockHtml() + '</div>';
    }

    // Real-only delivery check for this product page — reads the SAME DeliveryLocation state
    // the header "Deliver to" control uses (one source of truth site-wide), and can also check
    // a fresh PIN inline without leaving the product modal. Never fabricates an ETA/locality.
    function deliveryBlockHtml() {
      var loc = DeliveryLocation.get();
      if (loc && loc.pincode) {
        var statusHtml = loc.checked === false
          ? '<p class="location-result location-result-error">' + escapeHtml(loc.error || "We couldn't check delivery availability right now.") + '</p>'
          : loc.serviceable
            ? '<p class="location-result location-result-ok">✓ Delivery available' + (loc.etaDays != null ? ' — usually ' + loc.etaDays + ' day' + (loc.etaDays === 1 ? '' : 's') : '') + '</p>'
            : '<p class="location-result location-result-bad">Currently unavailable at this pincode.</p>';
        return '<h4>Delivery</h4>' +
          '<div class="pm-delivery-row"><span>Delivering to ' + escapeHtml(loc.pincode) + '</span><button type="button" class="link-btn" id="pmDeliveryChange">Change</button></div>' +
          statusHtml;
      }
      return '<h4>Delivery</h4>' +
        '<div class="location-pin-row">' +
          '<input type="text" inputmode="numeric" maxlength="6" placeholder="Enter PIN code" id="pmDeliveryPinInput">' +
          '<button type="button" class="btn btn-outline btn-sm" id="pmDeliveryCheckBtn">Check</button>' +
        '</div>' +
        '<p class="location-result" id="pmDeliveryResult"></p>';
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

      if (event.target.id === 'pmDeliveryChange') { DeliveryLocation.open(); return; }
      if (event.target.id === 'pmDeliveryCheckBtn') {
        var pinInput = document.getElementById('pmDeliveryPinInput');
        var resultEl = document.getElementById('pmDeliveryResult');
        var pincode = (pinInput.value || '').trim();
        if (!/^[1-9][0-9]{5}$/.test(pincode)) { resultEl.className = 'location-result location-result-error'; resultEl.textContent = 'Enter a valid 6-digit PIN code.'; return; }
        event.target.disabled = true;
        DeliveryLocation.selectPincode(pincode, null).then(function () {
          if (state.product) render(); // re-render now shows the checked state via deliveryBlockHtml()
        });
        return;
      }
    }

    function init() {
      var b = body();
      if (b) b.addEventListener('click', onBodyClick);
      // Keeps the modal's own Delivery block in sync if the customer changes their location via
      // the header control while a product is open — same shared state, never a second source of truth.
      DeliveryLocation.onChange(function () { if (state.product && !panel().hidden) render(); });
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
    // Doesn't say "wrong password" specifically — a Google-only account has no password at
    // all, so a plain "incorrect password" would be misleading. Points at the real fix (Google,
    // or set one via Forgot Password) without confirming/denying whether the email has an
    // account at all.
    if (/invalid login|invalid.*credentials/i.test(msg)) return 'We couldn’t sign you in with that email and password. If you created your account with Google, use "Continue with Google" — or set a password with "Forgot Password?".';
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
            passwordFieldHtml('accPassword', 'Password') +
            '<p class="account-google-hint">Signed up with Google? Use "Continue with Google" above.</p>' +
            '<div class="account-forgot"><button type="button" id="forgotPasswordBtn">Forgot Password?</button></div>' +
            '<button type="submit" class="btn btn-primary btn-block" style="margin-top:16px;">Sign In</button>' +
          '</form>'
        )
        : (
          '<form id="accountForm">' +
            field('accFullName', 'Full Name', 'text') +
            field('accEmail', 'Email', 'email') +
            passwordFieldHtml('accPassword2', 'Password') +
            passwordFieldHtml('accConfirmPassword', 'Confirm Password') +
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
          passwordFieldHtml('newPassword1', 'New Password') +
          passwordFieldHtml('newPassword2', 'Confirm New Password') +
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
    // Set once create_order() succeeds for the CURRENT checkout session, cleared on open() —
    // a retry after a failed/cancelled Cashfree attempt (the checkout panel stays open on
    // failure now — see onSubmit below) must reuse this SAME internal order, never call
    // create_order() a second time, or it would create a duplicate order and decrement stock
    // twice for one purchase.
    var pendingOrderId = null;

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
      pendingOrderId = null;
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

      // Branded trigger — opens #addressPickerSheet (a bottom sheet on mobile, centered modal on
      // desktop; same .panel infra as every other overlay on this site). Never a native <select>.
      var selectedAddressIdx = savedAddresses.length ? 0 : -1;
      var savedAddressPicker = savedAddresses.length === 0 ? '' :
        '<div class="form-field"><label>Saved address</label>' +
          '<button type="button" class="address-picker-trigger" id="coAddressPickerBtn">' +
            '<span id="coAddressPickerBtnText">Choose a saved address</span>' +
            '<svg viewBox="0 0 24 24" width="18" height="18"><polyline points="9 6 15 12 9 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</button>' +
        '</div>';

      b.innerHTML =
        '<form id="checkoutForm" novalidate>' +
          '<div class="checkout-section"><h3>Personal Information</h3>' +
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
          '<div class="checkout-section"><h3>Payment</h3>' +
            '<label class="payment-method-card">' +
              '<svg viewBox="0 0 24 24" width="20" height="20" style="margin-top:2px;"><rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><line x1="2" y1="10" x2="22" y2="10" stroke="currentColor" stroke-width="2"/></svg>' +
              '<span><strong>Secure Payment via Cashfree</strong><p>UPI, Google Pay, PhonePe, Cards, NetBanking and more — pay securely, verified automatically.</p></span>' +
            '</label>' +
          '</div>' +
          '<p class="checkout-stock-note">Your order is saved the moment you tap Pay — final delivery details are confirmed automatically once payment succeeds.</p>' +
          '<p class="pm-selection-error" id="checkoutSubmitError"></p>' +
          '<button type="submit" class="btn" id="checkoutPayBtn">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke="#fff" stroke-width="2"/><line x1="2" y1="10" x2="22" y2="10" stroke="#fff" stroke-width="2"/></svg>' +
            'Pay Securely with Cashfree' +
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
      var pickerBtn = document.getElementById('coAddressPickerBtn');
      if (pickerBtn) {
        pickerBtn.addEventListener('click', openAddressPicker);
        if (selectedAddressIdx >= 0) { applyAddress(savedAddresses[selectedAddressIdx]); updatePickerTriggerLabel(); }
      }

      function updatePickerTriggerLabel() {
        var el = document.getElementById('coAddressPickerBtnText');
        if (!el) return;
        el.textContent = selectedAddressIdx >= 0 ? (savedAddresses[selectedAddressIdx].label || 'Home') + ' — ' + savedAddresses[selectedAddressIdx].city : 'Add a new address';
      }

      function addressLineHtml(a) {
        return escapeHtml(a.line1) + (a.line2 ? ', ' + escapeHtml(a.line2) : '') + (a.landmark ? ' (near ' + escapeHtml(a.landmark) + ')' : '') +
          '<br>' + escapeHtml(a.city) + (a.district ? ', ' + escapeHtml(a.district) : '') + ', ' + escapeHtml(a.state) + ' — ' + escapeHtml(a.pincode);
      }

      function openAddressPicker() {
        var body = document.getElementById('addressPickerBody');
        body.innerHTML =
          '<label class="address-picker-option">' +
            '<input type="radio" name="addrPick" value="new"' + (selectedAddressIdx === -1 ? ' checked' : '') + '>' +
            '<span class="address-picker-option-body"><strong>+ Add New Address</strong></span>' +
          '</label>' +
          savedAddresses.map(function (a, i) {
            return '<label class="address-picker-option">' +
              '<input type="radio" name="addrPick" value="' + i + '"' + (i === selectedAddressIdx ? ' checked' : '') + '>' +
              '<span class="address-picker-option-body">' +
                '<span class="address-picker-option-head"><strong>' + escapeHtml(a.label || 'Home') + '</strong>' + (a.is_default ? '<span class="badge badge-active">Default</span>' : '') + '</span>' +
                '<span class="address-picker-option-lines">' + addressLineHtml(a) + '</span>' +
              '</span>' +
            '</label>';
          }).join('');
        body.querySelectorAll('input[name="addrPick"]').forEach(function (radio) {
          radio.addEventListener('change', function () {
            selectedAddressIdx = radio.value === 'new' ? -1 : Number(radio.value);
            if (selectedAddressIdx >= 0) applyAddress(savedAddresses[selectedAddressIdx]);
            else clearAddressFields();
            updatePickerTriggerLabel();
            closePanel(document.getElementById('addressPickerSheet'));
          });
        });
        openPanel(document.getElementById('addressPickerSheet'));
        var firstRadio = body.querySelector('input[name="addrPick"]:checked') || body.querySelector('input[name="addrPick"]');
        if (firstRadio) firstRadio.focus();
      }

      function clearAddressFields() {
        ['coHouse', 'coStreet', 'coLandmark', 'coCity', 'coDistrict', 'coState', 'coPin'].forEach(function (id) {
          var el = document.getElementById(id); if (el) el.value = '';
        });
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

      var submitBtn = document.getElementById('checkoutPayBtn');
      var errorEl = document.getElementById('checkoutSubmitError');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Checking delivery…'; }
      if (errorEl) errorEl.textContent = '';

      // Checkout re-check (never trusts a stale browsing-time PIN): re-run serviceability
      // against the ACTUAL shipping PIN just entered/confirmed on this form. Only a definitive
      // "not serviceable" blocks the order — if the check itself fails (provider API down), we
      // don't punish the customer for our own infra hiccup; Admin still has a second,
      // authoritative serviceability gate before actually creating a shipment.
      DeliveryLocation.checkPincode(address.pincode).then(function (deliveryCheck) {
        if (deliveryCheck.status === 'ok' && deliveryCheck.serviceable === false) {
          if (errorEl) errorEl.textContent = 'Delivery is currently unavailable to PIN code ' + address.pincode + '. Please use a different address.';
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Pay Securely with Cashfree'; }
          return;
        }
        proceedWithOrder();
      }).catch(function () { proceedWithOrder(); }); // network hiccup on the check itself — don't block checkout over it

      function proceedWithOrder() {
      if (submitBtn) submitBtn.textContent = 'Placing your order…';
      // BUG FIX: this used to close the checkout panel and clear the cart BEFORE knowing
      // whether starting the Cashfree session even succeeded — any failure in
      // cashfree-create-order, or in the checkout() call itself, then had nowhere visible to
      // show up: the panel was already gone. Now the panel stays open (and the cart un-cleared)
      // until PaymentFlow.startCheckout actually hands off to Cashfree — see its
      // onSessionReady callback below, which is the one moment that's safe to close.
      //
      // create_order() is still the one place stock is decremented and prices are
      // recomputed server-side — unchanged. If it already succeeded once for this checkout
      // session (a previous Cashfree attempt failed/was cancelled), reuse that SAME internal
      // order instead of creating a second one and decrementing stock twice.
      var orderPromise = pendingOrderId
        ? Promise.resolve({ id: pendingOrderId })
        : supabaseClient.rpc('create_order', { p_customer: customer, p_address: address, p_items: rpcItems })
            .then(function (res) {
              if (res.error) throw new Error(res.error.message || 'Could not place your order. Please try again.');
              pendingOrderId = res.data.id;
              return res.data;
            });

      orderPromise
        .then(function (rpcResult) {
          if (submitBtn) submitBtn.textContent = 'Starting secure payment…';
          return PaymentFlow.startCheckout(rpcResult.id, function onSessionReady() {
            close();
            CartService.clear();
          });
        })
        .catch(function (err) {
          if (errorEl) errorEl.textContent = err.message;
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Pay Securely with Cashfree'; }
        });
      }
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

  // Real Cashfree sub-method (upi/card/netbanking/app/...) -> friendly label. Falls back to the
  // raw value for anything not explicitly listed, never invented.
  var CASHFREE_METHOD_LABELS = { upi: 'UPI', card: 'Card', netbanking: 'Net Banking', app: 'Wallet / App', paylater: 'Pay Later', emi: 'EMI' };
  function paymentMethodLabel(paymentMethod, cashfreeSubMethod) {
    if (paymentMethod === 'cashfree') return 'Cashfree' + (cashfreeSubMethod ? ' — ' + (CASHFREE_METHOD_LABELS[cashfreeSubMethod] || statusLabel(cashfreeSubMethod)) : ' (Online Payment)');
    if (paymentMethod === 'whatsapp') return 'WhatsApp / Manual Payment';
    return statusLabel(paymentMethod || '');
  }

  /* ---------- 18a. Cashfree payment flow ---------- */
  // Calls a cashfree-* Supabase Edge Function as the signed-in customer. Same auth workaround
  // and same auto-recover-then-redirect pattern as the admin panel's callEdgeFunction (see
  // admin.js) — this project's edge gateway 502s any request carrying a genuine Supabase JWT
  // in a header, so the real access token travels base64-encoded as x-user-token-b64 instead
  // (decoded server-side by requireUser() in supabase/functions/_shared/shipping.ts).
  function callEdgeFunction(name, body, isRetry) {
    return supabaseClient.auth.getSession().then(function (res) {
      var token = res.data && res.data.session && res.data.session.access_token;
      if (!token) return isRetry ? Promise.reject(paymentSessionExpiredError()) : recoverPaymentSessionThenRetry(name, body);
      return fetch(SUPABASE_URL + '/functions/v1/' + name, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'apikey': SUPABASE_ANON_KEY, 'x-user-token-b64': btoa(token) },
        body: JSON.stringify(body)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (r.status === 401 && !isRetry) return recoverPaymentSessionThenRetry(name, body);
          if (!r.ok) throw new Error(data.error || 'Request failed (' + r.status + ')');
          return data;
        });
      });
    });
  }
  function recoverPaymentSessionThenRetry(name, body) {
    return supabaseClient.auth.refreshSession().then(function (refreshed) {
      if (refreshed.error || !refreshed.data.session) throw paymentSessionExpiredError();
      return callEdgeFunction(name, body, true);
    }).catch(function () { throw paymentSessionExpiredError(); });
  }
  function paymentSessionExpiredError() {
    supabaseClient.auth.signOut().then(function () { window.location.href = BASE_PATH + '/login'; });
    return new Error('Your session has expired — please sign in again to continue.');
  }

  var PaymentFlow = (function () {
    // BUG FIX (root cause, verified against Cashfree's current Hosted Web Checkout docs —
    // https://www.cashfree.com/docs/payments/online/web/redirect): `redirectTarget: '_self'`
    // itself was correct (it's the SDK default) and `return_url` was already being set
    // server-side in order_meta — that part was never the problem. The actual bug was in what
    // this code did AROUND the checkout() call:
    //   1. checkout()'s result was never inspected at all — no `.then()`, so a client-side
    //      error/cancellation had no code path to react to.
    //   2. Checkout.onSubmit (below) closed the checkout panel and cleared the cart
    //      IMMEDIATELY after create_order() succeeded — before cashfree-create-order had even
    //      been called, let alone before Cashfree checkout actually opened. Any failure getting
    //      to Cashfree (edge function error, missing session id, SDK not loaded) then had
    //      nowhere visible to show up — the panel was already gone, so it looked exactly like
    //      what was reported: an order silently placed with no payment outcome.
    //   3. Nothing here ever re-asked Cashfree's own server what actually happened — the
    //      customer being back on our site was treated as the end of the flow instead of the
    //      START of verification.
    //
    // Fixed: checkout()'s resolution (or the mere fact that we're still on this page after
    // calling it, for `_self` navigations that for any reason didn't leave the page) is treated
    // as nothing more than a signal to go ask the server what really happened — never trusted
    // by itself. See Checkout.onSubmit for the panel/cart-clear timing fix.
    function startCheckout(orderId, onSessionReady) {
      return callEdgeFunction('cashfree-create-order', { orderId: orderId }).then(function (result) {
        if (!result.paymentSessionId) throw new Error(result.error || 'Could not start payment.');
        console.log('PaymentFlow: Cashfree session created', { orderId: orderId, cfOrderId: result.cfOrderId, mode: result.mode });
        var cashfree = Cashfree({ mode: result.mode === 'production' ? 'production' : 'sandbox' });
        // From here on the customer is handed off to Cashfree — safe point for the caller to
        // close its own UI (checkout panel, clear cart). Not done any earlier: if
        // cashfree-create-order itself had failed above, the caller's UI is still open and the
        // thrown error is visible right where the customer can see it and retry.
        if (onSessionReady) onSessionReady();
        // return_url is already set server-side (order_meta, in cashfree-create-order) —
        // redirectTarget: '_self' is the SDK's own default full-page-navigation behaviour.
        return cashfree.checkout({ paymentSessionId: result.paymentSessionId, redirectTarget: '_self' }).then(function (checkoutResult) {
          if (checkoutResult && checkoutResult.error) {
            console.log('PaymentFlow: checkout() resolved without navigating away (error/cancelled) — verifying with Cashfree server-side rather than trusting this', checkoutResult.error);
          }
          // A real `_self` navigation unloads this page before this line ever runs — reaching
          // here at all means that, for whatever reason, no navigation happened. Never leave
          // the customer stranded: drive to the same server-verified result screen ourselves.
          PaymentResultPage.open(orderId);
        });
      });
    }
    function verify(orderId) {
      return callEdgeFunction('cashfree-verify-payment', { orderId: orderId });
    }
    return { startCheckout: startCheckout, verify: verify };
  })();

  /* ---------- 18b1. Payment Result page (/payment-result — Cashfree redirects back here) ---------- */
  var PaymentResultPage = (function () {
    function panel() { return document.getElementById('paymentResultModal'); }
    function body() { return document.getElementById('paymentResultBody'); }
    function close() { closePanel(panel()); }

    var POLL_DELAYS_MS = [2000, 3000, 4000, 5000, 6000]; // ~20s of automatic re-checking before asking the customer to check manually

    function open(orderId) {
      var b = body();
      if (!orderId || !Number.isFinite(orderId)) {
        if (b) b.innerHTML = notFoundHtml();
        openPanel(panel());
        wireCloseButtons();
        return;
      }
      renderVerifying(b);
      openPanel(panel());
      wireCloseButtons();
      pollVerify(orderId, 0);
    }

    function renderVerifying(b, note) {
      if (!b) return;
      b.innerHTML =
        '<div class="success-icon payment-result-spinner">&#9825;</div>' +
        '<h2>Verifying your payment&hellip;</h2>' +
        '<p>' + escapeHtml(note || 'Please don’t close this page — this only takes a moment.') + '</p>';
    }

    function pollVerify(orderId, attempt) {
      PaymentFlow.verify(orderId).then(function (result) {
        if (result.status === 'PAID') return renderPaid(orderId, result);
        if (result.status === 'FAILED') return renderFailed(orderId, result);
        // PENDING — try again a few times automatically before asking the customer to check
        // manually. Never invent a success or failure state while genuinely unresolved.
        if (attempt < POLL_DELAYS_MS.length) {
          renderVerifying(body(), attempt > 0 ? 'Still confirming with Cashfree…' : null);
          window.setTimeout(function () { pollVerify(orderId, attempt + 1); }, POLL_DELAYS_MS[attempt]);
        } else {
          renderStillPending(orderId, result);
        }
      }).catch(function (err) {
        renderStillPending(orderId, { orderNumber: null, error: err.message });
      });
    }

    function renderPaid(orderId, result) {
      var b = body();
      if (!b) return;
      b.innerHTML =
        '<div class="success-icon">&#9825;</div><h2>Payment Successful &hearts;</h2>' +
        '<p>Thank you for shopping with You &amp; Me.</p>' +
        (result.orderNumber ? '<p class="success-order-id">Order #' + escapeHtml(result.orderNumber) + '</p>' : '') +
        '<p class="success-payment-status">Payment: <strong>' + fmtAmount(result.total) + ' paid' + (result.paymentMethod ? ' via ' + escapeHtml(paymentMethodLabel('cashfree', result.paymentMethod)) : '') + '</strong></p>' +
        '<div class="success-actions">' +
          '<button type="button" class="btn btn-outline" id="paymentResultViewOrder">View My Order</button>' +
          '<button type="button" class="btn btn-outline" id="paymentResultContinue">Continue Shopping</button>' +
        '</div>';
      bindViewAndContinue(orderId);
    }

    function renderFailed(orderId, result) {
      var b = body();
      if (!b) return;
      b.innerHTML =
        '<div class="success-icon payment-result-failed">&#10005;</div><h2>Payment Failed</h2>' +
        '<p>Your payment could not be completed' + (result.orderNumber ? ' for order #' + escapeHtml(result.orderNumber) : '') + '. No charge was made, and your order is still saved — you can try again right away.</p>' +
        '<div class="success-actions">' +
          '<button type="button" class="btn" id="paymentResultRetry">Try Again</button>' +
          '<button type="button" class="btn btn-outline" id="paymentResultViewOrder">View My Order</button>' +
          '<button type="button" class="btn btn-outline" id="paymentResultContinue">Continue Shopping</button>' +
        '</div>';
      var retryBtn = document.getElementById('paymentResultRetry');
      if (retryBtn) retryBtn.addEventListener('click', function () {
        retryBtn.disabled = true;
        retryBtn.textContent = 'Starting payment…';
        PaymentFlow.startCheckout(orderId).catch(function (err) {
          retryBtn.disabled = false;
          retryBtn.textContent = 'Try Again';
          alert(err.message || 'Could not start payment — please try again.');
        });
      });
      bindViewAndContinue(orderId);
    }

    function renderStillPending(orderId, result) {
      var b = body();
      if (!b) return;
      b.innerHTML =
        '<div class="success-icon payment-result-spinner">&#9825;</div><h2>Payment verification in progress</h2>' +
        '<p>This is taking longer than usual — your order is saved either way. Tap below to check again, or come back to My Orders shortly; it updates automatically as soon as Cashfree confirms it.</p>' +
        '<div class="success-actions">' +
          '<button type="button" class="btn" id="paymentResultCheckAgain">Check Again</button>' +
          '<button type="button" class="btn btn-outline" id="paymentResultViewOrder">View My Order</button>' +
          '<button type="button" class="btn btn-outline" id="paymentResultContinue">Continue Shopping</button>' +
        '</div>';
      var checkBtn = document.getElementById('paymentResultCheckAgain');
      if (checkBtn) checkBtn.addEventListener('click', function () {
        renderVerifying(body());
        pollVerify(orderId, POLL_DELAYS_MS.length); // one more manual check, no further auto-retry loop
      });
      bindViewAndContinue(orderId);
    }

    function bindViewAndContinue(orderId) {
      var viewBtn = document.getElementById('paymentResultViewOrder');
      if (viewBtn) viewBtn.addEventListener('click', function () {
        close();
        try { sessionStorage.setItem('ym_account_focus_order', String(orderId)); } catch (e) { /* ignore */ }
        window.location.href = BASE_PATH + '/account';
      });
      var continueBtn = document.getElementById('paymentResultContinue');
      if (continueBtn) continueBtn.addEventListener('click', function () { close(); window.location.href = BASE_PATH + '/'; });
    }

    function notFoundHtml() {
      return '<div class="success-icon payment-result-failed">&#10005;</div><h2>Order not found</h2>' +
        '<p>We couldn’t find which order this payment belongs to. If money was deducted, it will still be confirmed automatically — check My Orders in a moment.</p>' +
        '<div class="success-actions"><button type="button" class="btn btn-outline" id="paymentResultContinue">Continue Shopping</button></div>';
    }

    function wireCloseButtons() {
      var closeBtn = document.getElementById('paymentResultClose');
      if (closeBtn) closeBtn.onclick = function () { close(); window.location.href = BASE_PATH + '/'; };
      var continueBtn = document.getElementById('paymentResultContinue');
      if (continueBtn) continueBtn.addEventListener('click', function () { close(); window.location.href = BASE_PATH + '/'; });
    }

    function fmtAmount(total) { return typeof total === 'number' ? formatPrice(total) : ''; }

    return { open: open };
  })();

  /* ---------- 18c. Confirm Modal (reusable branded yes/no — never window.confirm()) ---------- */
  var ConfirmModal = (function () {
    function panel() { return document.getElementById('confirmModal'); }
    function body() { return document.getElementById('confirmModalBody'); }
    var onConfirm = null;

    // opts: { title, message, confirmLabel, cancelLabel, onConfirm }
    function open(opts) {
      document.getElementById('confirmModalTitle').textContent = opts.title || 'Are you sure?';
      onConfirm = opts.onConfirm || null;
      body().innerHTML =
        '<p>' + escapeHtml(opts.message || '') + '</p>' +
        '<div class="confirm-sheet-actions">' +
          '<button type="button" class="btn btn-primary" id="confirmSheetConfirm">' + escapeHtml(opts.confirmLabel || 'Confirm') + '</button>' +
          '<button type="button" class="btn btn-outline" id="confirmSheetCancel">' + escapeHtml(opts.cancelLabel || 'Cancel') + '</button>' +
        '</div>';
      document.getElementById('confirmSheetConfirm').addEventListener('click', function () {
        var cb = onConfirm;
        close();
        if (cb) cb();
      });
      document.getElementById('confirmSheetCancel').addEventListener('click', close);
      openPanel(panel());
    }
    function close() { closePanel(panel()); onConfirm = null; }
    return { open: open, close: close };
  })();

  /* ---------- 18d. Delivery Location (header "Deliver to" + serviceability check) ----------
     One normalized customer-facing result, no matter how many courier providers exist behind
     it (today: Delhivery + Shiprocket; a future DTDC would just be one more entry the
     check-delivery Edge Function checks — nothing here would need to change). Never trusts a
     browsing-time PIN for checkout — Checkout re-runs this itself against the actual shipping
     address before payment (see Checkout module). Never fabricates a locality or ETA — only
     ever shows what a saved address or the provider APIs themselves actually returned. */
  var DeliveryLocation = (function () {
    var STORAGE_KEY = 'ym_delivery_location';
    var current = null; // null | { pincode, locality, serviceable, checked, etaDays, error }
    var listeners = [];
    var savedAddresses = [];

    function load() {
      try {
        var raw = window.localStorage.getItem(STORAGE_KEY);
        current = raw ? JSON.parse(raw) : null;
      } catch (e) { current = null; }
    }
    function persist() {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch (e) { /* storage unavailable */ }
      updateHeaderLabel();
      listeners.forEach(function (fn) { fn(current); });
    }
    function get() { return current; }
    function onChange(fn) { listeners.push(fn); }

    function labelText() {
      if (!current || !current.pincode) return 'Select location';
      return current.locality ? current.locality + ' ' + current.pincode : current.pincode;
    }
    function updateHeaderLabel() {
      var t = labelText();
      var el = document.getElementById('deliverToLabel'); if (el) el.textContent = t;
      var elM = document.getElementById('deliverToLabelMobile'); if (elM) elM.textContent = t;
    }

    // The one place check-delivery is ever called from the browser — never courier credentials,
    // just a PIN in, a normalized real result out.
    function checkPincode(pincode) {
      return fetch(SUPABASE_URL + '/functions/v1/check-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ pincode: pincode })
      }).then(function (r) { return r.json().catch(function () { return { status: 'error', error: "We couldn't check delivery availability right now. Please try again." }; }); })
        .catch(function () { return { status: 'error', error: "We couldn't check delivery availability right now. Please try again." }; });
    }

    function selectPincode(pincode, locality) {
      return checkPincode(pincode).then(function (result) {
        if (result.status === 'error') {
          current = { pincode: pincode, locality: locality || null, serviceable: null, checked: false, error: result.error };
        } else {
          current = { pincode: pincode, locality: locality || null, serviceable: result.serviceable, etaDays: result.etaDays, checked: true };
        }
        persist();
        return current;
      });
    }
    function selectAddress(addr) {
      var locality = [addr.city, addr.state].filter(Boolean).join(', ');
      return selectPincode(addr.pincode, locality || null);
    }

    function panel() { return document.getElementById('locationSheet'); }
    function body() { return document.getElementById('locationSheetBody'); }

    function bodyHtml() {
      var user = SessionService.getUser();
      var addressesHtml = user && savedAddresses.length
        ? '<div class="location-section"><h4>Saved Addresses</h4>' +
            savedAddresses.map(function (a) {
              return '<button type="button" class="location-address-option" data-select-address="' + a.id + '">' +
                '<strong>' + escapeHtml(a.label || 'Home') + '</strong>' +
                '<span>' + escapeHtml(a.city || '') + (a.state ? ', ' + escapeHtml(a.state) : '') + ' — ' + escapeHtml(a.pincode) + '</span>' +
              '</button>';
            }).join('') +
          '</div>'
        : '';
      return (
        '<div class="location-section">' +
          '<button type="button" class="btn btn-outline location-current-btn" id="locationUseCurrentBtn">' +
            '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
            'Use My Current Location' +
          '</button>' +
          '<p class="location-hint" id="locationCurrentHint"></p>' +
        '</div>' +
        '<div class="location-section">' +
          '<h4>Enter Pincode</h4>' +
          '<div class="location-pin-row">' +
            '<input type="text" inputmode="numeric" maxlength="6" placeholder="6-digit PIN code" id="locationPinInput" value="' + (current && current.pincode ? escapeHtml(current.pincode) : '') + '">' +
            '<button type="button" class="btn btn-primary" id="locationCheckBtn">Check</button>' +
          '</div>' +
          '<p class="location-result" id="locationResult"></p>' +
        '</div>' +
        addressesHtml
      );
    }

    function renderResult(el, result) {
      if (!el) return;
      if (!result) { el.innerHTML = ''; el.className = 'location-result'; return; }
      if (result.checked === false) {
        el.className = 'location-result location-result-error';
        el.textContent = result.error || "We couldn't check delivery availability right now. Please try again.";
      } else if (result.serviceable) {
        el.className = 'location-result location-result-ok';
        el.textContent = '✓ Delivery available to ' + result.pincode + (result.etaDays != null ? ' — usually ' + result.etaDays + ' day' + (result.etaDays === 1 ? '' : 's') : '');
      } else {
        el.className = 'location-result location-result-bad';
        el.textContent = 'Delivery is currently unavailable to this PIN code.';
      }
    }

    function open() {
      savedAddresses = [];
      body().innerHTML = bodyHtml();
      bind();
      openPanel(panel());
      var user = SessionService.getUser();
      if (user) {
        supabaseClient.from('addresses').select('*').order('is_default', { ascending: false }).order('created_at', { ascending: false })
          .then(function (res) { savedAddresses = res.data || []; if (!panel().hidden) { body().innerHTML = bodyHtml(); bind(); } })
          .catch(function () { /* no addresses to show — not fatal */ });
      }
    }
    function close() { closePanel(panel()); }

    function bind() {
      var currentBtn = document.getElementById('locationUseCurrentBtn');
      var hintEl = document.getElementById('locationCurrentHint');
      if (currentBtn) currentBtn.addEventListener('click', function () {
        if (!navigator.geolocation) { hintEl.textContent = 'Location isn\'t supported on this device — please enter your PIN code below.'; return; }
        currentBtn.disabled = true;
        hintEl.textContent = 'Getting your location…';
        navigator.geolocation.getCurrentPosition(
          function () {
            // We deliberately don't run reverse-geocoding (no fake PIN would ever be honest
            // without it) — the customer's real coordinates alone can't become a trustworthy
            // PIN code, so we ask them to confirm it themselves instead of guessing.
            currentBtn.disabled = false;
            hintEl.textContent = 'Got your location — please confirm your PIN code below to check delivery.';
            var pinInput = document.getElementById('locationPinInput');
            if (pinInput) pinInput.focus();
          },
          function () {
            currentBtn.disabled = false;
            hintEl.textContent = 'Location permission was not granted — please enter your PIN code below.';
          },
          { timeout: 10000 }
        );
      });

      var pinInput = document.getElementById('locationPinInput');
      var checkBtn = document.getElementById('locationCheckBtn');
      var resultEl = document.getElementById('locationResult');
      function doCheck() {
        var pincode = (pinInput.value || '').trim();
        if (!/^[1-9][0-9]{5}$/.test(pincode)) { resultEl.className = 'location-result location-result-error'; resultEl.textContent = 'Enter a valid 6-digit PIN code.'; return; }
        checkBtn.disabled = true; checkBtn.textContent = 'Checking…';
        selectPincode(pincode, null).then(function (result) {
          checkBtn.disabled = false; checkBtn.textContent = 'Check';
          renderResult(resultEl, result);
        });
      }
      if (checkBtn) checkBtn.addEventListener('click', doCheck);
      if (pinInput) pinInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doCheck(); });

      body().querySelectorAll('[data-select-address]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var addr = savedAddresses.filter(function (a) { return String(a.id) === btn.dataset.selectAddress; })[0];
          if (!addr) return;
          btn.disabled = true;
          selectAddress(addr).then(function () { close(); });
        });
      });
    }

    function init() {
      load();
      updateHeaderLabel();
      var btn = document.getElementById('deliverToBtn');
      if (btn) btn.addEventListener('click', open);
      var btnM = document.getElementById('deliverToBtnMobile');
      if (btnM) btnM.addEventListener('click', open);
      var closeBtn = document.getElementById('locationSheetClose');
      if (closeBtn) closeBtn.addEventListener('click', close);
    }

    return { init: init, get: get, onChange: onChange, checkPincode: checkPincode, selectPincode: selectPincode, open: open };
  })();

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

    // Fetches every order once, split client-side into the customer's normal (visible) list and
    // their hidden/archived one — `customer_hidden_at` is never interpreted by Admin, this split
    // only ever affects what the customer sees in their own My Orders. An order can be hidden
    // (see hideEligible()) only once it's reached a terminal state — order_status
    // delivered/cancelled, or payment_status failed/refunded — never while still active.
    function fetchOrders() {
      if (ordersCache) return Promise.resolve(ordersCache);
      return supabaseClient.from('orders').select('*, order_items(*)').order('created_at', { ascending: false })
        .then(function (res) {
          var all = res.data || [];
          ordersCache = {
            visible: all.filter(function (o) { return !o.customer_hidden_at; }),
            hidden: all.filter(function (o) { return !!o.customer_hidden_at; })
          };
          return ordersCache;
        })
        .catch(function () { ordersCache = { visible: [], hidden: [] }; return ordersCache; });
    }

    // An order started via Cashfree that the customer never actually paid for — never
    // progressed past 'new' (nothing prepared yet), payment_status still 'pending' forever
    // because they closed/backed out of Cashfree Checkout. Frontend return/close is NEVER proof
    // of payment either way — this is purely a display classification for an order whose real,
    // server-verified payment_status genuinely never became 'paid'.
    function isAbandonedCashfree(o) {
      return o.order_status === 'new' && o.payment_method === 'cashfree' && o.payment_status === 'pending';
    }
    // Soft-warning card state for My Orders — never the green "paid" look. Distinguishes
    // "customer just hasn't paid yet" (still retryable) from "Cashfree reported it failed"
    // (also retryable, different wording) — both use the same Pay Again action either way.
    function paymentIncompleteState(o) {
      if (isAbandonedCashfree(o)) return { label: 'Payment Incomplete', note: 'Payment was not completed for this order.' };
      if (o.payment_method === 'cashfree' && o.payment_status === 'failed') return { label: 'Payment Cancelled', note: 'Payment was not completed for this order.' };
      return null;
    }

    function hideEligible(o) {
      return o.order_status === 'delivered' || o.order_status === 'cancelled' || o.payment_status === 'failed' || o.payment_status === 'refunded' || isAbandonedCashfree(o);
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
      fetchOrders().then(function (result) {
        var orders = result.visible;
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
    var showingHidden = false; // resets to the normal (visible) list every time the tab is re-entered
    function renderOrders() {
      showingHidden = false;
      fetchOrders().then(function (result) {
        renderOrdersList(result);
      });
    }

    function renderOrdersList(result) {
      var orders = showingHidden ? result.hidden : result.visible;
      var anyEligibleVisible = result.visible.some(hideEligible);
      content().innerHTML =
        '<div class="account-dash-section-head"><h3>' + (showingHidden ? 'Hidden Orders' : 'My Orders') + '</h3>' +
          '<div class="order-history-actions">' +
            (!showingHidden && anyEligibleVisible ? '<button type="button" class="link-btn" id="clearOrderHistoryBtn">Clear Order History</button>' : '') +
            (result.hidden.length ? '<button type="button" class="link-btn" id="toggleHiddenOrdersBtn">' + (showingHidden ? 'Back to My Orders' : 'Hidden Orders (' + result.hidden.length + ')') + '</button>' : '') +
          '</div>' +
        '</div>' +
        (orders.length === 0
          ? (showingHidden ? '<div class="account-empty-state"><p>No hidden orders.</p></div>' : emptyOrdersState())
          : orders.map(function (o) { return orderCardHtml(o, showingHidden); }).join(''));
      bindOrderCardActions();

      var toggleBtn = document.getElementById('toggleHiddenOrdersBtn');
      if (toggleBtn) toggleBtn.addEventListener('click', function () { showingHidden = !showingHidden; renderOrdersList(result); });

      var clearBtn = document.getElementById('clearOrderHistoryBtn');
      if (clearBtn) clearBtn.addEventListener('click', function () {
        ConfirmModal.open({
          title: 'Clear your order history?',
          message: 'This will remove all eligible orders from your account view. It will not delete payment, invoice or admin records.',
          confirmLabel: 'Clear History',
          cancelLabel: 'Keep Orders',
          onConfirm: function () {
            supabaseClient.rpc('clear_customer_order_history').then(function (res) {
              if (res.error) { showToast(res.error.message || 'Could not clear order history.'); return; }
              ordersCache = null;
              fetchOrders().then(renderOrdersList);
            });
          }
        });
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

    function orderCardHtml(o, isHiddenList) {
      var ts = orderThumbAndSummary(o);
      var removeBtn = isHiddenList
        ? '<button type="button" class="link-btn order-card-remove" data-restore-order="' + o.id + '">Restore</button>'
        : (hideEligible(o) ? '<button type="button" class="link-btn order-card-remove" data-remove-order="' + o.id + '">Remove Order</button>' : '');
      var reorderBtn = '<button type="button" class="link-btn order-card-remove" data-reorder="' + o.id + '">Reorder</button>';
      var incomplete = paymentIncompleteState(o);
      return '<div class="order-card' + (incomplete ? ' order-card-warning' : '') + '">' +
        '<div class="order-card-thumb">' + productImageHtml(ts.thumb) + '</div>' +
        '<div class="order-card-info">' +
          '<div class="order-card-top"><strong>Order #' + escapeHtml(o.order_number) + '</strong><span class="order-card-date">' + formatDate(o.created_at) + '</span></div>' +
          '<p class="order-card-summary">' + escapeHtml(ts.summary) + '</p>' +
          (incomplete
            ? '<p class="order-card-warning-label">' + escapeHtml(incomplete.label) + '</p><p class="order-card-warning-note">' + escapeHtml(incomplete.note) + '</p>'
            : '<div class="order-card-badges">' +
                '<span class="badge badge-' + o.payment_status + '">' + statusLabel(o.payment_status) + '</span>' +
                '<span class="badge badge-' + o.order_status + '">' + statusLabel(o.order_status) + '</span>' +
              '</div>') +
        '</div>' +
        '<div class="order-card-right"><div class="order-card-total">' + formatPrice(o.total) + '</div>' +
          (incomplete && !isHiddenList
            ? '<button type="button" class="btn btn-sm btn-primary" data-pay-again="' + o.id + '">Pay Again</button>'
            : '<button type="button" class="btn btn-sm btn-outline" data-view-order="' + o.id + '">View Order</button>') +
          reorderBtn +
          removeBtn +
        '</div>' +
      '</div>';
    }

    // Shared by both the order card (My Orders / Hidden Orders lists) and the order detail page
    // — same RPCs, same confirmation copy, same refresh-after-confirm behaviour everywhere.
    function confirmRemoveOrder(orderId, afterRemove) {
      ConfirmModal.open({
        title: 'Remove this order?',
        message: 'This order will be removed from your account view. Your payment, invoice and order records will remain securely stored.',
        confirmLabel: 'Remove Order',
        cancelLabel: 'Cancel',
        onConfirm: function () {
          supabaseClient.rpc('hide_order', { p_order_id: orderId }).then(function (res) {
            if (res.error) { showToast(res.error.message || 'Could not remove this order.'); return; }
            ordersCache = null;
            if (afterRemove) afterRemove(); else fetchOrders().then(renderOrdersList);
          });
        }
      });
    }

    // PAY AGAIN — tries to pay the SAME existing unpaid order (never creates a new one).
    // startCheckout() already does everything steps 1-9 of the retry flow require: re-fetches
    // the order server-side, re-checks it belongs to the caller (requireUser in the Edge
    // Function) and isn't already paid (409 if so — see cashfree-create-order/index.ts), gets a
    // fresh Cashfree session, and opens Checkout. Server-side Cashfree verification (not this
    // click, not the redirect, not the popup closing) is what can ever mark it paid.
    function payAgain(orderId, btn) {
      if (btn.disabled) return; // guards a double-click — see below, this is the actual protection
      btn.disabled = true;
      var originalText = btn.textContent;
      btn.textContent = 'Starting…';
      PaymentFlow.startCheckout(orderId).catch(function (err) {
        btn.disabled = false;
        btn.textContent = originalText;
        showToast(err.message || 'Could not start payment. Please try again.');
      });
    }

    // REORDER — conceptually separate from Pay Again: builds a NEW cart from a past order's
    // items, never touches the original order. Re-checks each item against the CURRENTLY
    // loaded catalog (current price via CartService.addItem -> findProduct, current stock) —
    // never blindly reuses the historical order_items snapshot's price, and never silently
    // substitutes an unavailable product/variant for something else.
    function reorderItems(order) {
      var items = order.order_items || [];
      if (!items.length) { showToast('This order has no items to reorder.'); return; }
      var added = 0;
      var unavailable = [];
      items.forEach(function (it) {
        var product = findProduct(it.product_id);
        if (!product || product.status !== 'active') { unavailable.push(it.product_name); return; }
        var variant = (product.variants || []).filter(function (v) { return v.size === it.size && v.color === it.color; })[0];
        if (!variant || variant.stock < 1) { unavailable.push(it.product_name + ' (' + it.size + ', ' + it.color + ')'); return; }
        CartService.addItem(product.id, it.size, it.color, Math.min(it.quantity, variant.stock));
        added++;
      });
      if (added) { hideAccountDashboardView(); CartDrawer.open(); }
      if (unavailable.length) {
        showToast((added ? added + ' item(s) added to cart. ' : '') + 'No longer available: ' + unavailable.join(', '));
      } else {
        showToast(added + ' item(s) added to cart — review before checkout.');
      }
    }

    function bindOrderCardActions() {
      content().querySelectorAll('[data-view-order]').forEach(function (btn) {
        btn.addEventListener('click', function () { renderOrderDetail(Number(btn.dataset.viewOrder)); });
      });
      content().querySelectorAll('[data-pay-again]').forEach(function (btn) {
        btn.addEventListener('click', function () { payAgain(Number(btn.dataset.payAgain), btn); });
      });
      content().querySelectorAll('[data-reorder]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var orderId = Number(btn.dataset.reorder);
          fetchOrders().then(function (result) {
            var order = result.visible.concat(result.hidden).filter(function (o) { return o.id === orderId; })[0];
            if (order) reorderItems(order);
          });
        });
      });
      content().querySelectorAll('[data-remove-order]').forEach(function (btn) {
        btn.addEventListener('click', function () { confirmRemoveOrder(Number(btn.dataset.removeOrder)); });
      });
      content().querySelectorAll('[data-restore-order]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          supabaseClient.rpc('unhide_order', { p_order_id: Number(btn.dataset.restoreOrder) }).then(function (res) {
            if (res.error) { showToast(res.error.message || 'Could not restore this order.'); return; }
            ordersCache = null;
            fetchOrders().then(renderOrdersList);
          });
        });
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
    // Matches ORDER_STATUS_RANK in delhivery-shipping/index.ts and admin.js exactly — one
    // real rank per internal stage, not several statuses sharing a slot, so each stage can get
    // its own real order_status_history timestamp instead of stages bleeding together.
    var ORDER_STATUS_RANK = { new: 0, confirmed: 1, packing: 2, packed: 3, ready_to_ship: 4, shipped: 5, out_for_delivery: 6, delivered: 7 };

    function trackingStepsDone(o) {
      var rank = ORDER_STATUS_RANK[o.order_status] != null ? ORDER_STATUS_RANK[o.order_status] : 0;
      return {
        placed: true,
        paid: o.payment_status === 'paid',
        confirmed: rank >= 1,
        packing: rank >= 2,
        shipped: rank >= 5,
        out_for_delivery: rank >= 6,
        delivered: rank >= 7
      };
    }

    // Real timestamp for one timeline stage — never order.updated_at, never fabricated. Internal
    // stages come from order_status_history (a real row per change, inserted by Admin's own
    // Update button or the Delhivery auto-sync — see supabase/migrations/0001_init.sql and
    // delhivery-shipping/index.ts's syncOrderStatusFromShipment). Courier stages come from
    // shipment_events (real Delhivery scans). If a stage is done but genuinely has no recorded
    // time (an old order predating this), the caller shows "Time unavailable" rather than
    // guessing — see trackingTimelineHtml below.
    function findHistoryTime(history, status) {
      var rows = (history || []).filter(function (h) { return h.status === status; });
      if (!rows.length) return null;
      rows.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      return rows[0].created_at;
    }
    function findEventTime(events, normalizedStatuses) {
      var rows = (events || []).filter(function (e) { return normalizedStatuses.indexOf(e.normalized_status) !== -1; });
      if (!rows.length) return null;
      rows.sort(function (a, b) { return new Date(a.event_time || 0) - new Date(b.event_time || 0); });
      return rows[0].event_time;
    }
    function stageTime(key, o, shipment, isCourier) {
      if (key === 'placed') return o.created_at;
      if (key === 'paid') return o.payment_status === 'paid' ? o.paid_at : null;
      if (isCourier && key === 'ready_for_pickup') return findEventTime(shipment && shipment.shipment_events, ['shipment_created', 'pickup_scheduled']);
      if (isCourier && ['picked_up', 'in_transit', 'out_for_delivery', 'delivered'].indexOf(key) !== -1) return findEventTime(shipment && shipment.shipment_events, [key]);
      return findHistoryTime(o.order_status_history, key);
    }

    // Once a real courier shipment exists (Amazon Shipping or Delhivery — any provider whose
    // shipments table row has a normalized_status), that provider's own normalized_status is
    // the source of truth for courier movement (Ready for Pickup → Picked Up → In Transit →
    // Out for Delivery → Delivered) — never inferred from order_status, and never from just
    // "a shipment/AWB exists". A shipment being *created* is not the same as it being *shipped*
    // — see the bug-fix note on courierTrackingStepsDone below. Every provider shares the same
    // normalized_status vocabulary (see supabase/migrations/0003_shipping_providers.sql), so one
    // shared 9-step timeline (order-placement steps + courier steps) works for all of them.
    var COURIER_TRACKING_STEPS = {
      amazon_shipping: [
        { key: 'placed', label: 'Order Placed' },
        { key: 'paid', label: 'Payment Confirmed' },
        { key: 'confirmed', label: 'Confirmed' },
        { key: 'packed', label: 'Packed' },
        { key: 'ready_to_ship', label: 'Ready to Ship' },
        { key: 'ready_for_pickup', label: 'Ready for Pickup' },
        { key: 'picked_up', label: 'Picked Up' },
        { key: 'in_transit', label: 'In Transit' },
        { key: 'out_for_delivery', label: 'Out for Delivery' },
        { key: 'delivered', label: 'Delivered' }
      ],
      delhivery: [
        { key: 'placed', label: 'Order Placed' },
        { key: 'paid', label: 'Payment Confirmed' },
        { key: 'confirmed', label: 'Confirmed' },
        { key: 'packed', label: 'Packed' },
        { key: 'ready_to_ship', label: 'Ready to Ship' },
        { key: 'ready_for_pickup', label: 'Preparing for Pickup' },
        { key: 'picked_up', label: 'Picked Up' },
        { key: 'in_transit', label: 'In Transit' },
        { key: 'out_for_delivery', label: 'Out for Delivery' },
        { key: 'delivered', label: 'Delivered' }
      ]
    };
    // shipment_created and pickup_scheduled share rank 0 ("Ready for Pickup" — Delhivery has the
    // AWB but hasn't actually collected the parcel yet); only picked_up and later count as real
    // courier movement.
    var COURIER_STATUS_RANK = { shipment_created: 0, pickup_scheduled: 0, picked_up: 1, in_transit: 2, out_for_delivery: 3, delivered: 4 };
    // BUG FIX: this used to return `handed: rank >= 1` collapsed under a single "confirmed:
    // true, packed: true" pair, which (combined with a since-fixed server bug that wrongly
    // advanced order_status to 'shipped' the moment an AWB was created) let "Shipped ✓" show up
    // before Delhivery had actually picked up the parcel. Every step below is now computed
    // explicitly — never a blind `index <= currentIndex` sweep — combining You & Me's own
    // internal prep status (order.order_status, Admin-owned) with Delhivery's real courier
    // status (shipment.normalized_status) as two genuinely separate signals.
    function courierTrackingStepsDone(o, shipment) {
      var internalRank = ORDER_STATUS_RANK[o.order_status] != null ? ORDER_STATUS_RANK[o.order_status] : 0;
      var courierRank = COURIER_STATUS_RANK[shipment.normalized_status] != null ? COURIER_STATUS_RANK[shipment.normalized_status] : 0;
      // A shipment record existing at all means Admin already moved this order through prep
      // (Delhivery shipments are only ever created from "Ready to Ship" — see
      // supabase/README-delhivery.md) — so confirmed/packed read as done even if this
      // particular order's order_status history happens to be missing those intermediate rows.
      var courierStarted = true;
      return {
        placed: true,
        paid: o.payment_status === 'paid',
        confirmed: internalRank >= 1 || courierStarted,
        packed: internalRank >= 3 || courierStarted,
        ready_to_ship: internalRank >= 4 || courierStarted,
        ready_for_pickup: courierRank >= 0,
        picked_up: courierRank >= 1,
        in_transit: courierRank >= 2,
        out_for_delivery: courierRank >= 3,
        delivered: courierRank >= 4
      };
    }

    /* ---- Invoice ---- */
    // Same rule as public.eligible_for_invoice() in the database — kept in sync deliberately so
    // the UI never shows a "Download Invoice" button the server would then refuse. The server
    // function is still the real authority (this is only for what the button looks like before
    // the click); generate_invoice_for_order() re-checks this itself either way.
    function invoiceEligible(o) {
      return o.payment_status === 'paid' && ['new', 'cancelled'].indexOf(o.order_status) === -1;
    }

    function getExistingInvoice(orderId) {
      return supabaseClient.from('invoices').select('*').eq('order_id', orderId).maybeSingle()
        .then(function (res) { return res.data || null; })
        .catch(function () { return null; });
    }

    // Creates the invoice on first call (server-side, via generate_invoice_for_order — the only
    // way an invoices row is ever written), or just returns the existing one on every call after
    // that. Never generates a second invoice for the same order.
    function ensureInvoice(orderId) {
      return supabaseClient.rpc('generate_invoice_for_order', { p_order_id: orderId })
        .then(function (res) { if (res.error) throw res.error; return res.data; });
    }

    var INVOICE_SELLER_FALLBACK = { name: 'You & Me' };

    // One canonical invoice document — this exact function (mirrored, not literally shared,
    // in admin.js) is what both Admin and the customer render, from the same `invoices` row and
    // the same immutable order_items rows. Nothing here is fabricated: every field either comes
    // from the invoice's own frozen snapshot or is omitted (no GST/tax fields exist unless
    // invoice.tax_amount is genuinely > 0 — this store has no GST registration, so that's
    // always the case today, and the Tax line simply never renders).
    function buildInvoiceHtml(order, items, invoice) {
      var seller = invoice.seller_snapshot || INVOICE_SELLER_FALLBACK;
      var customer = invoice.customer_snapshot || {};
      var addr = invoice.shipping_address_snapshot || {};
      var shipment = invoice.shipping_snapshot;
      var sellerAddrLine = [seller.line1, seller.line2].filter(Boolean).join(', ');
      var sellerCityLine = [seller.city, seller.state, seller.pincode].filter(Boolean).join(', ');
      var addrLine1 = [addr.house, addr.street].filter(Boolean).join(', ') + (addr.landmark ? ' (near ' + addr.landmark + ')' : '');
      var addrLine2 = [addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');

      var itemRows = items.map(function (it) {
        return '<tr>' +
          '<td>' + escapeHtml(it.product_name) + '</td>' +
          '<td>' + escapeHtml(it.sku || '—') + '</td>' +
          '<td>' + escapeHtml(it.size || '—') + '</td>' +
          '<td>' + escapeHtml(it.color || '—') + '</td>' +
          '<td class="num">' + it.quantity + '</td>' +
          '<td class="num">' + formatPrice(it.unit_price) + '</td>' +
          '<td class="num">' + formatPrice(it.total_price) + '</td>' +
        '</tr>';
      }).join('');

      var summaryRows =
        '<tr><td>Subtotal</td><td class="num">' + formatPrice(invoice.subtotal) + '</td></tr>' +
        (invoice.discount > 0 ? '<tr><td>Discount</td><td class="num">&minus;' + formatPrice(invoice.discount) + '</td></tr>' : '') +
        '<tr><td>Shipping Charge</td><td class="num">' + (invoice.shipping_amount === 0 ? 'Free' : formatPrice(invoice.shipping_amount)) + '</td></tr>' +
        (invoice.tax_amount > 0 ? '<tr><td>Tax</td><td class="num">' + formatPrice(invoice.tax_amount) + '</td></tr>' : '') +
        '<tr class="grand"><td>Grand Total</td><td class="num">' + formatPrice(invoice.grand_total) + '</td></tr>';

      var titleSafe = 'You-and-Me-Invoice-' + invoice.invoice_number.replace(/\s+/g, '-');

      return '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(titleSafe) + '</title><style>' +
        'body{font-family:Poppins,Arial,sans-serif;color:#2E2A26;margin:0;padding:32px;background:#fff;}' +
        '.invoice{max-width:760px;margin:0 auto;}' +
        '.inv-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #F1E4D3;padding-bottom:20px;margin-bottom:24px;}' +
        '.inv-brand h1{margin:0;font-size:1.6rem;color:#E68A98;}' +
        '.inv-brand p{margin:2px 0 0;color:#6B6259;font-size:0.85rem;}' +
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
          '<div class="inv-brand"><h1>YOU &amp; ME</h1><p>Together in Every Style</p></div>' +
          '<div class="inv-meta">' +
            '<div><strong>Invoice #' + escapeHtml(invoice.invoice_number) + '</strong></div>' +
            '<div>Invoice Date: ' + formatDate(invoice.invoice_date) + '</div>' +
            '<div>Order Number: ' + escapeHtml(order.order_number) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="inv-cols">' +
          '<div><h2 class="section">Customer Details</h2>' +
            escapeHtml(customer.name || '') + '<br>' +
            (customer.email ? escapeHtml(customer.email) + '<br>' : '') +
            escapeHtml(customer.phone || '') +
          '</div>' +
          '<div><h2 class="section">Shipping Address</h2>' +
            escapeHtml(addrLine1) + '<br>' + escapeHtml(addrLine2) +
          '</div>' +
          '<div><h2 class="section">Sold By</h2>' +
            escapeHtml(seller.name || 'You & Me') + '<br>' +
            (sellerAddrLine ? escapeHtml(sellerAddrLine) + '<br>' : '') +
            (sellerCityLine ? escapeHtml(sellerCityLine) + '<br>' : '') +
            (seller.phone ? escapeHtml(seller.phone) : '') +
          '</div>' +
        '</div>' +
        '<h2 class="section">Order Items</h2>' +
        '<table><thead><tr><th>Product</th><th>SKU</th><th>Size</th><th>Color</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Line Total</th></tr></thead>' +
        '<tbody>' + itemRows + '</tbody></table>' +
        '<table class="summary-table"><tbody>' + summaryRows + '</tbody></table>' +
        '<h2 class="section">Payment</h2>' +
        '<div style="font-size:0.9rem;">Method: ' + escapeHtml(paymentMethodLabel(invoice.payment_method)) + '<br>' +
          'Status: ' + escapeHtml(statusLabel(invoice.payment_status)) +
          (invoice.payment_reference ? '<br>Reference: ' + escapeHtml(invoice.payment_reference) : '') +
        '</div>' +
        (shipment && shipment.provider ? '<h2 class="section">Shipping</h2>' +
          '<div style="font-size:0.9rem;">Shipping Partner: ' + escapeHtml(shipment.provider === 'delhivery' ? 'Delhivery' : shipment.provider === 'amazon_shipping' ? 'Amazon Shipping' : shipment.provider) +
          (shipment.tracking_id ? '<br>Tracking / AWB: ' + escapeHtml(shipment.tracking_id) : '') +
          '</div>' : '') +
        '<div class="inv-footer">This is a system-generated invoice for your You &amp; Me order. Thank you for shopping with us. &hearts;</div>' +
        '</div><script>window.onload=function(){setTimeout(function(){window.print();},150);};<\/script>' +
        '</body></html>';
    }

    function downloadInvoice(order, items, invoice) {
      var html = buildInvoiceHtml(order, items, invoice);
      var blob = new Blob([html], { type: 'text/html' });
      var url = URL.createObjectURL(blob);
      var win = window.open(url, '_blank');
      if (!win) { window.location.href = url; }
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
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
          return eventsPromise
            .then(function (events) { if (shipment) shipment.shipment_events = events; return getExistingInvoice(o.id); })
            .then(function (invoice) { return { o: o, shipment: shipment, isCourier: isCourier, courierSteps: courierSteps, invoice: invoice }; });
        })
        .then(function (ctx) {
          var o = ctx.o, shipment = ctx.shipment, isCourier = ctx.isCourier, courierSteps = ctx.courierSteps, invoice = ctx.invoice;
          var done = o.order_status === 'cancelled' ? null : (isCourier ? courierTrackingStepsDone(o, shipment) : trackingStepsDone(o));
          var detailIncomplete = paymentIncompleteState(o);

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
            '<div class="panel-card' + (detailIncomplete ? ' order-card-warning' : '') + '"><h4>Payment</h4>' +
              (detailIncomplete
                ? '<p class="order-card-warning-label">' + escapeHtml(detailIncomplete.label) + '</p>' +
                  '<p class="order-card-warning-note">' + escapeHtml(detailIncomplete.note) + '</p>' +
                  '<button type="button" class="btn btn-sm btn-primary" id="payAgainDetailBtn">Pay Again</button>'
                : '<p>Method: ' + escapeHtml(paymentMethodLabel(o.payment_method, o.cashfree_payment_method)) + '</p>' +
                  '<p class="success-payment-status">Payment Status: <span class="badge badge-' + o.payment_status + '">' + statusLabel(o.payment_status) + '</span></p>' +
                  (o.payment_status === 'paid'
                    ? '<p>Amount Paid: <strong>' + formatPrice(o.total) + '</strong>' + (o.paid_at ? '<br>Paid On: ' + formatDateTime(o.paid_at) : '') + '</p>'
                    : o.payment_method === 'cashfree'
                      ? '<p class="account-payment-note">Payment is verified automatically by Cashfree — this updates on its own, no action needed here.</p>'
                      : '<p class="account-payment-note">Payment is confirmed manually by our team once received — you\'ll see this update automatically, no action needed here.</p>')) +
            '</div>' +
            (o.order_status === 'cancelled'
              ? '<div class="panel-card"><h4>Order Status</h4><p><span class="badge badge-cancelled">Cancelled</span></p></div>'
              : '<div class="panel-card"><h4>Order Status</h4>' +
                  (isCourier && ['delivery_failed', 'returned', 'cancelled'].indexOf(shipment.normalized_status) !== -1
                    ? '<p><span class="badge badge-' + escapeHtml(shipment.normalized_status) + '">' + statusLabel(shipment.normalized_status) + '</span></p>'
                    : trackingTimelineHtml(done, isCourier ? courierSteps : TRACKING_STEPS, o, shipment, isCourier)) +
                '</div>') +
            '<div class="panel-card"><h4>Shipping</h4>' + shippingSectionHtml(shipment) +
            '</div>' +
            '<div class="panel-card"><h4>Invoice</h4>' +
              (invoice
                ? '<p>Invoice #' + escapeHtml(invoice.invoice_number) + '</p><button type="button" class="btn btn-sm btn-outline" id="downloadInvoiceBtn">Download Invoice</button>'
                : invoiceEligible(o)
                  ? '<button type="button" class="btn btn-sm btn-outline" id="downloadInvoiceBtn">Download Invoice</button>'
                  : '<p class="account-payment-note">Invoice will be available after your order is confirmed.</p>') +
            '</div>' +
            (!o.customer_hidden_at && hideEligible(o)
              ? '<div class="panel-card"><button type="button" class="btn btn-sm btn-outline" id="removeOrderDetailBtn">Remove Order</button></div>'
              : '');

          var back = document.getElementById('orderDetailBack');
          if (back) back.addEventListener('click', function () { render('orders'); });

          var removeBtn = document.getElementById('removeOrderDetailBtn');
          if (removeBtn) removeBtn.addEventListener('click', function () {
            confirmRemoveOrder(o.id, function () { render('orders'); });
          });

          var payAgainDetailBtn = document.getElementById('payAgainDetailBtn');
          if (payAgainDetailBtn) payAgainDetailBtn.addEventListener('click', function () { payAgain(o.id, payAgainDetailBtn); });

          var downloadBtn = document.getElementById('downloadInvoiceBtn');
          if (downloadBtn) downloadBtn.addEventListener('click', function () {
            downloadBtn.disabled = true;
            var originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Preparing…';
            ensureInvoice(o.id).then(function (inv) {
              downloadInvoice(o, o.order_items || [], inv);
              downloadBtn.disabled = false;
              downloadBtn.textContent = originalText;
            }).catch(function (err) {
              downloadBtn.disabled = false;
              downloadBtn.textContent = originalText;
              alert(err.message || 'Could not prepare the invoice — please try again.');
            });
          });
        })
        .catch(function (err) {
          content().innerHTML = '<button type="button" class="link-btn" id="orderDetailBack">&#8592; Back to My Orders</button><p class="account-empty-state">' + escapeHtml(err.message) + '</p>';
          var back = document.getElementById('orderDetailBack');
          if (back) back.addEventListener('click', function () { render('orders'); });
        });
    }

    function trackingTimelineHtml(done, steps, o, shipment, isCourier) {
      return '<div class="tracking-timeline">' + (steps || TRACKING_STEPS).map(function (step) {
        var isDone = !!done[step.key];
        var time = isDone && o ? stageTime(step.key, o, shipment, isCourier) : null;
        var timeHtml = isDone && o ? '<span class="tracking-step-time">' + (time ? formatDateTime(time) : 'Time unavailable') + '</span>' : '';
        return '<div class="tracking-step' + (isDone ? ' done' : '') + '">' +
          '<span class="tracking-dot">' + (isDone ? '&#10003;' : '') + '</span>' +
          '<span class="tracking-step-body"><span class="tracking-step-label">' + step.label + '</span>' + timeHtml + '</span>' +
        '</div>';
      }).join('') + '</div>';
    }

    var COURIER_PROVIDER_LABELS = { amazon_shipping: 'Amazon Shipping', delhivery: 'Delhivery' };
    var PREPARING_MESSAGE = '<p>Preparing your order &hearts;</p><p class="account-payment-note">Tracking information will appear here once your order has been shipped.</p>';
    // Customer-facing wording for each normalized_status — deliberately different from the
    // generic statusLabel() auto-titlecase used for order_status elsewhere, since courier states
    // read better in the courier's own vocabulary (e.g. "Ready for Pickup", not "Pickup
    // Scheduled"). Falls back to statusLabel() for anything not explicitly listed.
    var COURIER_STATUS_LABELS = {
      shipment_created: 'Preparing for Pickup', pickup_scheduled: 'Ready for Pickup', picked_up: 'Picked Up',
      in_transit: 'In Transit', out_for_delivery: 'Out for Delivery', delivered: 'Delivered',
      delivery_failed: 'Delivery Attempt Failed', returned: 'Return to Origin', cancelled: 'Cancelled'
    };
    function courierStatusLabel(normalized) { return COURIER_STATUS_LABELS[normalized] || statusLabel(normalized); }
    // States where a real AWB exists but the courier hasn't actually collected the parcel yet —
    // must never be described as "Shipped".
    var PRE_PICKUP_STATUSES = ['shipment_created', 'pickup_scheduled'];

    function shippingSectionHtml(shipment) {
      if (!shipment) return PREPARING_MESSAGE;

      if (COURIER_PROVIDER_LABELS[shipment.provider]) {
        if (!shipment.provider_shipment_id) {
          // A shipment attempt exists but the courier hasn't confirmed one yet (e.g. still
          // being created, or the last attempt failed) — never show a technical API error here.
          return PREPARING_MESSAGE;
        }
        var isPrePickup = PRE_PICKUP_STATUSES.indexOf(shipment.normalized_status) !== -1;
        // "Latest Update" is the most recent real scan/status-change event the courier reported
        // (shipment_events, synced server-side) — never fabricated client-side.
        var events = shipment.shipment_events || [];
        var latestEvent = events.length
          ? events.slice().sort(function (a, b) { return new Date(b.event_time || 0) - new Date(a.event_time || 0); })[0]
          : null;
        // BUG FIX: this used to say "Shipped with <Provider>" unconditionally the moment an AWB
        // existed — wrong, an AWB existing just means the shipment was created, not that the
        // courier has actually collected the parcel. Never say "shipped" or "tracking
        // unavailable" here when a real AWB already exists — the pre-pickup state gets its own
        // honest heading + explanatory message instead.
        return (isPrePickup
            ? '<p>Shipping Partner: <strong>' + COURIER_PROVIDER_LABELS[shipment.provider] + '</strong></p>'
            : '<p>Shipped with <strong>' + COURIER_PROVIDER_LABELS[shipment.provider] + '</strong></p>') +
          '<p>AWB: <strong>' + (shipment.tracking_id ? escapeHtml(shipment.tracking_id) : 'Unavailable') + '</strong></p>' +
          '<p>Current Status: <strong><span class="badge badge-' + escapeHtml(shipment.normalized_status) + '">' + courierStatusLabel(shipment.normalized_status) + '</span></strong></p>' +
          (shipment.pickup_status ? '<p>Pickup Status: <strong>' + escapeHtml(statusLabel(shipment.pickup_status)) + '</strong></p>' : '') +
          // Real Delhivery ETA only — never a guessed "2 days"/"tomorrow". Says so plainly when
          // the provider hasn't supplied one yet, instead of just omitting the line.
          '<p>Estimated Delivery: <strong>' + (shipment.estimated_delivery ? formatDate(shipment.estimated_delivery) : 'Not available yet') + '</strong></p>' +
          (shipment.last_tracking_sync_at ? '<p>Last Updated: <strong>' + formatDateTime(shipment.last_tracking_sync_at) + '</strong></p>' : '') +
          (isPrePickup
            ? '<p class="account-payment-note">Your shipment has been created with ' + COURIER_PROVIDER_LABELS[shipment.provider] + '. Pickup will be scheduled soon.</p>'
            : (latestEvent && latestEvent.description ? '<p>Latest Update: <strong>' + escapeHtml(latestEvent.description) + (latestEvent.event_location ? ' — ' + escapeHtml(latestEvent.event_location) : '') + '</strong></p>' : '')) +
          (shipment.tracking_url ? '<a class="btn btn-sm btn-outline" href="' + escapeHtml(shipment.tracking_url) + '" target="_blank" rel="noopener">Track with ' + COURIER_PROVIDER_LABELS[shipment.provider] + '</a>' : '');
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
        '<div class="address-card-head"><strong>' + escapeHtml(a.label || 'Home') + '</strong>' + (a.is_default ? '<span class="badge badge-active">Default</span>' : '') + '</div>' +
        '<p>' + escapeHtml(a.line1) + (a.line2 ? ', ' + escapeHtml(a.line2) : '') + (a.landmark ? ' (near ' + escapeHtml(a.landmark) + ')' : '') +
        '<br>' + escapeHtml(a.city) + (a.district ? ', ' + escapeHtml(a.district) : '') + ', ' + escapeHtml(a.state) + ' — ' + escapeHtml(a.pincode) + '</p>' +
        '<p class="address-card-contact">' + escapeHtml(a.name) + ' &middot; ' + escapeHtml(a.phone) + '</p>' +
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
          '<div class="form-field"><label for="addrLabel">Address Label</label><select id="addrLabel">' +
            ['Home', 'Work', 'Other'].map(function (l) { return '<option value="' + l + '">' + l + '</option>'; }).join('') +
          '</select></div>' +
          field('addrLine1', 'House / Building', 'text') + field('addrLine2', 'Street / Area (optional)', 'text') +
          field('addrLandmark', 'Landmark (optional)', 'text') +
          '<div class="form-row">' + field('addrCity', 'City', 'text') + field('addrDistrict', 'District (optional)', 'text') + '</div>' +
          '<div class="form-row">' + field('addrState', 'State', 'text') + field('addrPincode', 'PIN Code', 'text') + '</div>' +
          '<p class="account-payment-note" style="margin:14px 0 4px;">Recipient (only needed if different from your account)</p>' +
          field('addrName', 'Full Name', 'text') + field('addrPhone', 'Phone', 'tel') +
          '<div class="toggle-row" style="display:flex;align-items:center;gap:8px;margin:10px 0;"><input type="checkbox" id="addrDefault"><label for="addrDefault">Set as default address</label></div>' +
          '<p class="account-submit-feedback" id="addressFormFeedback"></p>' +
          '<button type="submit" class="btn btn-primary btn-block">' + (address ? 'Save Changes' : 'Add Address') + '</button>' +
        '</form>';

      function field(id, label, type) { return '<div class="form-field"><label for="' + id + '">' + label + '</label><input type="' + type + '" id="' + id + '"></div>'; }

      // Recipient defaults to the account holder's own name/phone unless editing an address that
      // already has its own — never forced, just a sane starting point (spec #9/#10).
      var user = SessionService.getUser();
      document.getElementById('addrName').value = (address && address.name) || (user && user.name) || '';
      document.getElementById('addrPhone').value = (address && address.phone) || (user && user.phone) || '';
      document.getElementById('addrLabel').value = (address && address.label) || 'Home';

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
          label: document.getElementById('addrLabel').value,
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
      ConfirmModal.open({
        title: 'Sign out?',
        message: 'Are you sure you want to sign out of your You & Me account?',
        confirmLabel: 'Sign Out',
        cancelLabel: 'Stay Signed In',
        // SessionService.logout() only ever calls supabase.auth.signOut() + clears the in-memory
        // session — it never touches CartService/WishlistService (both their own separate
        // localStorage-backed stores), so cart and wishlist survive sign-out exactly as before.
        onConfirm: function () {
          SessionService.logout().then(function () { window.location.href = BASE_PATH + '/'; });
        }
      });
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

    function closeDrawer() {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeDrawer);
    });

    // Search/Wishlist/Account/Cart triggers inside the drawer (hidden from the header itself on
    // mobile — see .header-icon-secondary) — same open() calls as their header-icon
    // counterparts, never a second copy of the underlying logic.
    var mobileSearchBtn = document.getElementById('mobileSearchBtn');
    if (mobileSearchBtn) mobileSearchBtn.addEventListener('click', function () { closeDrawer(); SearchOverlay.open(); });
    var mobileWishlistBtn = document.getElementById('mobileWishlistBtn');
    if (mobileWishlistBtn) mobileWishlistBtn.addEventListener('click', function () { closeDrawer(); WishlistDrawer.open(); });
    var mobileAccountBtn = document.getElementById('mobileAccountBtn');
    if (mobileAccountBtn) mobileAccountBtn.addEventListener('click', function () {
      closeDrawer();
      // Same logic as the header Account icon: straight to the dashboard if already signed in.
      if (SessionService.getUser()) { window.location.href = BASE_PATH + '/account'; }
      else AccountPanel.open();
    });
    var mobileCartBtn = document.getElementById('mobileCartBtn');
    if (mobileCartBtn) mobileCartBtn.addEventListener('click', function () { closeDrawer(); CartDrawer.open(); });
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

  /* ---------- 20.5 Seasonal Campaign & Offer ---------- */
  // The ONLY place this site reads campaign data — no second, hardcoded campaign anywhere else.
  // public.live_campaign (a plain view, still governed by RLS — see
  // supabase/migrations/0007_campaigns.sql) already resolves "which campaign, if any, is
  // currently live" server-side: enabled, not paused, and inside its start/end window, computed
  // fresh on every request. If Admin turns a campaign off, pauses it, or its schedule lapses,
  // the very next load of this site simply gets nothing back — no cache to bust, no separate
  // "is it still live" check needed here.
  var CampaignService = (function () {
    function load() {
      return supabaseClient.from('live_campaign').select('*').maybeSingle()
        .then(function (res) { return res.data || null; })
        .then(function (campaign) {
          if (!campaign) return null;
          return Promise.all([
            supabaseClient.from('campaign_content').select('*').eq('campaign_id', campaign.id).maybeSingle().then(function (r) { return r.data || {}; }),
            supabaseClient.from('campaign_media').select('*').eq('campaign_id', campaign.id).maybeSingle().then(function (r) { return r.data || {}; }),
            supabaseClient.from('campaign_products').select('*').eq('campaign_id', campaign.id).order('sort_order').then(function (r) { return r.data || []; })
          ]).then(function (parts) {
            return { campaign: campaign, content: parts[0], media: parts[1], products: parts[2] };
          });
        })
        .catch(function () { return null; }); // a campaigns table not yet migrated, or any read hiccup, just means "no campaign" — never breaks the normal homepage.
    }
    return { load: load };
  })();

  var CAMPAIGN_CTA_HREF = {
    new_arrivals: function () { return '#new-arrivals'; },
    all_products: function () { return '#all'; },
    category: function (v) { return '#kids?category=' + encodeURIComponent(v || ''); },
    collection: function (v) { return '#shop-by-collection'; },
    product: function (v) { return '#'; }, // opened via JS (ProductModal) below, not a plain href
    custom: function (v) { return v || '#'; }
  };
  function campaignCtaAttrs(targetType, targetValue) {
    if (targetType === 'product' && targetValue) return 'data-open-product="' + escapeHtml(targetValue) + '"';
    var hrefFn = CAMPAIGN_CTA_HREF[targetType] || CAMPAIGN_CTA_HREF.custom;
    return 'href="' + escapeHtml(hrefFn(targetValue)) + '"';
  }

  function renderAnnouncementBar(content) {
    var bar = document.querySelector('.announcement-bar');
    if (!bar) return;
    if (!content || !content.announcement_enabled || !content.announcement_text) {
      bar.hidden = false; // restore the real, non-fabricated default bar (Free Shipping) — never left blank.
      bar.removeAttribute('style');
      bar.classList.remove('campaign-announcement');
      var p = bar.querySelector('p');
      if (p && bar.dataset.campaignOverride) { bar.innerHTML = bar.dataset.originalHtml || bar.innerHTML; delete bar.dataset.campaignOverride; }
      return;
    }
    if (!bar.dataset.campaignOverride) { bar.dataset.originalHtml = bar.innerHTML; bar.dataset.campaignOverride = '1'; }
    bar.classList.add('campaign-announcement');
    if (content.announcement_bg_color) bar.style.background = content.announcement_bg_color;
    if (content.announcement_text_color) bar.style.color = content.announcement_text_color;
    var animClass = content.announcement_animation === 'scrolling' ? 'announcement-scroll' : content.announcement_animation === 'fade' ? 'announcement-fade' : '';
    bar.innerHTML = '<p class="' + animClass + '">' + escapeHtml(content.announcement_text) +
      (content.announcement_cta_text ? ' <a href="' + escapeHtml(content.announcement_link || '#') + '" style="text-decoration:underline;font-weight:700;">' + escapeHtml(content.announcement_cta_text) + '</a>' : '') +
      '</p>';
  }

  function bannerInnerHtml(media, content) {
    var isMobile = window.matchMedia('(max-width: 720px)').matches;
    // Mobile-specific asset if provided; otherwise the desktop asset responsively — never
    // distorted, never a separately-cropped desktop-only frame forced onto a phone screen.
    var url = (isMobile && media.mobile_url) || media.desktop_url;
    var ctaAttrs = campaignCtaAttrs(media.text_cta_target_type, media.text_cta_target_value);

    if (media.banner_type === 'video' && url) {
      return '<video class="campaign-banner-media" src="' + escapeHtml(url) + '"' +
        (media.poster_url ? ' poster="' + escapeHtml(media.poster_url) + '"' : '') +
        (media.video_autoplay !== false ? ' autoplay' : '') + (media.video_loop !== false ? ' loop' : '') +
        (media.video_muted !== false ? ' muted' : '') + (media.video_controls ? ' controls' : '') +
        ' playsinline></video>';
    }
    if (url && media.banner_type !== 'animated_text') {
      // GIFs need no special handling — an <img> plays them natively, no extra library needed.
      var textOverlay = media.banner_type === 'image_text' && (media.text_headline || media.text_cta_text)
        ? '<div class="campaign-banner-overlay campaign-banner-align-' + escapeHtml(media.text_align || 'center') + '">' +
            (media.text_headline ? '<h2>' + escapeHtml(media.text_headline) + '</h2>' : '') +
            (media.text_subheadline ? '<p>' + escapeHtml(media.text_subheadline) + '</p>' : '') +
            (media.text_cta_text ? '<a class="btn btn-primary" ' + ctaAttrs + '>' + escapeHtml(media.text_cta_text) + '</a>' : '') +
          '</div>'
        : '';
      return '<img class="campaign-banner-media" src="' + escapeHtml(url) + '" alt="' + escapeHtml(media.text_headline || 'Campaign banner') + '">' + textOverlay;
    }
    // Animated text mode — no image/video at all.
    var animClass = 'campaign-text-anim-' + (media.text_animation || 'fade');
    return '<div class="campaign-banner-text ' + animClass + ' campaign-banner-align-' + escapeHtml(media.text_align || 'center') + '"' +
      (media.text_bg_image_url ? ' style="background-image:url(\'' + escapeHtml(media.text_bg_image_url) + '\');"' : '') + '>' +
      (media.text_headline ? '<h2>' + escapeHtml(media.text_headline) + '</h2>' : '') +
      (media.text_subheadline ? '<p class="campaign-subheadline">' + escapeHtml(media.text_subheadline) + '</p>' : '') +
      (media.text_description ? '<p class="campaign-description">' + escapeHtml(media.text_description) + '</p>' : '') +
      (media.text_cta_text ? '<a class="btn btn-primary" ' + ctaAttrs + '>' + escapeHtml(media.text_cta_text) + '</a>' : '') +
    '</div>';
  }

  var CAMPAIGN_BANNER_ID = 'campaignBanner';
  function removeCampaignBanner() {
    var el = document.getElementById(CAMPAIGN_BANNER_ID);
    if (el) el.remove();
    var hero = document.querySelector('.hero');
    if (hero) hero.hidden = false; // undo a previous "replace_hero" placement, if any.
  }
  function renderBanner(media, content) {
    removeCampaignBanner();
    if (!media || !media.banner_enabled) return;
    var html = bannerInnerHtml(media, content);
    if (!html) return;
    var wrapped = '<div class="campaign-banner campaign-banner-' + escapeHtml(media.banner_type || 'image') + '" id="' + CAMPAIGN_BANNER_ID + '">' + html + '</div>';

    var home = document.getElementById('viewHome');
    var hero = document.querySelector('.hero');
    var featured = document.getElementById('featured-products');
    var footer = document.querySelector('.site-footer');
    var placement = media.placement || 'above_hero';

    if (placement === 'replace_hero' && hero) {
      hero.hidden = true;
      hero.insertAdjacentHTML('beforebegin', wrapped);
    } else if (placement === 'below_hero' && hero) {
      hero.insertAdjacentHTML('afterend', wrapped);
    } else if (placement === 'before_featured' && featured) {
      featured.insertAdjacentHTML('beforebegin', wrapped);
    } else if (placement === 'before_footer' && footer) {
      footer.insertAdjacentHTML('beforebegin', wrapped);
    } else if (hero) {
      // above_hero / below_header / top_announcement all land here — right after the header,
      // immediately before the hero, which covers the recommended default and every placement
      // that doesn't have a more specific anchor point above.
      hero.insertAdjacentHTML('beforebegin', wrapped);
    } else if (home) {
      home.insertAdjacentHTML('afterbegin', wrapped);
    }

    if ((media.text_cta_target_type || (media.banner_type === 'image_text' && media.text_cta_target_type)) === 'product') {
      var el = document.getElementById(CAMPAIGN_BANNER_ID);
      if (el) el.querySelectorAll('[data-open-product]').forEach(function (a) {
        a.addEventListener('click', function (e) { e.preventDefault(); ProductModal.open(Number(a.dataset.openProduct)); });
      });
    }
  }

  var CAMPAIGN_OFFER_ID = 'campaignOfferSection';
  function removeCampaignOffer() {
    var el = document.getElementById(CAMPAIGN_OFFER_ID);
    if (el) el.remove();
  }
  function renderOfferSection(content, campaignProducts) {
    removeCampaignOffer();
    if (!content || !content.offer_section_enabled) return;

    // Only real, currently-catalogued products — a campaign_products row referencing a product
    // that's since been removed/deactivated is simply skipped, never a fabricated placeholder.
    var products = campaignProducts
      .map(function (cp) {
        var p = PRODUCTS.filter(function (x) { return x.id === cp.product_id; })[0];
        if (!p) return null;
        // Campaign pricing is shown here as the advertised offer price — Add to Cart/Buy Now
        // still use the product's own real price (never silently under-charge at checkout;
        // wiring campaign pricing into order totals is a deliberate follow-up, not done here).
        var displayPrice = cp.campaign_price != null ? cp.campaign_price
          : cp.discount_percentage != null ? Math.round(p.price * (1 - cp.discount_percentage / 100))
          : p.price;
        var clone = Object.assign({}, p);
        if (displayPrice !== p.price) { clone.price = displayPrice; clone.oldPrice = p.price; }
        return clone;
      })
      .filter(Boolean);
    if (!products.length) return;

    var featured = document.getElementById('featured-products');
    var html = '<section class="section campaign-offer-section" id="' + CAMPAIGN_OFFER_ID + '">' +
      '<div class="section-heading">' +
        (content.offer_label ? '<span class="campaign-offer-label">' + escapeHtml(content.offer_label) + '</span>' : '') +
        (content.offer_heading ? '<h2>' + escapeHtml(content.offer_heading) + '</h2>' : '') +
        (content.offer_description ? '<p>' + escapeHtml(content.offer_description) + '</p>' : '') +
        (content.offer_coupon_code ? '<p class="campaign-coupon">Use code <strong>' + escapeHtml(content.offer_coupon_code) + '</strong></p>' : '') +
      '</div>' +
      '<div class="product-grid">' + products.map(renderProductCard).join('') + '</div>' +
      (content.offer_cta_text ? '<div style="text-align:center;margin-top:24px;"><a class="btn btn-outline" ' + campaignCtaAttrs(content.offer_cta_target_type, content.offer_cta_target_value) + '>' + escapeHtml(content.offer_cta_text) + '</a></div>' : '') +
    '</section>';

    if (featured) featured.insertAdjacentHTML('beforebegin', html);
    else { var home = document.getElementById('viewHome'); if (home) home.insertAdjacentHTML('beforeend', html); }

    var section = document.getElementById(CAMPAIGN_OFFER_ID);
    if (section) {
      section.querySelectorAll('[data-wishlist]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var active = WishlistService.toggle(btn.dataset.wishlist);
          document.querySelectorAll('[data-wishlist="' + btn.dataset.wishlist + '"]').forEach(function (b) { b.classList.toggle('active', active); b.innerHTML = heartIconSVG(active); });
        });
      });
    }
  }

  function renderCampaign(data) {
    if (!data) { renderAnnouncementBar(null); removeCampaignBanner(); removeCampaignOffer(); return; }
    renderAnnouncementBar(data.content);
    renderBanner(data.media, data.content);
    renderOfferSection(data.content, data.products);
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
    DeliveryLocation.init();
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

      // The one and only campaign read for the whole homepage — see CampaignService above.
      // Runs after PRODUCTS is loaded (the offer section needs real product data), but never
      // blocks the rest of the page: no campaign, or any read failure, just renders nothing.
      CampaignService.load().then(renderCampaign).catch(function () {});

      Router.init();

      // /login and /account are real, bookmarkable URLs (this same index.html serves both,
      // via the GitHub Pages 404.html SPA fallback) — on load, check the session once and
      // open the right view. An admin who lands on either is sent straight to /admin. This
      // runs strictly after Router.init() above (not in parallel with it) because the
      // router's own initial-route handling closes every open panel — opening the account
      // panel first and letting the router run after would just have it slammed shut again.
      SessionService.check().then(function (user) {
        var path = window.location.pathname;
        var loginPath = BASE_PATH + '/login', accountPath = BASE_PATH + '/account', resetPasswordPath = BASE_PATH + '/reset-password', paymentResultPath = BASE_PATH + '/payment-result';

        // Cashfree redirects the customer back here after checkout (see PaymentFlow.startCheckout's
        // return_url). Authoritative status is fetched server-side inside PaymentResultPage — the
        // URL landing here is never itself treated as proof of anything.
        if (path === paymentResultPath) {
          var qs = new URLSearchParams(window.location.search);
          var resultOrderId = Number(qs.get('order_id'));
          PaymentResultPage.open(resultOrderId);
          return;
        }

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
