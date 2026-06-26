# Panduan Push Production - Rental Motor Maintenance System v14

Dokumen ini menjelaskan langkah produksi untuk membuat sistem v14 live dan siap dipakai tim.

> Catatan penting: paket v14 berisi UI final, schema database, template import, dan function stub untuk Gemini OCR + WhatsApp. Mode demo masih memakai `localStorage`. Untuk production penuh, aktifkan Supabase, backend upload file, Gemini OCR backend, dan WhatsApp gateway.

---

## 0. Arsitektur Production yang Disarankan

- Frontend: Cloudflare Pages
- API/serverless: Cloudflare Pages Functions di folder `/functions/api`
- Database: Supabase PostgreSQL
- Auth/role: Supabase Auth + tabel `profiles`
- File foto/video: Google Drive API via backend/serverless
- OCR: Gemini API via backend/serverless, bukan langsung dari browser
- WhatsApp group report: WhatsApp gateway/backend webhook

---

## 1. Data yang Perlu Disiapkan

Jangan kirim secret key ke chat. Simpan langsung di dashboard masing-masing.

### Public / boleh dipakai di frontend
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` atau publishable key
- URL production Cloudflare Pages

### Secret / jangan ditaruh di frontend
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- Google Drive credential/service account/OAuth secret
- WhatsApp gateway token/API key

---

## 2. Setup Supabase

1. Buka Supabase Dashboard.
2. Buat project baru, contoh nama: `rental-motor-maintenance`.
3. Buka menu SQL Editor.
4. Jalankan file:
   - `sql/schema.sql`
   - lalu `sql/seed.sql`
5. Buka Project Settings > API.
6. Copy:
   - Project URL
   - Anon/publishable key
7. Buat user login di Authentication:
   - Owner
   - Admin
   - Mekanik
8. Isi tabel `profiles` sesuai user UUID dari `auth.users`.

Contoh role:

```text
owner
admin
mekanik
viewer
```

---

## 3. Konfigurasi `config.js`

Edit file `config.js` sebelum deploy:

```js
window.APP_CONFIG = {
  useSupabase: true,
  supabaseUrl: "https://PROJECT_ID.supabase.co",
  supabaseAnonKey: "ISI_SUPABASE_ANON_KEY",

  ocrProvider: "gemini",
  geminiProxyEndpoint: "/api/gemini-checkout-ocr",
  geminiReceiveProxyEndpoint: "/api/gemini-receive-ocr",
  geminiModel: "gemini-2.5-flash",
  geminiApiKey: "",
  allowBrowserGeminiInDemo: false,

  whatsappWebhookEndpoint: "/api/whatsapp-report",

  ocrEndpoint: "",
  enableBrowserOcr: false
};
```

Catatan:
- Jangan isi `geminiApiKey` di production.
- Secret hanya masuk environment variable Cloudflare.

---

## 4. Setup Gemini OCR di Cloudflare

Function yang sudah disiapkan:

```text
functions/api/gemini-checkout-ocr.js
functions/api/gemini-receive-ocr.js
```

Di Cloudflare Pages > Project > Settings > Environment variables / Secrets, isi:

```text
GEMINI_API_KEY=isi_key_dari_google_ai_studio
GEMINI_MODEL=gemini-2.5-flash
```

Test setelah deploy:
1. Login sebagai Admin.
2. Masuk Approval Admin.
3. Upload SS before checkout.
4. Klik Gemini OCR & Isi Kolom.
5. Pastikan subtotal, ongkir, asuransi, estimasi pengiriman, biaya layanan, diskon, dan total terisi.
6. Test juga form Bukti Barang Orderan Tiba.

---

## 5. Setup Google Drive Storage

Target folder:

```text
Rental Motor Reports/
└── Motor 079/
    └── 2026-06-25 - RPT-20260625-0001/
