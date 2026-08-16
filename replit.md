# Data Penjualan Kopi Tutug

Aplikasi PWA statis untuk mencatat penjualan, stok barang, laporan, dan backup data.

## Menjalankan di Replit

Workflow `Start application` menjalankan:

```bash
npx serve . -p 5000 -n
```

Buka preview aplikasi, lalu masuk dengan PIN awal `1234`.

## Catatan data

Data aplikasi disimpan di `localStorage` browser. Karena itu data, PIN yang sudah diganti, dan status login tidak otomatis terbagi antar perangkat. Gunakan menu Backup & Restore untuk memindahkan data secara manual.