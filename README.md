# Bari Ramen QMS

## Staff history and daily recap

The staff dashboard keeps active queues separate from completed and skipped tickets.
Choose a registration date (Asia/Jakarta), filter by status, and search by name or number.
CSV export follows the selected date, status, and search, including all matching rows across pages.

Daily metrics include registrations, parties seated, people seated, skipped parties, QR/walk-in sources,
and average registration-to-call time for tickets with a valid call timestamp. These are not sales,
bowls sold, table occupancy, or dining-duration metrics. Existing rows are preserved; no completion
timestamp is inferred. Private history remains restricted to staff through Supabase RLS.

## Summary

MVP antrean tamu walk-in dan QR dalam satu daftar. Ini **antrean mendapatkan meja**, bukan kitchen display, POS, payment integration, atau reservasi meja.

Next.js **16.4.1** App Router, React/React DOM **19.3.1**, TypeScript, Tailwind CSS **4.3.3**, komponen shadcn/ui lokal, Supabase PostgreSQL/Auth/Realtime. Tidak memerlukan service-role key.

**Upgrade:** Versi awal Next.js 14 telah diganti dengan Next.js 16.4.1 dan React 19.3.1. Tracker menggunakan async route params melalui React `use()`, dan typecheck menjalankan `next typegen` sebelum TypeScript. Tailwind 3 diganti dengan Tailwind 4, plugin `@tailwindcss/postcss`, serta `tailwind-merge` 3. Jalankan audit dependency secara berkala; versi terbaru tidak menjamin aplikasi bebas dari seluruh risiko keamanan.

## Install

Node.js 22 atau lebih baru.

```bash
$ npm ci
$ npm run dev
```

Tanpa kedua env Supabase, aplikasi memakai **mode demo lokal**. Data di localStorage, disinkronkan melalui storage events antar-tab pada origin/browser yang sama. Tidak lintas perangkat. Demo tidak memiliki login dan hanya untuk data fiktif. Jika hanya satu env diisi, aplikasi menampilkan kesalahan, tidak diam-diam berpindah ke demo.

### Supabase

1. Buat project Supabase pada akun Anda. Biaya/free-tier sesuai ketentuan vendor saat digunakan.
2. Jalankan `supabase/migrations/001_queue.sql` **sekali** pada database baru melalui SQL Editor. Script mengaktifkan RLS dan publikasi Realtime.
3. Aktifkan **Authentication > Sign In / Providers > Anonymous Sign-Ins**. Pelanggan mendapat sesi anonim, bukan akses tabel tanpa identitas.
4. Buat akun staf email/password melalui Supabase Authentication. Jangan memberikan password kepada developer atau menaruhnya dalam Git.
5. Tambahkan ID akun itu ke allowlist melalui SQL Editor, bukan dari browser:

```sql
insert into public.staff_members (user_id)
select id from auth.users where email = 'host@bariramen.id'
on conflict do nothing;
```

Ganti email contoh dengan email staf sebenarnya. Pastikan satu baris ditambahkan. Akun yang sekadar terdaftar tidak otomatis menjadi staf.

6. Salin `.env.example` menjadi `.env.local`, isi URL project dan anon/publishable key melalui editor lokal, lalu restart dev server:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

Kedua nilai memang dikirim ke browser. **Jangan gunakan service-role/secret key.** RLS dan RPC membatasi akses sebenarnya, bukan guard UI.

### Vercel

Import repository `pt-arunikaciptasahaja/Bari-Ramen-QMS` ke Vercel, pilih framework Next.js dan Node.js 22. Tambahkan kedua env untuk Preview/Production, lalu deploy. Perubahan env memerlukan rebuild.

Set Supabase Site URL ke domain deployment yang benar. Tidak ada akun Supabase/Vercel yang diprovisikan oleh kode ini. Selesaikan konfigurasi keamanan dan pengujian staging sebelum penggunaan operasional.

## Usage

| Route     | Fungsi                                                                     |
| --------- | -------------------------------------------------------------------------- |
| `/`       | Daftar antrean QR, nama dan jumlah orang                                   |
| `/staff`  | Login staf, walk-in, pencarian, filter, panggil, selesai, lewati           |
| `/tv`     | Nomor dipanggil, delapan berikutnya, QR pendaftaran, suara dan layar penuh |
| `/q/[id]` | Nomor pribadi, status, jumlah antrean di depan                             |

### Aturan antrean

- A = 1–2 orang, B = 3–4 orang, C = 5–12 orang. Rombongan lebih besar diarahkan ke staf.
- Nomor direset **per hari Asia/Jakarta** dan per kelompok. Riwayat tidak dihapus saat pergantian hari.
- FIFO dalam tiap kelompok, walk-in dan online setara. Staf memilih sesuai kapasitas meja. Angka posisi menghitung waiting/called sebelumnya **dalam kelompok yang sama**, bukan semua kelompok.
- `waiting → called → seated` atau `waiting/called → no-show`. Selesai hanya tersedia sesudah Panggil. Lewati meminta konfirmasi.
- Beberapa tiket bisa called. TV menampilkan panggilan terbaru paling besar dan panggilan lain di bawahnya. Penyelesaian panggilan terakhir mengembalikan tampilan ke tiket called sebelumnya jika masih aktif.
- PostgreSQL counter UPSERT dan unique constraints mencegah nomor duplikat. `request_id` membuat retry idempoten; lock per pemilik mencegah pendaftaran ganda antar-tab.
- Satu sesi tamu dapat memiliki satu tiket aktif per hari. Pendaftaran ulang mengembalikan tiket aktif. Batas tiga tiket/hari per sesi setelah tiket selesai/dilewati. Ini **bukan proteksi anti-bot yang lengkap**.
- Link tracker memerlukan sesi browser yang mengambil tiket. UUID bukan token akses. Link tidak otomatis dapat dipindahkan ke browser/perangkat lain.
- WebSocket perubahan `queue_board` untuk pelanggan/TV dan `queue_entries` untuk staf. Re-fetch ketika tersambung, mendapat fokus, online kembali, atau setiap 15 detik. Semua kanal dibersihkan saat unmount.
- `queue_entries` menyimpan nama dan pemilik. `queue_board` adalah proyeksi tanpa nama untuk event publik. RLS melarang akses nama tamu lain dan semua direct writes dari browser.

