# Rental Motor Maintenance & Inventory System

Starter web app untuk sistem rental motor: report kerusakan mekanik, upload foto/video, request sparepart, approval admin, approval owner, stock keluar/masuk, barcode sparepart, master data, dan laporan owner.


## Revisi v14

- Admin saat barang orderan tiba sekarang wajib mengisi `Bukti Barang Orderan Tiba`.
- Form penerimaan barang mendukung upload:
  - foto/video barang fisik yang diterima,
  - screenshot halaman pesanan Shopee/Tokopedia.
- Gemini OCR khusus penerimaan membaca nomor pesanan, item barang, variasi, dan qty dari screenshot/foto.
- Sistem membandingkan item yang terbaca dengan item request: cocok, sebagian/perlu cek manual, atau tidak cocok.
- Setelah bukti penerimaan disimpan, stok masuk otomatis terupdate dan request masuk status `Diterima Gudang`.
- Owner dan admin bisa preview bukti penerimaan langsung di web tanpa membuka Google Drive.
- Mekanik bisa membuka detail motor dari history service untuk melihat alasan maintenance, sejak kapan, kebutuhan sparepart, dan tanggal ready terakhir.
- Dashboard admin/owner ditambah overview operasional: total motor, ready, maintenance, ongoing, total pengeluaran pembelian sparepart, frekuensi pembelian, dan fast moving stock.
- Laporan owner dibuat lebih detail: jumlah motor per status, total pengeluaran, jumlah request, pembelian terakhir, stok habis/menipis, dan fast moving stock.

## Revisi v9

- OCR checkout proof sekarang diarahkan ke **Gemini OCR**.
- Tombol menjadi `Gemini OCR & Isi Kolom`.
- Gemini membaca screenshot Shopee/Tokopedia mobile dan mengembalikan JSON breakdown biaya.
- Kolom yang diisi otomatis:
  - Subtotal barang
  - Ongkir
  - Asuransi barang
  - Biaya layanan/lainnya
  - Diskon/voucher
  - Total sebelum CO
- Owner tetap bisa preview screenshot + breakdown langsung di web.
- Disiapkan Cloudflare Pages Function `functions/api/gemini-checkout-ocr.js` supaya `GEMINI_API_KEY` aman di backend/serverless, bukan disimpan di browser.
- `config.js` ditambah opsi `ocrProvider: "gemini"`, `geminiProxyEndpoint`, `geminiModel`, dan `geminiApiKey` untuk dev-only test.

## Revisi v8

- OCR before checkout sekarang otomatis mengisi kolom subtotal barang, ongkir, asuransi barang, biaya layanan/lainnya, diskon/voucher, dan total sebelum CO.
- Tombol di form berubah menjadi `OCR Otomatis & Isi Kolom`.
- Mode production mendukung `ocrEndpoint` backend/serverless yang mengembalikan JSON breakdown.
- Mode browser optional bisa memakai Tesseract.js dari CDN saat tombol OCR diklik (`enableBrowserOcr: true`).
- Jika OCR backend belum disambungkan, demo tetap menunjukkan alur auto-fill dengan parser OCR demo.
- Admin tetap wajib validasi angka sebelum dikirim ke Owner supaya akurasi operasional tetap aman.

## Revisi v7

- Admin saat mengajukan order ke Owner sekarang wajib melalui form `Bukti Before Checkout`.
- Form before checkout berisi upload SS Shopee/Tokopedia mobile, subtotal barang, ongkir, asuransi barang, biaya layanan/lainnya, diskon/voucher, dan total sebelum CO.
- Form before checkout mendukung OCR sebagai draft otomatis. Mulai v8, hasil OCR bisa langsung mengisi kolom breakdown.
- Owner bisa melihat langsung screenshot before checkout dan breakdown biaya di kartu approval tanpa membuka Google Drive.
- Foto/video mekanik, bukti ambil sparepart, foto motor ready, dan screenshot admin dibuat sebagai preview langsung di web. Google Drive tetap hanya menjadi storage backend.
- Schema SQL ditambah tabel `approval_checkout_proofs` untuk menyimpan bukti checkout, file URL, raw OCR, dan breakdown biaya tervalidasi.

## Revisi v5

- Tab `Master Sparepart & Barcode` dan `Master Motor` sudah dibuat aktif, jadi tidak lagi tampil tergabung dalam satu halaman panjang.
- Section Master Motor sekarang punya mode edit dari daftar motor.
- Setelah simpan/edit motor, tampilan tetap kembali ke tab Master Motor.
- Struktur UI sudah siap dilanjutkan ke tahap production dengan Supabase + Cloudflare Pages + backend upload Google Drive.

- Panduan mekanik dihapus dari tampilan form supaya halaman lebih ringan dan responsive.
- Menu mekanik dipisah menjadi:
  - Request Mekanik
  - Status Request
  - Selesai Maintenance
  - History Service
