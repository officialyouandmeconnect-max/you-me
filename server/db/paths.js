// Single place that decides where the SQLite file and uploaded images live. Locally these
// default to folders inside this project; in production (Render) they're pointed at the
// mounted persistent disk via env vars, set in render.yaml, so data survives deploys/restarts.
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

module.exports = { DB_PATH, UPLOAD_DIR };
