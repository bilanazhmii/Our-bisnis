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


Fitur bisnis tambahan:
- Menu/katalog: kategori, satuan, stok minimum, status aktif, dan catatan menu.
- Penjualan: metode Tunai, Transfer, QRIS, Debit, atau Piutang; uang diterima; kembalian; nama pelanggan/debitur; jatuh tempo; dan catatan transaksi.
- Kas masuk/keluar: ledger uang nyata dengan kategori, pihak, referensi, catatan, ringkasan kas masuk, kas keluar, dan kas bersih.
- Piutang: daftar orang yang berutang, total tagihan, pembayaran parsial, sisa, jatuh tempo, status, pencarian, dan detail cetak.
- Laporan: omzet, laba kotor, kas masuk, kas keluar, kas bersih, piutang terbentuk, metode pembayaran, pelanggan, serta catatan.
- Backup dan restore mencakup produk, penjualan, kas, piutang, dan pembayaran piutang.

Aturan perhitungan penting:
- Total penjualan = harga x jumlah; kembalian = uang diterima - total jika positif.
- Kembalian tidak mengurangi omzet dan tidak dicatat sebagai biaya.
- Penjualan kredit menambah omzet dan piutang, tetapi kas hanya bertambah sebesar pembayaran yang benar-benar diterima.
- Pelunasan piutang menambah kas dan mengurangi sisa piutang tanpa menggandakan omzet.
- Saldo kas bersih = seluruh kas masuk - seluruh kas keluar pada periode yang dipilih.
- Penghapusan penjualan mengembalikan stok dan menghapus kas/piutang/pembayaran turunannya.

Migrasi cloud:
- Jalankan seluruh isi `setup_supabase.sql` pada Supabase SQL Editor. Bagian paling bawah berisi migrasi idempoten untuk tabel `cash_entries`, `receivables`, dan `receivable_payments` serta kolom menu dan pembayaran.
- Jalankan ulang skrip aman untuk memperbarui instalasi lama tanpa menghapus data yang sudah ada.
