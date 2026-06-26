# Production Checklist v16

## Supabase
- [ ] `sql/schema.sql` sudah dijalankan.
- [ ] `sql/production_auth_and_state.sql` sudah dijalankan.
- [ ] Email Owner pertama sudah dimasukkan ke `allowed_users`.
- [ ] Google provider aktif di Supabase Auth.
- [ ] Site URL dan Redirect URLs sudah diarahkan ke domain Cloudflare Pages.
- [ ] `config.js` sudah diisi Supabase URL dan anon/publishable key.

## User Access
- [ ] Owner bisa login memakai Gmail yang sudah dibootstrap.
- [ ] Menu **User Management** muncul hanya untuk Owner.
- [ ] Owner bisa menambahkan email mekanik.
- [ ] Owner bisa menambahkan email admin.
- [ ] Email yang belum didaftarkan tidak bisa masuk sistem.
- [ ] Role menu otomatis sesuai role: Owner/Admin/Mekanik.

## Cloudflare
- [ ] Deploy lewat GitHub integration, bukan Direct Upload jika memakai folder `functions/`.
- [ ] Environment variable Gemini sudah diisi.
- [ ] WhatsApp/Google Drive backend dikonfigurasi jika sudah siap.

## Mobile Responsive
- [ ] Login screen nyaman di HP.
- [ ] Master Data & Barcode tidak melebar di HP.
- [ ] User Management tidak melebar di HP.
- [ ] Detail card/dropdown admin dan owner tidak melebar.
