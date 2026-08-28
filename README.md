# You & Me

A pastel, family/kids/couples clothing store — a customer-facing site plus an admin panel and
order-management backend.

## Structure

- **Customer site** (`index.html`, `script.js`, `style.css`, `assets/`) — the storefront: home,
  Kids Wear, product details, cart, wishlist, search, login/account, and WhatsApp checkout.
  Plain HTML/CSS/JS, no build step. Can be opened as static files, but product data, checkout
  and login all require the server below to be running.
- **`server/`** — the Express API + SQLite database that the customer site talks to for
  products, orders, and authentication. It also serves `/admin` — the admin panel is a
  protected *section of this same site*, not a separate app: same domain, same login form,
  same server. Only an account with `role = 'admin'` in the database can reach it — see
  [`server/README.md`](server/README.md) for how that's enforced.

## Running everything locally

```bash
cd server
npm install
npm run seed   # one-time: creates your admin login + the starting product catalog
npm start
```

Then open `http://localhost:4300/` for the store, `http://localhost:4300/login` to sign in
(customers and admins use the exact same form), and `http://localhost:4300/admin` for the
admin panel once logged in as an admin account (the server serves the customer site itself, so
there's nothing else to start).

## Live hosting

The store now needs a real running server (products, cart and checkout all go through the
API — there's no more hardcoded product data in the frontend). **GitHub Pages can't serve
this** — it's static-only and has no way to run `server/`. Deploy `server/` to a host that
runs Node (see [`server/README.md`](server/README.md) for a Render Blueprint config already
included as `render.yaml`); that deployment serves the storefront, the API, and `/admin` all
from one URL, and should become the actual live link — GitHub Pages should not be relied on
as the live site anymore.
