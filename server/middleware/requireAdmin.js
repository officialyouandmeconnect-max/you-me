// The one and only gate that matters: every admin API route below checks the server-side
// session (set only after a verified bcrypt password check in routes/auth.js). There is no
// frontend-only "if isAdmin" check anywhere — a request without a valid session gets a 401
// no matter what the client claims.
module.exports = function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.status(401).json({ error: 'Not authenticated' });
};
