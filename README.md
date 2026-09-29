# Pump & Solar Stock

Stock, goods receiving, sales and GST billing for a pump, motor and solar-products business. Runs in any browser and installs as an app on Windows, Mac, Android and iPhone.

- **Stock:** live stock from every delivery, sale and count correction, with serial numbers per unit, reorder alerts and catalogue import from Excel or CSV.
- **Receive:** check factory deliveries against the challan by scanning product codes and serial numbers.
- **Sell:** scan items as they're loaded; the GST invoice (CGST/SGST or IGST) is built from what was scanned, and downloads as a PDF.
- **E-invoice and e-way bill:** creates the IRP upload file, imports the portal's result, and prints the invoice with IRN and QR code plus the e-way bill.
- **Customers and suppliers:** statements, payments, dues and overdue amounts.
- **Scanning:** live phone camera, USB or Bluetooth scanners, or a photo.
- **Team roles:** admin, warehouse (no prices) and billing, enforced by the database.

## Layout

| Path | What it is |
|---|---|
| `app/` | The app: static files, no build step. This folder is what gets deployed. |
| `app/config.js` | Your Supabase project URL and anon key. |
| `app/vendor/` | Bundled libraries (Supabase client, PDF, barcodes, Excel, barcode readers). |
| `supabase/schema.sql` | Database tables, role rules and live-update setup. Run once in Supabase. |
| `docs/SETUP.md` | Step-by-step setup: Supabase, Cloudflare Pages, team, installing. |
| `stock-register.html` | The earlier single-page version that ran on claude.ai. |

Start with **[docs/SETUP.md](docs/SETUP.md)**.

## How it works

The app is plain HTML, CSS and JavaScript served as static files (Cloudflare Pages). Data lives in Supabase (Postgres). Sign-in uses Supabase Auth. Every open device gets changes live through Supabase Realtime.

Business records are stored as JSON documents in one `docs` table, grouped by collection (`products`, `receipts`, `invoices`, `adjustments`, `parties`, `payments`, `settings`). Stock and serial-number status are worked out from the receipts, adjustments and invoices, not stored as counters, so two people working at once can't lose an update. Row-level security in `schema.sql` decides what each role may read and change.

To run it locally, serve the `app` folder over `http://localhost` (for example `npx serve app`); the camera needs `localhost` or `https`.
