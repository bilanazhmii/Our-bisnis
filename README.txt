# Aplikasi Penjualan Kopi Tutug

Fitur:
- Login admin (PIN awal 1234)
- Login dengan email (Supabase) untuk sinkronisasi data antar perangkat
- Email verification wajib untuk keamanan
- Kirim ulang email verifikasi jika tidak diterima
- Sistem role (User, Admin, Super Admin)
- Admin Dashboard untuk manajemen user dan role
- Dashboard penjualan harian
- Grafik 7 hari dan barang terlaris
- Tanggal transaksi cukup dipilih sekali
- Penjualan otomatis mengurangi stok
- CRUD stok barang
- Filter laporan tanggal
- Export Excel-compatible CSV
- Cetak struk
- Cetak laporan / Save as PDF dari dialog print
- Backup & restore JSON
- Ganti PIN
- Sinkronisasi data cloud dengan Supabase
- Row Level Security (RLS) untuk isolasi data per user
- SMTP configuration support untuk production email
- PWA: dapat di-install di Windows/Android/iPhone jika di-host melalui HTTPS

Catatan:
- Data default tersimpan lokal di perangkat/browser (localStorage).
- Untuk sinkronisasi data antar perangkat, gunakan login email dengan Supabase.
- Lihat file SUPABASE_SETUP.md untuk panduan setup Supabase.

Cara menjalankan:
1. Buka folder ini di VS Code.
2. Jalankan Live Server.
3. Buka URL http://localhost:5500 (atau port Live Server kamu).
4. Login dengan PIN 1234 (local) atau setup Supabase untuk login email.
5. Untuk instal di HP, upload project ke hosting HTTPS (mis. GitHub Pages/Netlify/Vercel), lalu buka URL tersebut dari HP dan pilih Add to Home Screen/Install App.

Setup Supabase (Opsional - untuk sinkronisasi data):
1. Buka file SUPABASE_SETUP.md untuk panduan lengkap.
2. Copy config.example.js ke config.js dan isi dengan kredensial Supabase.
3. Tidak perlu menambahkan tag script. Aplikasi memuat config.js otomatis hanya saat endpoint Vercel tidak tersedia.
4. Copy semua script dari setup_supabase.sql dan paste ke Supabase SQL Editor.
5. Configure email/SMTP di Supabase Dashboard untuk email verification.
6. Setup admin pertama dengan menjalankan SQL untuk mengubah role.
7. Gunakan login email untuk sinkronisasi data antar perangkat.

Email Verification:
- Email verification WAJIB di-enable untuk keamanan
- Configure SMTP di Supabase Dashboard (Authentication → Settings → SMTP Settings)
- Untuk development: gunakan Supabase built-in email service
- Untuk production: gunakan SendGrid atau custom SMTP
- Tombol "Kirim Ulang Verifikasi Email" tersedia jika email tidak diterima

Admin Dashboard:
- Hanya user dengan role Admin/Super Admin yang bisa akses
- Super Admin bisa mengubah role user lain
- Melihat statistik user terdaftar
- Manajemen user system secara centralized
