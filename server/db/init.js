// Database connection + schema bootstrap. Uses Node's built-in node:sqlite (no native
// module compilation needed — ships with the Node runtime itself).
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { DB_PATH } = require('./paths');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// One-time migration: if this database still has the old single-admin `admin_users` row and
// nothing in `users` yet, carry it over as the first admin account so existing installs don't
// lose their login when upgrading to the unified users table.
(function migrateLegacyAdmin() {
  var userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount > 0) return;
  var legacy = db.prepare('SELECT * FROM admin_users LIMIT 1').get();
  if (!legacy) return;
  var email = /@/.test(legacy.username) ? legacy.username : legacy.username + '@youandme.in';
  db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, 'Admin', 'admin')")
    .run(email, legacy.password_hash);
  console.log('Migrated legacy admin_users row into users as ' + email + ' (role: admin).');
})();

module.exports = db;
