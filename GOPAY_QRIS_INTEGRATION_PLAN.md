# Rencana Integrasi GoPay / QRIS untuk El Matcha × el kopi

## Kesimpulan utama

QRIS pada gambar yang digunakan aplikasi saat ini adalah **QRIS statis**. QR tersebut dapat ditampilkan dan dipindai oleh GoPay atau aplikasi QRIS lain, tetapi aplikasi POS tidak dapat mengetahui secara otomatis siapa yang membayar hanya dari gambar QR. Pembayaran harus dikonfirmasi manual oleh pemilik melalui aplikasi merchant, kemudian nominal yang benar-benar diterima dimasukkan ke transaksi.

Untuk notifikasi pembayaran otomatis, aplikasi membutuhkan **QRIS dinamis** yang dibuat untuk setiap transaksi melalui backend payment gateway, bukan menaruh server key di browser. Alur yang aman adalah membuat order unik, meminta QR dinamis dari backend, menampilkan QR ke kasir/pelanggan, menerima webhook berstatus pembayaran, memverifikasi signature/status dan nominal, lalu memperbarui transaksi serta kas secara idempotent.

## Perbandingan pilihan

| Pilihan | Cara kerja | Notifikasi otomatis | Kelebihan | Kekurangan | Kebutuhan setup |
|---|---|---:|---|---|---|
| QRIS statis saat ini | Satu QR tetap ditampilkan; kasir mengecek aplikasi merchant dan mengisi nominal diterima | Tidak | Paling sederhana, langsung bisa dipakai, tidak memerlukan API key | Tidak ada pencocokan otomatis bill dan nominal; risiko salah input lebih tinggi | Tidak ada selain file QR dan prosedur konfirmasi manual |
| QRIS dinamis melalui Midtrans | Backend membuat transaksi/order unik dan meminta QR; gateway mengirim HTTP notification saat settlement | Ya | Mendukung QR per transaksi, order ID, status pending/settlement/expire, dan webhook | Memerlukan akun payment gateway, server key di backend, konfigurasi URL publik, dan biaya/ketentuan provider | Midtrans account, server key, endpoint webhook HTTPS, tabel status pembayaran |
| Integrasi langsung GoPay API | Backend membuat payment dan menerima notification/status dari GoPay sesuai produk/akses merchant | Ya, sesuai produk dan akses merchant | Kontrol lebih langsung terhadap alur GoPay | Onboarding dan kontrak/API credential lebih khusus; tidak cocok ditaruh di frontend | Akses merchant/API GoPay, backend HTTPS, kredensial server, endpoint notification |

## Arsitektur yang direkomendasikan

Tahap awal menggunakan QRIS statis tetap aman apabila transaksi QRIS tidak langsung ditandai lunas oleh sistem. Kasir harus melihat bukti pembayaran di aplikasi merchant dan memasukkan nominal yang benar-benar diterima. Setelah nominal disimpan, mesin pembayaran yang sama menghitung paid amount, sisa piutang, dan kas masuk.

Tahap otomatis menggunakan QRIS dinamis melalui backend. Frontend hanya memanggil endpoint aplikasi seperti `POST /api/payments/create`, menerima `order_id`, `transaction_id`, status `pending`, dan URL/gambar QR. Server key tidak pernah dikirim ke browser. Payment provider mengirim `POST` webhook ke endpoint publik seperti `/api/payments/webhook`; endpoint memverifikasi signature, mencocokkan `order_id`, `gross_amount`, mata uang, dan status `settlement`, lalu menulis status pembayaran secara idempotent. Frontend dapat menerima perubahan melalui Supabase Realtime, polling ringan setelah membuat order, atau memuat ulang status saat halaman dibuka.

> Pembayaran hanya boleh dianggap berhasil setelah status provider terverifikasi sebagai settlement/success. Tampilan sukses pada aplikasi GoPay saja tidak cukup untuk mengubah status transaksi.

## Data yang perlu ditambahkan

Transaksi payment gateway perlu memiliki `payment_provider`, `provider_order_id`, `provider_transaction_id`, `payment_status`, `payment_amount`, `payment_expires_at`, `paid_at`, `signature_verified`, dan `notification_received_at`. Tabel webhook atau payment events perlu menyimpan event ID/order ID unik untuk mencegah webhook yang sama menambah kas dua kali.

Saat status berubah menjadi settlement, sistem harus mencari penjualan berdasarkan `provider_order_id`, memastikan nominal settlement sama dengan total yang diharapkan, menambahkan satu cash entry dengan `source = payment_webhook`, menutup piutang terkait bila ada, dan menandai event sebagai processed. Status pending, expire, deny, cancel, dan refund tidak boleh menambah kas masuk.

## Rujukan resmi

[1] [GoPay technical documentation](https://doc.gopay.com/) menjelaskan bahwa pembayaran memiliki payment ID, status lifecycle, pengecekan status, dan HTTP notification ketika status berubah.

[2] [Midtrans — GoPay & QRIS](https://docs.midtrans.com/reference/gopay) menjelaskan perbedaan alur desktop QRIS dan smartphone GoPay, serta bahwa Static QRIS dapat dibuat dari dashboard merchant.

[3] [Midtrans — GoPay QRIS POS Integration](https://docs.midtrans.com/docs/gopay-qris-pos-integration) menjelaskan alur POS: backend membuat QR, frontend menampilkan QR, dan backend menerima HTTP notification. Dokumentasi tersebut juga menyatakan status settlement harus diverifikasi sebelum barang/jasa dianggap dibayar.

[4] [Midtrans — HTTP(S) Notification / Webhooks](https://docs.midtrans.com/docs/https-notification-webhooks) menjelaskan endpoint notification harus dapat diakses dari internet publik dan payload harus diverifikasi menggunakan signature key.
