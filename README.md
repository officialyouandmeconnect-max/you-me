# You & Me

A pastel, family/kids/couples clothing store — a customer-facing site plus an admin panel and
order-management backend.

## Structure

- **Customer site** (`index.html`, `script.js`, `style.css`, `assets/`) — the storefront: home,
  Kids Wear, product details, cart, wishlist, search, and WhatsApp checkout. Plain HTML/CSS/JS,
  no build step. Can be opened as static files, but product data and checkout require the
  server below to be running.
- **`server/`** — the Express API + SQLite database + admin panel (`/admin`) that the customer
  site talks to for products, orders, inventory and everything else. See
  [`server/README.md`](server/README.md) for setup.

## Running everything locally

```bash
cd server
npm install
npm run seed   # one-time: creates your admin login + the starting product catalog
npm start
```

Then open `http://localhost:4300/` for the store and `http://localhost:4300/admin` for the
admin panel (the server serves the customer site itself, so there's nothing else to start).
