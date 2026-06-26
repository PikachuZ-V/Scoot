# Responsive Review v13

Review layout yang diterapkan:

## PC / Desktop
- Sidebar tetap di kiri.
- Dashboard menggunakan metric grid 4 kolom dan overview operasional untuk Admin/Owner.
- Monitor Motor memakai card grid auto-fit.
- Form dan tabel Master Data tetap 2 kolom bila layar cukup lebar.
- Dialog before checkout dan dialog penerimaan barang menggunakan 2 kolom di layar besar.
- Tabel panjang dibungkus dengan horizontal scroll (`table-wrap`).

## Tablet
- Sidebar berubah menjadi drawer/hamburger.
- Metric grid turun menjadi 2 kolom.
- Split form/table berubah menjadi 1 kolom.
- Dialog OCR/receive proof turun menjadi 1 kolom jika ruang tidak cukup.
- Monitor card tetap auto-fit mengikuti lebar layar.

## Mobile
- Hamburger menu aktif.
- Semua form 1 kolom.
- Tab menu horizontal bisa discroll.
- Card motor, request, WhatsApp log, dan overview KPI menjadi 1 kolom.
- Modal preview foto/video, modal detail motor, dan modal bukti penerimaan memakai maksimal 98vw agar tidak keluar layar.
- Preview foto/video bisa dibuka full screen melalui tombol/klik thumbnail.

## Area yang sudah diberi perlindungan overflow
- `.main { overflow-x: hidden; }`
- `.table-wrap { overflow-x: auto; }`
- `.status-section-grid` turun ke 2 kolom lalu 1 kolom.
- `.monitor-grid` auto-fit lalu 1 kolom di mobile.
- `.motor-detail-dialog`, `.checkout-dialog`, dan `.media-preview-dialog` dibatasi width/max-height.

## Catatan production test
Untuk production tetap disarankan tes manual di:
- Android Chrome 390px–430px
- iPhone Safari 375px–430px
- Tablet 768px–1024px
- Desktop 1366px ke atas

Checklist yang perlu dites setelah backend aktif:
- Upload foto/video besar.
- Preview file dari URL Google Drive/proxy storage.
- Kamera scan barcode via HTTPS.
- WhatsApp webhook terkirim ke grup.
- Gemini OCR before checkout dari backend.
- Gemini OCR penerimaan barang dari backend.
- Validasi mismatch order vs barang diterima.