```

Rekomendasi production:
- Pakai backend/serverless untuk upload file.
- Frontend mengirim file ke endpoint backend.
- Backend membuat folder Drive otomatis.
- Backend menyimpan metadata file ke Supabase:
  - `drive_file_id`
  - `file_url`
  - `drive_folder_path`
  - `media_note`

Endpoint yang perlu dibuat/diaktifkan:

```text
/api/upload-report-media
/api/upload-ready-media
/api/upload-checkout-proof
/api/upload-receive-proof
```

Data environment yang dibutuhkan:

```text
GOOGLE_DRIVE_ROOT_FOLDER_ID=...
GOOGLE_CLIENT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
```

Catatan: jika memakai service account, upload paling aman ke Shared Drive atau folder yang memang diberi akses ke service account.

---

## 6. Setup WhatsApp Auto Report

Function stub yang sudah ada:

```text
functions/api/whatsapp-report.js
```

Flow:

```text
Mekanik submit request sparepart
↓
Sistem generate pesan laporan
↓
POST ke /api/whatsapp-report
↓
Backend kirim ke WhatsApp group lewat gateway
```

Event yang dikirim:

```text
request_created
motor_ready
```

Environment yang disarankan:

```text
WA_PROVIDER=fonnte/wablas/meta/other
WA_API_TOKEN=...
WA_GROUP_ID=...
```

Untuk awal production, aktifkan mode log dulu sebelum auto-send agar format pesan bisa dicek.

---

## 7. Deploy ke Cloudflare Pages

### Cara paling mudah: Direct Upload

1. Login Cloudflare Dashboard.
2. Buka Workers & Pages.
3. Create Application > Pages.
4. Pilih Direct Upload.
5. Upload folder project v14-production.
6. Pastikan folder `/functions` ikut ter-upload di root project.
7. Deploy.
8. Set environment variables/secrets.
9. Redeploy.

### Cara jangka panjang: GitHub

1. Buat repository GitHub private.
2. Upload semua file project.
3. Connect Cloudflare Pages ke repository.
4. Build command kosong.
5. Output directory `/` atau root.
6. Deploy.

---

## 8. Checklist Test Setelah Live

### Login & Role
- Owner hanya melihat Dashboard, Monitor Motor, Approval Owner, Overview, Laporan.
- Admin melihat Approval, Gudang/Stock, Master Data & Barcode, Monitor Motor.
- Mekanik melihat Request, Status Request, Ongoing Maintenance, Selesai Maintenance, History Service.

### Mekanik
- Buat request motor.
- Upload foto/video dari galeri.
- Isi keterangan per foto/video.
- Submit request.
- Cek pesan WhatsApp auto-report.

### Admin
- Review request.
- Jika stok ada: generate stock keluar.
- Jika stok kosong: upload SS before checkout.
- OCR Gemini isi breakdown otomatis.
- Ajukan ke Owner.
- Saat barang tiba: upload foto barang + SS pesanan.
- OCR Gemini baca nomor pesanan dan qty.
- Cocokkan barang diterima vs request.

### Owner
- Lihat approval order.
- Preview screenshot dan breakdown langsung di web.
- Approve / revisi / reject.
- Lihat overview motor ready, maintenance, ongoing maintenance.
- Lihat laporan pengeluaran, fast moving stock, frekuensi pembelian.

### Monitor Motor
- Ready: tampil detail tanggal ready dan bukti ready.
- Maintenance: tampil sejak kapan, alasan, sparepart dibutuhkan.
- Ongoing Maintenance: tampil proses service berjalan.
- Semua kartu punya Detail Motor.

### Responsive
- PC: sidebar kiri dan detail dropdown rapi.
- Tablet: hamburger/drawer aktif.
- HP: card satu kolom, modal tidak keluar layar, tab bisa scroll horizontal.

---

## 9. Urutan Go-Live yang Aman

1. Deploy ke Cloudflare Pages dengan demo mode off.
2. Koneksikan Supabase dan test login role.
3. Import master motor dan master sparepart dari template.
4. Test request mekanik dengan 1 motor.
5. Test approval owner dengan 1 item stok kosong.
6. Test Gemini OCR checkout proof.
7. Test penerimaan barang + Gemini OCR nomor pesanan.
8. Test stock keluar dan stock masuk.
9. Test WhatsApp dalam mode log.
10. Setelah format pesan benar, aktifkan auto-send ke grup.
11. Baru mulai dipakai tim.

---

## 10. Template Import

File tersedia di folder `templates/`:

```text
template_master_sparepart.csv
template_master_motor.csv
template_stock_masuk.csv
import_templates_master_data.xlsx
```

Saran awal:
- Import semua motor aktif.
- Import semua sparepart gudang.
- Input stock opname awal.
- Print barcode sparepart.
- Tempel barcode di box/sparepart.

---

## 11. Catatan Maintenance

- Backup Supabase minimal mingguan.
- Export laporan selesai maintenance ke Google Sheets setiap akhir minggu/bulan.
- Cek stok minus/selisih dari self-take mekanik.
- Review fast moving stock bulanan.
- Update link pembelian default untuk sparepart yang sering dibeli.
- Jangan pernah menaruh secret key di `config.js`.

