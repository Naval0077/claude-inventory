# Bundled libraries

Copied from npm so the app doesn't depend on outside websites and works on weak connections.

| File | Package | Version | Licence |
|---|---|---|---|
| `supabase.js` | @supabase/supabase-js (UMD build) | 2.117.2 | MIT |
| `zxing-wasm-reader.js`, `zxing_reader.wasm` | zxing-wasm (ZXing C++ reader) | 2.2.4 | MIT (zxing-cpp: Apache-2.0) |
| `zxing-library.min.js` | @zxing/library | 0.21.3 | Apache-2.0 |
| `jspdf.umd.min.js` | jspdf | 2.5.1 | MIT |
| `JsBarcode.all.min.js` | jsbarcode | 3.11.6 | MIT |
| `xlsx.full.min.js` | xlsx (SheetJS Community) | 0.18.5 | Apache-2.0 |
| `qrcode.js` | qrcode-generator | 1.4.4 | MIT |

To update one, install the new version with npm and copy the same file from its `dist` folder.
