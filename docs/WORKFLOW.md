# Workflow Sistem Rental Motor Maintenance v8

## 1. Request normal mekanik

```text
Mekanik input report kerusakan
→ Upload foto/video dan beri keterangan per media
→ Input request sparepart
→ Sistem cek stok otomatis
→ Admin review
→ Jika stok cukup: admin set siap stock keluar
→ Admin generate kode stock keluar
→ Mekanik mulai proses service
→ Mekanik selesaikan maintenance + upload foto motor ready
→ Data bisa export CSV untuk Google Sheets
```

## 2. Jika stok kosong

```text
Mekanik request sparepart
→ Admin review
→ Admin upload SS before checkout Shopee/Tokopedia
→ OCR membaca draft subtotal, ongkir, asuransi, biaya lain, diskon, total sebelum CO
→ Admin validasi/crosscheck angka OCR
→ Admin ajukan ke owner lengkap dengan bukti SS dan breakdown biaya
→ Owner view bukti SS + detail biaya lalu approve / reject / minta revisi
→ Jika revisi: admin edit link rekomendasi / estimasi harga
→ Admin ajukan ulang ke owner
→ Jika approve: admin proses pembelian
→ Barang diterima gudang
→ Stock masuk otomatis
→ Admin generate stock keluar
→ Mekanik proses service
```

## 3. Ambil stock cepat / mekanik ambil sendiri

```text
Mekanik buka Request Mekanik
→ Tab Stock Keluar Cepat / Ambil Sendiri
→ Scan motor
→ Scan barcode sparepart
→ Input qty dan catatan
→ Upload bukti ambil barang
→ Sistem generate kode SK dan stok berkurang realtime
→ Status masuk Review Admin / Gudang
→ Admin crosscheck bukti
→ Jika benar: request menjadi Stock Keluar Dibuat
→ Jika salah: ditolak dan stok dikembalikan di development
```

## 4. Status penting

```text
submitted_by_mechanic       Request baru dari mekanik
reviewed_by_admin           Sudah direview admin
waiting_owner_approval      Menunggu approval owner
owner_approved              Owner setuju order
purchase_pending            Proses pembelian
received_by_warehouse       Barang diterima gudang
stock_out_ready             Siap dibuat stock keluar
stock_out_generated         Stock keluar dibuat, tunggu mekanik mulai service
self_take_waiting_review    Mekanik ambil sendiri, tunggu admin crosscheck
ongoing_maintenance         Motor sedang diservice mekanik
completed                   Maintenance selesai
revision_needed             Butuh revisi
cancelled                   Dibatalkan
```

## 5. Master data & import

Master data bisa diinput manual atau import CSV/XLSX:

- Master Sparepart
- Master Motor
- Stock masuk manual

Barcode hanya dibuat untuk sparepart. Rak/ruangan hanya sebagai informasi lokasi penyimpanan.


## 6. Bukti before checkout & OCR

```text
Admin klik Ajukan Owner + Bukti CO
→ Upload screenshot Shopee/Tokopedia mobile sebelum checkout
→ Sistem OCR membaca draft breakdown biaya
→ Admin wajib validasi angka OCR
→ Owner melihat preview screenshot langsung di approval, bukan membuka Google Drive
→ Detail yang tampil: subtotal barang, ongkir, asuransi barang, biaya layanan/lainnya, diskon, total before checkout
```

Catatan produksi: Google Drive hanya dipakai sebagai storage. Sistem menyimpan `file_url`/preview URL agar foto/video dan screenshot tetap bisa dilihat langsung di web.


## OCR Before Checkout v8

1. Admin upload SS Shopee/Tokopedia mobile sebelum checkout.
2. Admin klik `OCR Otomatis & Isi Kolom`.
3. Sistem membaca gambar lewat backend OCR / OCR browser optional.
4. Parser mengisi otomatis kolom subtotal barang, ongkir, asuransi barang, biaya layanan/lainnya, diskon/voucher, dan total sebelum CO.
5. Admin validasi/koreksi angka.
6. Baru klik `Simpan & Ajukan ke Owner`.
7. Owner melihat screenshot, preview, breakdown biaya, raw OCR, item request, link pembelian, dan foto/video kerusakan langsung di web.

Catatan production: target akurasi operasional dicapai dengan kombinasi OCR + validasi admin, bukan mengandalkan OCR mentah tanpa pengecekan.


## v9 - Gemini OCR Before Checkout

Admin upload screenshot Shopee/Tokopedia before checkout, lalu klik `Gemini OCR & Isi Kolom`. Backend/serverless mengirim image ke Gemini dan menerima JSON breakdown biaya. Field subtotal barang, ongkir, asuransi, biaya layanan/lainnya, diskon/voucher, dan total sebelum CO terisi otomatis. Admin tetap validasi angka sebelum mengirim ke Owner. Owner bisa melihat screenshot dan breakdown langsung dari web.


## Update v15 - Production Auth & Gemini Backend

Versi production memakai Supabase Auth dan Gemini OCR via backend/serverless. API key tidak disimpan di browser.
