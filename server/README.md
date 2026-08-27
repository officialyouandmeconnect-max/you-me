# You & Me — Store Server (API + Admin Panel)

Backend for the You & Me customer site: a JSON API for products/orders, plus an admin panel
at `/admin` for managing products, orders, inventory, customers, shipping and media.

- **Database:** SQLite via Node's built-in `node:sqlite` (no native module to compile).
- **Auth:** server-side session (bcrypt-hashed password), not a frontend-only gate.
- **Images:** uploaded files are stored on disk under `uploads/` and served statically; the
  database only ever stores the URL, never base64.
- **Orders:** saved to the database first (with server-recomputed prices and live stock checks)
  — the WhatsApp message is generated *after* the order already exists, never before.

## Setup

```bash
cd server
npm install
npm run seed    # one-time: creates the admin login + migrates the original 31 products
npm start        # http://localhost:4300
```

The seed script prints a generated admin username/password **once** — save it immediately.
To set your own instead, run it with env vars:

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=your-password npm run seed
```

- Customer site: `http://localhost:4300/` (serves `../you-and-me-site` — the static frontend
  in the repo root, unchanged)
- Admin panel: `http://localhost:4300/admin`

## Before deploying this for real

- Set `SESSION_SECRET` to a long random value (the default in `server.js` is a dev placeholder).
- Set `PORT` if 4300 isn't available on your host.
- `uploads/` needs to be a persistent, writable directory on whatever you deploy to — an
  ephemeral filesystem (most serverless hosts) will lose uploaded images on redeploy.
- Back up `db/data.sqlite` — it's the single source of truth for products, orders and stock.

## Project layout

```
server.js              Express app: wires static files, public API, admin API (session-gated)
db/schema.sql           Table definitions
db/init.js               Opens/creates the SQLite database from schema.sql
db/seed.js                One-time admin + product seed (idempotent — safe to re-run)
db/helpers.js             Shared row -> JSON serializers (products, orders)
middleware/requireAdmin.js   The one gate every /api/admin/* route passes through
routes/                 One file per resource (public: products, orders — admin: products,
                         orders, dashboard, customers, media, shipments, upload)
public/admin/            The admin panel itself (plain HTML/CSS/JS, no build step)
uploads/                 Product photos uploaded from the admin panel
```
