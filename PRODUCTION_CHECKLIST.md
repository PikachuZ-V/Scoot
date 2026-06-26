# Checklist Production v14

## Sebelum Deploy
- [ ] Supabase project sudah dibuat
- [ ] `sql/schema.sql` sudah dijalankan
- [ ] `sql/seed.sql` sudah dijalankan
- [ ] User Owner/Admin/Mekanik sudah dibuat di Supabase Auth
- [ ] Tabel `profiles` sudah terisi role user
- [ ] `config.js` sudah diisi Supabase URL + anon key
- [ ] `geminiApiKey` di `config.js` dikosongkan
- [ ] Cloudflare Pages project sudah dibuat
- [ ] Environment/secret Cloudflare sudah diisi
- [ ] Google Drive root folder sudah dibuat
- [ ] WhatsApp gateway sudah dipilih

## Environment/Secret Cloudflare
- [ ] GEMINI_API_KEY
- [ ] GEMINI_MODEL
- [ ] SUPABASE_SERVICE_ROLE_KEY
- [ ] GOOGLE_DRIVE_ROOT_FOLDER_ID
- [ ] GOOGLE_CLIENT_EMAIL / OAuth credential
- [ ] GOOGLE_PRIVATE_KEY / OAuth secret
- [ ] WA_API_TOKEN
- [ ] WA_GROUP_ID

## Test Go-Live
- [ ] Login Owner berhasil
- [ ] Login Admin berhasil
- [ ] Login Mekanik berhasil
- [ ] Mekanik submit request + upload foto/video
- [ ] Preview foto/video bisa dibuka di web
- [ ] Admin review request
- [ ] Gemini OCR checkout proof berhasil
- [ ] Owner approve/revisi/reject berhasil
- [ ] Admin upload bukti barang tiba + OCR nomor pesanan
- [ ] Stock masuk update
- [ ] Stock keluar generate sekali saja, tidak dobel
- [ ] Mekanik mulai service
- [ ] Mekanik selesai service + upload foto ready
- [ ] WhatsApp auto-report request terkirim/logged
- [ ] WhatsApp auto-report motor ready terkirim/logged
- [ ] Monitor Motor ready/maintenance/ongoing tampil benar
- [ ] Laporan Owner tampil benar
- [ ] Mobile responsive sudah dicek
