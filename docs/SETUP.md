# Setting up Pump & Solar Stock

This gets the app running on your own free web address, with sign-in for your team. It takes about 30–45 minutes, once.

You need:
- Your **Supabase** account (the database and sign-in).
- Your **GitHub** account (where the app's code lives: `Naval0077/claude-inventory`).
- A free **Cloudflare** account (puts the app on the internet).

---

## 1. Create the database (Supabase)

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and click **New project**.
   - Name: `pump-solar-stock` (any name is fine).
   - Database password: make a strong one and save it somewhere safe. The app doesn't need it, but you will if you ever call Supabase support.
   - Region: **South Asia (Mumbai)**, closest to you, so it's fastest.
   - Plan: **Free** is enough to start.
2. Wait until the project says it's ready (a minute or two).
3. Open **SQL Editor** (left menu) → **New query**.
4. Open the file [`supabase/schema.sql`](../supabase/schema.sql) in this repository, copy **all** of it, paste it into the editor, and click **Run**. You should see "Success. No rows returned."
5. Open **Project Settings → API** and keep this page open. You need two values from it in step 2:
   - **Project URL**, like `https://abcdefghijk.supabase.co`
   - **anon public** key, a long text starting with `eyJ…`

   The anon key is meant to be public. Your data is protected by sign-in and the role rules from `schema.sql`. Never share the **service_role** key.

## 2. Connect the app to your database

1. On GitHub, open the repository, go to the `app` folder, and open `config.js`.
2. Click the pencil icon (**Edit**).
3. Replace the two placeholder values with yours from step 1.5:
   ```js
   window.APP_CONFIG = {
     supabaseUrl: "https://abcdefghijk.supabase.co",
     supabaseAnonKey: "eyJhbGciOi…your whole anon key…",
   };
   ```
4. Click **Commit changes**.

## 3. Put the app online (Cloudflare Pages)

1. Sign up or sign in at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Go to **Workers & Pages → Create → Pages → Connect to Git**, and allow Cloudflare to see the `claude-inventory` repository.
3. Settings:
   - **Production branch:** `main`
   - **Framework preset:** None
   - **Build command:** leave empty
   - **Build output directory:** `app`
4. Click **Save and Deploy**. After a minute you get an address like `https://pump-solar-stock.pages.dev`. That's your app.

Every time a change is merged into `main`, Cloudflare updates the app automatically within a minute or two.

## 4. Tell Supabase your app's address

So sign-up and password-reset emails link to your app:

1. In Supabase, open **Authentication → URL Configuration**.
2. **Site URL:** your app address, for example `https://pump-solar-stock.pages.dev`
3. **Redirect URLs:** add the same address.
4. Save.

## 5. Create your admin account

1. Open your app address.
2. Choose **Create an account**, and enter your name, email and a password.
3. Open the confirmation email and click the link.
4. Sign in. **The first account becomes an admin automatically.**

## 6. Bring in your current data

1. Sign in as admin → **Settings** → **Backup** → **Restore from a backup file**.
2. Choose `stock-backup-from-claude-2026-09-29.json` (the file sent with these instructions).
3. Check the numbers, then click **Restore now**.

You should see 76 products, your supplier and your two goods receipts. If you kept using the claude.ai page after this backup was made, ask for a fresh export first.

## 7. Add your team

For each of the other 4 people:

1. Send them the app address and ask them to choose **Create an account**.
2. When they've confirmed their email, go to **Settings → Team**. They'll show as "No access yet".
3. Pick their role:

| Role | Who | Can do |
|---|---|---|
| **Admin** | You and one more | Everything: settings, catalogue, prices, team, backups |
| **Warehouse** | 2 warehouse staff | See stock (no prices), receive goods, scan serials, correct counts |
| **Billing** | 1 billing person | Sales, invoices, e-invoice files, payments, customers and suppliers |

They tap **Check again** on their screen and they're in. There must always be at least one admin; the app won't let you remove the last one.

## 8. Install it on each device

- **Android (Chrome):** open the app address → menu **⋮** → **Install app** (or **Add to Home screen**).
- **iPhone (Safari):** open the app address → **Share** → **Add to Home Screen**.
- **Windows or Mac (Chrome or Edge):** open the app address → click the install icon at the right end of the address bar.

It then opens in its own window like a normal app. On phones, **Scan with camera** asks for camera permission the first time; tap **Allow**.

---

## Keeping it safe

- **Backups:** the free plan has no automatic backups. Once a week, an admin should go to **Settings → Backup → Download backup** and keep the file somewhere safe (Google Drive, email to yourself). The paid Supabase plan (about US$25 a month) adds daily backups.
- **Pausing:** a free project pauses after about a week with no use. Daily use keeps it running. If it ever pauses (for example after a long holiday), open the Supabase dashboard and click **Restore project**.
- **Leaving staff:** set their role to "No access yet" in **Settings → Team**. For a complete removal, delete them in Supabase → **Authentication → Users**.

## Your own web address (optional, later)

Buy a domain (about ₹800–1,500 a year), then in Cloudflare Pages → your project → **Custom domains**, add something like `stock.yourcompany.in`. Update the Site URL and Redirect URLs in step 4 to match.

## Something not working?

| What you see | What to do |
|---|---|
| "Almost ready… isn't connected to a database" | `app/config.js` still has the placeholders (step 2), or Cloudflare hasn't redeployed yet. |
| "Can't load your account" | `schema.sql` wasn't run, or didn't finish (step 1.4). Run it again; it's safe to repeat. |
| Stuck on "Waiting for access" | An admin needs to pick a role in **Settings → Team**. |
| "That email and password don't match" right after signing up | Confirm the email first (check spam). |
| Camera doesn't start | Allow camera access for the site in the phone's browser settings. The camera only works on the `https://` address. |
