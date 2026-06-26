# Production Setup Guide v16

## 1. Supabase

1. Buat project Supabase.
2. Buka SQL Editor.
3. Run `sql/schema.sql`.
4. Run `sql/production_auth_and_state.sql`.
5. Buka Project Settings > API, copy:
   - Project URL
   - anon / publishable key
6. Isi `config.js`:

```js
supabaseUrl: "https://PROJECT_ID.supabase.co",
supabaseAnonKey: "ISI_SUPABASE_ANON_PUBLISHABLE_KEY"
```

## 2. Bootstrap Owner Pertama

Sebelum Owner login pertama kali, jalankan SQL ini di Supabase SQL Editor:

```sql
insert into public.allowed_users (email, full_name, role, active)
values ('email-owner-kamu@gmail.com', 'Owner Utama', 'owner', true)
on conflict (email) do update set
  full_name = excluded.full_name,
  role = 'owner',
  active = true,
  updated_at = now();
```

Ganti `email-owner-kamu@gmail.com` dengan Gmail Owner yang akan dipakai login.

Setelah itu Owner bisa login dengan tombol **Login dengan Gmail Terdaftar**.

## 3. User Tidak Bisa Daftar Sendiri

Di v16:
- Tombol sign up manual dihapus dari web.
- Email/Gmail user wajib ada di tabel `allowed_users`.
- Jika email belum didaftarkan Owner, user bisa saja menyelesaikan Google OAuth di Supabase, tetapi profile-nya dibuat sebagai `viewer` dan `active=false`, sehingga tidak bisa masuk sistem dan tidak bisa membaca data.

## 4. Owner Menambahkan User Baru

Setelah Owner berhasil login:

```text
Menu Owner
↓
User Management
↓
Isi nama, Gmail/email, dan role
↓
Simpan / Daftarkan Email
```

Role yang tersedia:

```text
owner   = Dashboard, Monitor Motor, Approval Owner, Overview, Laporan, User Management
admin   = Dashboard, Monitor Motor, Approval Admin, Gudang/Stock, Master Data
mekanik = Dashboard, Monitor Motor, Request, Status, Ongoing, Selesai, History
```

Setelah email didaftarkan, user bisa login menggunakan Gmail/email yang sama.

## 5. Login Gmail / Google OAuth

Di Supabase Dashboard:

```text
Authentication
↓
Providers
↓
Google = ON
```

Masukkan Google Client ID dan Client Secret. Pada Google Cloud OAuth, Authorized redirect URI harus memakai callback Supabase yang tertera di halaman provider Google di Supabase.

Di Supabase:

```text
Authentication
↓
URL Configuration
```

Tambahkan URL Cloudflare Pages kamu ke Site URL dan Redirect URLs, contoh:

```text
https://nama-project.pages.dev
https://nama-project.pages.dev/**
```

## 6. Login Email/Password

Login email/password tetap tersedia untuk akun yang dibuat/diatur lewat Supabase/Owner. Tetapi user tidak bisa sign up sendiri dari web.

Untuk operasional harian, rekomendasi paling aman adalah memakai Gmail login dan daftar email dari Owner.

## 7. Cloudflare Pages via GitHub

Upload folder project ini ke GitHub, lalu di Cloudflare:

```text
Workers & Pages
↓
Create
↓
Pages
↓
Import Git repository
```

Build settings:

```text
Framework preset: None
Build command: kosong
Build output directory: /
Root directory: kosong
```

## 8. Environment Variables Backend

Untuk OCR Gemini, Google Drive, dan WhatsApp, isi secrets di Cloudflare Pages/Workers:

```text
GEMINI_API_KEY
GEMINI_MODEL
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_DRIVE_ROOT_FOLDER_ID
WA_API_TOKEN
WA_GROUP_ID
```

Jangan simpan key rahasia di `config.js`.

## 9. Catatan Data

v16 masih memakai tabel `app_state` sebagai penyimpanan production terpusat agar semua device melihat data yang sama. Schema relasional tetap disediakan untuk tahap upgrade berikutnya, tetapi UI v16 menyimpan snapshot operasional ke Supabase supaya production bisa dipakai langsung.
