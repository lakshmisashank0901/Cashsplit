# CashSplit

Track shared expenses between friends and see who owes whom.

## Use

Open `index.html` in a browser. No install or build needed.

Without Supabase set up, data is saved in that browser only. With Supabase set up
(below), you sign in and the same data is available on every device.

1. Add your friends.
2. Add each expense: what it was, the amount, who paid, and who it's split between
   (equally, by exact amounts, or by percentages).
3. **Settle up** lists the fewest payments needed to clear every debt.
   Click **Record payment** when someone pays back.

The page shows four tables:

- **Settle up**: who pays whom, and how much.
- **Balances**: for each person, what they paid, their share, payments sent and
  received, and their net balance (positive means they're owed money).
- **Expenses**: one row per expense, with a column per person showing their share.
- **Payments**: the settle-up payments recorded so far.

## Syncing across devices (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/schema.sql`, then `supabase/hardening.sql`.
3. Copy the project URL and anon (public) key from **Project Settings → API** into `config.js`.
4. Open the app, choose **Create an account**, and confirm your email.
5. In **Authentication → Sign In / Providers**, turn off **Allow new users to sign up**
   so nobody else can create an account on your project.

The anon key is safe to publish: row level security only lets a signed-in user
read and write their own rows.

## Security

- **Database:** row level security limits every row to its owner, and `hardening.sql`
  removes all table access for anonymous visitors as a second layer.
- **Sign-ups** are disabled after the owner's account exists.
- **Browser:** `vercel.json` sets a strict Content Security Policy (scripts only from this site,
  network calls only to the Supabase project) and blocks the site from being framed.
- **No third-party scripts:** supabase-js is served from `vendor/`, copied from the npm
  package (version 2.45.4, integrity checked against the npm registry).
- **Data validation:** everything loaded from the database or cache is validated in
  `store.js` before it reaches the page, and all text is HTML-escaped when rendered.

If you change the Supabase project, update its URL in both `config.js` and the
`connect-src` part of the Content-Security-Policy in `vercel.json`.

## Install as an app

CashSplit is installable (PWA). On iPhone, open the site in Safari → Share → **Add to Home Screen**.
On Android, Chrome's ⋮ menu → **Install app**. On a laptop, use the install icon in Chrome's
address bar. The logo lives in `icons/` (`logo.svg` plus PNG sizes); `sw.js` caches the app's files
so it opens without a connection, but always fetches the latest version when online.

## Deploying

It's a static site, so any static host works (Vercel, Netlify, GitHub Pages, Cloudflare Pages).
Upload the folder as-is; there's no build step. After deploying, set your site's URL as the
**Site URL** in Supabase under **Authentication → URL Configuration** so confirmation emails
link back to it.

## Tests

```sh
node --test
```
