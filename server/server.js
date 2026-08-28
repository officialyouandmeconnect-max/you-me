// You & Me store server: serves the existing customer site as static files, exposes a JSON
// API (public product/order endpoints + session-protected admin endpoints), and serves the
// admin panel SPA shell. Completely separate process from the parent project's server.js.
const path = require('path');
const express = require('express');
const session = require('express-session');

require('./db/init'); // ensures schema exists before anything else touches the db

const app = express();
const PORT = process.env.PORT || 4300;

app.use(express.json({ limit: '1mb' }));

app.use(session({
  name: 'ym_admin_sid',
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

// ---- Public API (consumed by the customer site) ----
app.use('/api/products', require('./routes/productsPublic'));
app.use('/api/orders', require('./routes/ordersPublic'));
app.use('/api/admin', require('./routes/auth')); // login/logout/session — auth itself isn't behind requireAdmin

// ---- Admin API (every route below requires a valid session) ----
app.use('/api/admin/products', requireAdmin, require('./routes/adminProducts'));
app.use('/api/admin/orders', requireAdmin, require('./routes/adminOrders'));
app.use('/api/admin/dashboard', requireAdmin, require('./routes/adminDashboard'));
app.use('/api/admin/customers', requireAdmin, require('./routes/adminCustomers'));
app.use('/api/admin/media', requireAdmin, require('./routes/adminMedia'));
app.use('/api/admin/shipments', requireAdmin, require('./routes/adminShipments'));
app.use('/api/admin/upload', requireAdmin, require('./routes/upload'));

// ---- Static file serving ----
app.use('/uploads', express.static(require('./db/paths').UPLOAD_DIR));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.use('/', express.static(path.join(__dirname, '..', 'you-and-me-site')));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log('You & Me server running on http://localhost:' + PORT);
  console.log('  Customer site: http://localhost:' + PORT + '/');
  console.log('  Admin panel:   http://localhost:' + PORT + '/admin');
});