### Demo untuk klien

1. Buka `/staff`, `/tv`, dan `/` pada tab browser yang sama.
2. Aktifkan suara di TV **sekali setelah membuka halaman**. Browser memblokir autoplay tanpa interaksi pengguna. Pastikan perangkat tidak mute dan tab tetap aktif.
3. Tambahkan walk-in, lalu ambil antrean QR pada `/`.
4. Panggil dari staf. TV berkedip dan membunyikan bel. Tracker menunjukkan Silakan ke Kasir.
5. Tekan Selesai atau Lewati. Tiket hilang dari daftar aktif.

Bel dibuat dengan Web Audio, tanpa file audio/CDN. Tidak ada bunyi ulang pada initial load; hanya panggilan baru yang teramati setelah sinkronisasi pertama. Polling merekonsiliasi state, bukan durable delivery untuk setiap panggilan yang terjadi ketika TV mati.

### Verifikasi

```bash
$ npm test
$ npm run typecheck
$ npm run build
```

Uji pada Supabase staging sebelum live:

- Guest tidak bisa membaca nama tamu lain, update langsung, atau memakai RPC staf.
- Daftar walk-in dan online bersamaan, nomor unik, retry tidak menambah tiket.
- Dua staf memanggil tiket yang sama, hanya satu transisi berhasil.
- Cabut jaringan TV lalu sambungkan kembali, board pulih tanpa refresh manual.
- Pastikan bunyi aktif setelah interaksi, tidak terpicu oleh update non-panggilan.
- Uji lewat tengah malam Jakarta, tracker kemarin expired dan nomor baru dimulai 001.
- Uji Chrome Android dan browser TV aktual, zoom, layar penuh, touch target, serta scroll horizontal tabel di ponsel.

Build/typecheck dan unit test tidak membuktikan Supabase terhubung. Kredensial staging dan dua perangkat diperlukan untuk pengujian Realtime end-to-end.

`npm test` juga menjalankan migrasi lengkap pada PostgreSQL embedded (PGlite) dengan stub `auth.uid()`, role anon/authenticated, RLS, RPC, dan publikasi Realtime. Ini memverifikasi SQL dan izin, bukan layanan Auth atau transport WebSocket Supabase sebenarnya. Browser QA belum dilakukan pada lingkungan pembuatan ini.

Verifikasi upgrade (15 Oktober 2026): `npm audit` melaporkan **0 vulnerabilities** pada dependencies produksi maupun pengembangan. Typecheck, build Turbopack, dan seluruh **17 pengujian** lulus. Framework, React, dan toolchain CSS telah di-upgrade untuk menggantikan dependency rentan sebelumnya. Jalankan audit kembali sebelum deployment, karena hasil advisory dapat berubah. Hasil ini bukan audit keamanan menyeluruh terhadap aplikasi.

### Struktur

```text
src/app/                 Empat route dan layout
src/components/ui/       Button, Card, Table (pola shadcn/ui)
src/components/          Form, brand, login, demo notice
src/hooks/               Realtime queue dan akses staf
src/lib/                 Supabase client, RPC, aturan antrean, demo store
supabase/migrations/     Schema, RLS, RPC, trigger, Realtime publication
tests/                   Uji aturan domain dan database
```

### Batas MVP dan operasional

Tidak terintegrasi IGNATIA, printer, payment, atau pengelolaan meja. Cloud mode perlu internet, antrean baru tidak diklaim tersimpan saat offline. Siapkan antrean manual bernomor sebagai fallback.

Untuk produksi: audit dependencies dan RLS, aktifkan CAPTCHA/Turnstile pada anonymous sign-in dengan UI challenge, rate limit registrasi lintas sesi/IP, tentukan jam buka/penutupan antrean, batas kapasitas, kebijakan retensi data, backup/restore, monitoring, serta audit log staf. CAPTCHA tidak diaktifkan dalam demo ini; jika diaktifkan di Supabase tanpa UI challenge, anonymous sign-in gagal.

Realtime hanya memberi data hari ini pada public board. Riwayat nama tetap tersimpan sampai pengelola menerapkan kebijakan retensi. Jangan memuat data pelanggan sungguhan pada demo.

## Contribute

Buat branch, jalankan semua pemeriksaan, dan buka pull request. Perubahan kebijakan antrean harus memiliki test. Jangan commit `.env.local`, password, atau data pelanggan.

## License

Belum ada lisensi distribusi yang diberikan. Hak penggunaan dan kepemilikan source code perlu disepakati antara pengembang dan klien.