- Approval Admin dan Gudang/Stock dipisah menjadi menu berbeda.
- Gudang/Stock tetap berada di role Admin, bukan role terpisah.
- Menu Gudang/Stock memiliki:
  - Stock keluar cepat
  - Mode mekanik ambil sendiri
  - Stock masuk manual
  - History stock movement
  - Metric stock keluar hari ini dan stok habis/menipis
- Master Data & Barcode digabung untuk:
  - Master sparepart
  - Auto-generate kode barcode sparepart baru
  - Print label barcode sparepart
  - Master motor
- Owner tetap hanya memiliki:
  - Dashboard
  - Approval Owner
  - Overview Keseluruhan
  - Laporan
- Overview Owner dibuat read-only dengan section:
  - Request Baru
  - Menunggu Barang
  - Sudah Service
  - Revisi / Batal
- Filter status Admin dipersingkat menjadi:
  - Semua
  - Request Baru
  - Menunggu Owner
  - Gudang / Stock
  - Selesai / Revisi
- Flow revisi owner diperbaiki: owner bisa memberikan catatan dan rekomendasi link, lalu admin bisa edit link pembelian dan ajukan ulang.
- Bug generate stock keluar ulang diperkuat: jika kode SK/movement sudah pernah dibuat, stok tidak dikurangi ulang walaupun status sempat direvisi.
- Tampilan mobile diperbaiki dengan hamburger menu, form mekanik satu kolom, dan panel yang tidak melebar karena panduan samping.

## Cara coba demo

1. Extract ZIP.
2. Buka `index.html` di browser.
3. Klik `Reset Demo` kalau browser masih menyimpan data versi sebelumnya.
4. Pilih `Mode User` di sidebar.
5. Coba alur berikut:
   - Mode Mekanik: buat report motor 079, upload foto/video, isi detail per media, request sparepart.
   - Buka menu Status Request untuk melihat request aktif mekanik.
   - Mode Admin: masuk Approval Admin untuk review, lalu klik Ajukan Owner + Bukti CO untuk upload SS before checkout dan isi breakdown biaya.
   - Mode Owner: view SS before checkout + breakdown biaya, lalu approve/revisi/reject order sparepart.
   - Mode Admin: jika owner revisi, edit link rekomendasi lalu ajukan ulang; jika barang datang, tandai barang diterima dan lanjut stock keluar.
   - Mode Admin: buka Gudang/Stock untuk stock keluar cepat, stock masuk manual, dan cek movement.
   - Mode Admin: buka Master Data & Barcode untuk tambah sparepart, print barcode, lalu pindah tab Master Motor untuk tambah/edit motor.

Demo ini memakai `localStorage`, jadi data tersimpan di browser yang sama.


## Konfigurasi Gemini OCR Production

Di `config.js`, bagian OCR bisa diisi seperti ini:

```js
window.APP_CONFIG = {
  useSupabase: true,
  supabaseUrl: "...",
  supabaseAnonKey: "...",
  ocrProvider: "gemini",
  geminiProxyEndpoint: "/api/gemini-checkout-ocr",
  geminiModel: "gemini-2.5-flash",
  geminiApiKey: "" // kosongkan di production
};
```

Untuk Cloudflare Pages, tambahkan environment variable:

```text
GEMINI_API_KEY=isi_api_key_gemini_kamu
GEMINI_MODEL=gemini-2.5-flash
```

Frontend akan kirim screenshot before checkout ke `/api/gemini-checkout-ocr`. Backend memanggil Gemini dengan image input dan meminta structured JSON output. Response yang dipakai aplikasi:

```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "raw_text": "hasil bacaan penting dari SS",
  "confidence": 0.93,
  "notes": "angka jelas",
  "breakdown": {
    "subtotal_items": 77589,
    "shipping_cost": 0,
    "insurance_cost": 0,
    "service_fee": 2000,
    "discount_amount": 0,
    "total_before_checkout": 79589
  }
}
```

Catatan keamanan: jangan simpan `GEMINI_API_KEY` di `config.js` saat production karena file frontend bisa dilihat user. Simpan API key di backend/serverless environment. `geminiApiKey` di config hanya untuk test lokal/dev.

Google Drive tetap hanya menjadi storage file. Preview di web memakai URL/file proxy dari backend, jadi user tidak perlu membuka Drive manual.

## File penting

```text
index.html          Tampilan utama
styles.css          Styling responsive + hamburger menu
app.js              Logic demo frontend
config.js           Config koneksi Supabase nanti
sql/schema.sql      Schema database Supabase versi jangka panjang + checkout proof/OCR
sql/seed.sql        Contoh data awal
docs/WORKFLOW.md    Alur sistem
```

## Rekomendasi produksi

Untuk jangka panjang:

