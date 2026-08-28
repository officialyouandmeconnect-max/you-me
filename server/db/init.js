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

module.exports = db;
