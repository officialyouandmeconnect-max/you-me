// You & Me store server: serves the customer site AND the admin panel from this one process,
// on this one origin — there is no separate admin deployment. /admin/* is just a protected
// section of the same site, gated by the same session/role system as customer login.
const path = require('path');
const express = require('express');
const session = require('express-session');

require('./db/init'); // ensures schema exists before anything else touches the db

const app = express();
const PORT = process.env.PORT || 4300;
const SITE_DIR = path.join(__dirname, '..', 'you-and-me-site');
const ADMIN_DIR = path.join(__dirname, 'public', 'admin');

app.use(express.json({ limit: '1mb' }));

app.use(session({
  name: 'ym_sid',
  secret: process.env.SESSION_SECRET || 'you-and-me-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000 // 12 hours
  }
}));

const requireAdmin = require('./middleware/requireAdmin');

// ---- Auth (shared by customers and admins alike) ----
app.use('/api/auth', require('./routes/auth'));

// ---- Public API (consumed by the customer site) ----
app.use('/api/products', require('./routes/productsPublic'));
app.use('/api/orders', require('./routes/ordersPublic'));

// ---- Admin API — every route below re-checks role === 'admin' server-side on every request.
// A customer's own valid session does NOT pass this; only role is ever trusted, never anything
// the client sends.
app.use('/api/admin/products', requireAdmin, require('./routes/adminProducts'));
app.use('/api/admin/orders', requireAdmin, require('./routes/adminOrders'));
app.use('/api/admin/dashboard', requireAdmin, require('./routes/adminDashboard'));
app.use('/api/admin/customers', requireAdmin, require('./routes/adminCustomers'));
app.use('/api/admin/media', requireAdmin, require('./routes/adminMedia'));
app.use('/api/admin/shipments', requireAdmin, require('./routes/adminShipments'));
app.use('/api/admin/upload', requireAdmin, require('./routes/upload'));

// ---- Static assets ----
app.use('/uploads', express.static(require('./db/paths').UPLOAD_DIR));
// index: false is critical here — without it, express.static auto-serves index.html for any
// /admin/ or /admin/<route> request itself, bypassing the session/role check below entirely.
// This must only ever serve the named asset files (admin.js, admin.css); the HTML always goes
// through the explicit /admin route handler further down.
app.use('/admin', express.static(ADMIN_DIR, { index: false }));
app.use('/', express.static(SITE_DIR));

// ---- Admin panel routing (/admin, /admin/dashboard, /admin/products, ...) ----
// Server-side gate first: a non-admin hitting any /admin/* path is redirected to /login before
// a single byte of the admin shell is sent — the admin panel is never even reachable by a
// customer, not just hidden from them client-side.
app.get(['/admin', '/admin/*'], (req, res) => {
  if (!req.session || !req.session.userId) return res.redirect('/login');
  if (req.session.role !== 'admin') return res.redirect('/login');
  res.sendFile(path.join(ADMIN_DIR, 'index.html'));
});

// ---- Customer site routing: /login and /account are views inside the same single-page
// customer site, not separate files — always serve the site shell for them and let the
// frontend render the right thing based on the URL and current session.
app.get(['/login', '/account'], (req, res) => {
  res.sendFile(path.join(SITE_DIR, 'index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log('You & Me server running on http://localhost:' + PORT);
  console.log('  Customer site: http://localhost:' + PORT + '/');
  console.log('  Login:         http://localhost:' + PORT + '/login');
  console.log('  Admin panel:   http://localhost:' + PORT + '/admin  (redirects to /login unless already an admin)');
});