- Frontend: Cloudflare Pages
- Database: Supabase PostgreSQL
- Login/role: Supabase Auth
- File foto/video: Google Drive API melalui backend/serverless function
- Data file di database: simpan URL/file ID/folder path, bukan file mentah

Untuk upload ke Google Drive, frontend sebaiknya mengirim file ke backend/serverless function. Backend akan:

1. Membuat folder berdasarkan nomor motor dan tanggal report.
2. Upload file ke folder tersebut.
3. Simpan `drive_file_id`, `file_url`, `drive_folder_path`, dan `media_note` ke tabel `report_media`.

Contoh format folder:

```text
Rental Motor Reports/
└── Motor 079/
    └── 2026-06-25 - RPT-20260625-0001/
        ├── foto-rem-belakang.jpg
        └── video-suara-mesin.mp4
```


## Update v10 - Gemini OCR bisa dipakai di demo lokal

Pada versi v10, dialog **Bukti Before Checkout** memiliki kotak **Gemini OCR Demo**. Untuk mencoba Gemini OCR langsung dari file `index.html` tanpa backend:

1. Buka menu Admin → Approval Admin.
2. Pilih request yang perlu diajukan ke Owner.
3. Upload screenshot before checkout Shopee/Tokopedia.
4. Isi Gemini API Key pada kotak **Gemini OCR Demo**.
5. Klik **Simpan**.
6. Klik **Gemini OCR & Isi Kolom**.

Catatan keamanan: mode ini hanya untuk demo/dev karena API key tersimpan di browser dan terlihat di frontend. Untuk production, gunakan `functions/api/gemini-checkout-ocr.js` sebagai backend/serverless dan simpan key di environment `GEMINI_API_KEY`.


## Catatan Production v11

Untuk production, Gemini tetap dipanggil lewat backend/serverless (`functions/api/gemini-checkout-ocr.js`) agar API key aman. File foto/video mekanik, bukti ambil sparepart, foto motor ready, dan SS before checkout disimpan di storage/Google Drive, lalu web menyimpan URL preview sehingga user bisa melihat file langsung di sistem tanpa membuka Drive manual.

## Update v12 — WhatsApp Auto Report & Monitor Motor

Tambahan v12:

1. **WhatsApp Auto Report**
   - Saat mekanik submit request sparepart, sistem otomatis membuat pesan laporan WhatsApp.
   - Saat mekanik menyelesaikan maintenance/motor ready, sistem otomatis membuat pesan laporan WhatsApp.
   - Di demo lokal, pesan masuk ke panel **WhatsApp Auto Report** di Dashboard dan bisa dicopy.
   - Di production, isi `whatsappWebhookEndpoint` di `config.js` agar sistem mengirim ke backend/WA gateway.
   - Backend WA production yang disarankan: serverless endpoint yang menyimpan token/API key di environment, bukan di frontend.

2. **Monitor Motor untuk semua role**
   - Menu baru: **Monitor Motor**.
   - Tersedia untuk Admin, Owner, dan Mekanik.
   - Section status:
     - Ready
     - Maintenance
     - Ongoing Maintenance
   - Setiap motor memiliki tombol **Lihat Detail Motor**.

3. **Detail Motor**
   - Menampilkan kenapa motor maintenance.
   - Menampilkan dari kapan motor maintenance/ongoing.
   - Menampilkan sparepart yang dibutuhkan.
   - Untuk motor ready, menampilkan tanggal service/ready terakhir dan bukti foto/video motor ready.

4. **Flow status motor diperkuat**
   - Request mekanik → status motor masuk Maintenance.
   - Admin generate stock keluar → motor tetap Maintenance sampai mekanik mulai kerja.
   - Mekanik klik Mulai Proses Service → status pindah ke Ongoing Maintenance.
   - Mekanik selesai service + upload bukti ready → status motor menjadi Ready.

5. **Review responsive**
   - Monitor grid menggunakan auto-fit untuk PC/tablet.
   - Mobile memakai satu kolom.
   - Modal detail motor menyesuaikan lebar layar.
   - Preview foto/video tetap bisa dibuka full screen.

Catatan production WhatsApp:
- Browser biasa tidak aman untuk menyimpan token WhatsApp.
- Gunakan backend/serverless sebagai perantara.
- Frontend hanya mengirim payload `{ event_type, group_name, message, request_code }` ke `whatsappWebhookEndpoint`.


## Update v14

- UI Approval Admin dan Approval Owner dibuat lebih ringkas.
- Detail panjang seperti preview foto/video, breakdown before checkout, bukti barang diterima, raw OCR, folder Google Drive, dan catatan detail sekarang masuk ke dropdown.
- Ringkasan utama tetap terlihat di kartu: motor, status, mekanik/admin, kerusakan, sparepart, stok, dan tombol aksi.
- Tombol aksi admin/owner tetap terlihat tanpa harus membuka detail, supaya workflow tetap cepat.
- Dropdown tetap responsive di mobile, tablet, dan desktop.
