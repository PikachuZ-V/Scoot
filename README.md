# Rental Motor Maintenance System v16 Production

Versi ini adalah revisi production dengan **Owner-managed user access**.

Perubahan v16:
- Tidak ada tombol buat akun manual dari halaman login.
- User tidak bisa mendaftar sendiri.
- Gmail/email harus didaftarkan oleh Owner terlebih dahulu.
- Jika email di luar daftar mencoba login Gmail, sistem akan menolak akses.
- Role ditentukan Owner di menu **User Management**:
  - `mekanik`
  - `admin`
  - `owner`
- Login tetap mendukung:
  - Email/password untuk akun yang sudah dibuat/diatur dari Supabase/Owner.
  - Gmail/Google untuk email yang sudah didaftarkan Owner.
- Master Data & Barcode admin tetap responsive untuk mobile.

Setup cepat:
1. Buat Supabase project.
2. Jalankan `sql/schema.sql`.
3. Jalankan `sql/production_auth_and_state.sql`.
4. Bootstrap email Owner pertama di tabel `allowed_users` memakai SQL yang ada di guide.
5. Aktifkan Google provider di Supabase Auth.
6. Isi `config.js` dengan Supabase URL dan anon/publishable key.
7. Upload repo ke GitHub.
8. Deploy dari GitHub ke Cloudflare Pages.
9. Login Owner memakai Gmail yang sudah dibootstrap.
10. Tambahkan Admin/Mekanik dari menu **User Management**.

Baca detail di `PRODUCTION_SETUP_GUIDE.md`.
