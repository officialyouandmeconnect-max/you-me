// The one and only gate that matters: every admin API route below checks the server-side
// session's role — set only after a verified bcrypt password check in routes/auth.js, against
// the `users` table. A logged-in customer has a valid session too, but req.session.role will
// be 'customer', so this still returns 403 for them. There is no frontend-only "if isAdmin"
// check anywhere in this codebase that this depends on.
module.exports = function requireAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.role === 'admin') return next();
  if (req.session && req.session.userId) return res.status(403).json({ error: 'You do not have permission to access this.' });
  return res.status(401).json({ error: 'Not authenticated' });
};
