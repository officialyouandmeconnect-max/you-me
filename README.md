# You & Me

A pastel, family/kids/couples clothing store — a customer-facing site plus an admin panel and
order-management system. Plain HTML/CSS/JS, no build step, no server: [Supabase](https://supabase.com)
(Postgres + Auth + Storage) is the entire backend, and this repo is 100% static files.

## Structure

- **Customer site** (`index.html`, `script.js`, `style.css`, `supabase-client.js`) — the
  storefront: home, Kids Wear, product details, cart, wishlist, search, and WhatsApp checkout.
  Browsing, search, cart and wishlist never require an account; **checkout does** — see below.
- **Customer accounts** (`/login`, `/account`) — email+password or Google Sign-In (Supabase
  Auth), a full "My Account" dashboard (Overview, My Orders with tracking, Addresses, Wishlist,
  Profile). A customer can only ever see their *own* orders/addresses — enforced by Row Level
  Security in `0002_customer_accounts.sql`, not just by the UI.
- **`admin/`** — the admin panel: dashboard, products, orders, customers, inventory, shipping,
  media library. It's a protected *section of this same site*, not a separate app — same
  domain, same login form (`/login`), just gated by `profiles.role = 'admin'`. There is no
  separate admin deployment and no hardcoded admin password anywhere in this code.
- **`supabase/migrations/0001_init.sql`** — the full Postgres schema, Row Level Security
  policies, and the `create_order()` function. Run once in the Supabase SQL Editor for a new
  project.
- **`supabase/migrations/0002_customer_accounts.sql`** — adds customer-owns-their-orders RLS
  policies, the `addresses` table, and makes `create_order()` reject anonymous callers (checkout
  requires sign-in at the database level, not just in the UI). Run once, after 0001.
- **`supabase/README-google-oauth.md`** — the one-time Google Cloud Console + Supabase Dashboard
  setup "Continue with Google" needs (a dashboard step, not something the code can do alone).
- **`supabase/scripts/seed.js`** — one-time setup script (needs the Supabase **service_role**
  key, never committed here) that creates the first admin login and seeds the starting product
  catalog. Run locally, not from the browser.

## How the security model works (no server, still safe)

Every table has [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
enabled. The Supabase **anon key** embedded in `supabase-client.js` is meant to be public — on
its own it grants nothing; what a signed-in user can actually read or write is decided entirely
by the RLS policies in `0001_init.sql`, keyed off `is_admin()` (a `SECURITY DEFINER` function
that checks `profiles.role`). Customers can never write to `orders`, `order_items`, or write to
`products` at all — the only way an order is ever created is through `create_order()`, a
Postgres function that independently re-validates stock and recomputes every price itself,
ignoring anything the client claims. There is no `service_role` key (the one secret that
*bypasses* RLS) anywhere in this repo — it lives only in a local `.env` file used by the seed
script.

## Running locally

No build step, no server — just serve the two folders as static files, e.g.:

```bash
npx serve -l 5055 .          # customer site  → http://localhost:5055
npx serve -l 5056 ./admin    # admin panel    → http://localhost:5056
```

For local testing, serve both from one static server on one port so the customer site's login
and the admin panel share the same origin (and therefore the same Supabase session) — that's
how they behave in production, where they're both under the same domain.

## Live hosting — GitHub Pages

This repo is served by GitHub Pages at **https://officialyouandmeconnect-max.github.io/you-me/**
(Settings → Pages → deploy from `main` / `/`). Because Pages serves this repo at the `/you-me`
subpath rather than a domain root, every root-relative route (`/login`, `/account`, `/admin`,
`/admin/dashboard`, …) is prefixed with `BASE_PATH = '/you-me'`, defined once in
`supabase-client.js` and shared by both `script.js` and `admin.js`. **If you ever point a custom
domain at Pages** (or move to a `<user>.github.io` user/org repo, which serves at the real
root), change `BASE_PATH` back to `''` in both `supabase-client.js` files — the admin sidebar is
generated from `NAV_ITEMS` in `admin.js` at runtime (not hardcoded HTML), so that's the only
place it needs to change; everything else keeps working unmodified.

`404.html` at the repo root is what makes client-side routes like `/you-me/login` or
`/you-me/admin/orders/12` survive a hard refresh or a bookmark — see the comments in that file
and at the top of both `index.html` files for how the redirect-and-restore trick works.

## First-time Supabase setup (new project only)

1. Create a Supabase project, then in **SQL Editor** run `supabase/migrations/0001_init.sql`.
2. Put your project's URL, anon key, and service_role key in `supabase/.env` (service_role key
   only — never commit it, never put it in any frontend file).
3. From `supabase/`, run `npm install` then `node scripts/seed.js` — this creates the first
   admin login (prints the password once) and seeds the product catalog.
4. Update `SUPABASE_URL` / `SUPABASE_ANON_KEY` in both `supabase-client.js` files (root and
   `admin/`) to match your project — the anon key is safe to commit, it's meant to be public.
