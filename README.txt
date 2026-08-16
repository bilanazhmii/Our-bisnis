# Aplikasi Penjualan Kopi Tutug

Fitur:
- Login admin (PIN awal 1234)
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
- PWA: dapat di-install di Windows/Android/iPhone jika di-host melalui HTTPS

Catatan:
- Data saat ini tersimpan lokal di perangkat/browser (localStorage), jadi belum otomatis sinkron antar perangkat.
- Untuk data yang sama-sama bisa dibuka dari banyak HP/komputer, perlu backend/database online.

Cara menjalankan:
1. Buka folder ini di VS Code.
2. Jalankan Live Server.
3. Buka URL http://localhost:5500 (atau port Live Server kamu).
4. Login dengan PIN 1234.
5. Untuk instal di HP, upload project ke hosting HTTPS (mis. GitHub Pages/Netlify/Vercel), lalu buka URL tersebut dari HP dan pilih Add to Home Screen/Install App.
