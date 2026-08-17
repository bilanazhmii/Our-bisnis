# Aplikasi Penjualan Kopi Tutug

Fitur:
- Login admin (PIN awal 1234)
- Login dengan email (Supabase) untuk sinkronisasi data antar perangkat
- Email verification wajib untuk keamanan
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
3. Uncomment script config.js di index.html.
4. Buat tabel database di Supabase sesuai panduan.
5. Setup admin pertama dengan menjalankan SQL untuk mengubah role.
6. Gunakan login email untuk sinkronisasi data antar perangkat.

Admin Dashboard:
- Hanya user dengan role Admin/Super Admin yang bisa akses
- Super Admin bisa mengubah role user lain
- Melihat statistik user terdaftar
- Manajemen user system secara centralized
