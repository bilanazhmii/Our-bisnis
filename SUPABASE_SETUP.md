# Panduan Setup Supabase untuk Sinkronisasi Data

## Overview
Aplikasi ini sekarang mendukung sinkronisasi data menggunakan Supabase, yang memungkinkan:
- Login/Register dengan email dan password
- Sinkronisasi data antar perangkat (HP, komputer, dll)
- Backup data otomatis ke cloud
- Akses data dari mana saja

## Langkah 1: Buat Project Supabase

1. Buka [https://supabase.com](https://supabase.com)
2. Sign up atau login
3. Klik "New Project"
4. Isi detail project:
   - **Name**: `kopi-tutug-pos` (atau nama lain)
   - **Database Password**: Buat password yang kuat dan simpan
   - **Region**: Pilih region terdekat (misal: Singapore)
5. Klik "Create new project"
6. Tunggu beberapa menit hingga project siap

## Langkah 2: Dapatkan Kredensial API

1. Buka project yang baru dibuat
2. Masuk ke **Settings** → **API**
3. Copy nilai berikut:
   - **Project URL**: `https://xxxxxxxxxxxx.supabase.co`
   - **anon public key**: Kunci yang dimulai dengan `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

## Langkah 3: Update Konfigurasi

### Opsi A: Menggunakan config.js (Untuk Development)

1. Buka file `config.js` di project
2. Ganti nilai berikut dengan kredensial dari Supabase:

```javascript
window.SUPABASE_URL = 'https://your-project-id.supabase.co';
window.SUPABASE_ANON_KEY = 'your-anon-key-here';
```

### Opsi B: Menggunakan .env (Untuk Production)

1. Buka file `.env` di project
2. Ganti nilai berikut:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

**PENTING**: Jangan pernah commit file `.env` ke GitHub! File ini sudah ada di `.gitignore`.

## Langkah 4: Buat Tabel di Database

1. Di dashboard Supabase, masuk ke **SQL Editor**
2. Klik "New Query"
3. Copy dan jalankan SQL berikut:

```sql
-- Tabel untuk menyimpan data produk
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cost NUMERIC DEFAULT 0,
  price NUMERIC DEFAULT 0,
  stock INTEGER DEFAULT 0,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabel untuk menyimpan data penjualan
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  qty INTEGER DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  profit NUMERIC DEFAULT 0,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- Policy untuk products: User hanya bisa akses data sendiri
CREATE POLICY "Users can view own products"
  ON products FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own products"
  ON products FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own products"
  ON products FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own products"
  ON products FOR DELETE
  USING (auth.uid()::text = user_id);

-- Policy untuk sales: User hanya bisa akses data sendiri
CREATE POLICY "Users can view own sales"
  ON sales FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own sales"
  ON sales FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own sales"
  ON sales FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own sales"
  ON sales FOR DELETE
  USING (auth.uid()::text = user_id);
```

4. Klik "Run" untuk mengeksekusi SQL

## Langkah 5: Konfigurasi Email Authentication

1. Di dashboard Supabase, masuk ke **Authentication** → **Providers**
2. Pastikan **Email** provider sudah enabled
3. (Opsional) Untuk development, Anda bisa disable email confirmation:
   - Masuk ke **Authentication** → **Settings**
   - Scroll ke "Email Confirmation"
   - Set "Confirm email" ke "Turn off"
   - Klik "Save"

## Langkah 6: Testing

1. Buka aplikasi di browser
2. Di halaman login, klik tab "Email"
3. Klik "Daftar Akun Baru"
4. Masukkan email dan password
5. Setelah registrasi berhasil, login dengan email dan password tersebut
6. Data akan otomatis disinkronisasi ke Supabase

## Cara Penggunaan

### Login dengan PIN (Local Storage)
- Masukkan PIN (default: 1234)
- Data tersimpan di browser lokal
- Tidak sinkron antar perangkat

### Login dengan Email (Supabase)
- Klik tab "Email" di halaman login
- Login dengan email dan password
- Data otomatis sinkron ke cloud
- Dapat diakses dari perangkat lain dengan login yang sama

### Sinkronisasi Otomatis
- Setiap kali data diubah (tambah/edit/hapus), data otomatis disinkronkan ke Supabase
- Saat login berhasil, data dari Supabase akan di-download ke lokal
- Data lokal dan cloud akan selalu disinkronisasi

## Troubleshooting

### Error "Supabase credentials not found"
- Pastikan `config.js` sudah diisi dengan kredensial yang benar
- Pastikan file `config.js` diload sebelum `script.js`

### Error "Failed to initialize Supabase"
- Cek console browser untuk detail error
- Pastikan kredensial Supabase valid
- Pastikan project Supabase sudah aktif

### Data tidak sinkron
- Pastikan user sudah login dengan email
- Cek console browser untuk error
- Pastikan RLS policies sudah di-setup dengan benar
- Pastikan user_id di tabel cocok dengan auth.uid()

### Login/Register gagal
- Pastikan email provider sudah enabled di Supabase
- Cek apakah email confirmation di-enable (perlu verifikasi email)
- Pastikan password memenuhi requirement (minimal 6 karakter)

## Security Notes

- **Jangan pernah share** anon key atau service role key
- **Jangan commit** file `.env` atau `config.js` dengan kredensial asli ke GitHub
- **Gunakan RLS** untuk memastikan user hanya bisa akses data sendiri
- **Gunakan environment variables** untuk production deployment

## Deployment

Untuk deployment ke production:

1. Gunakan environment variables di hosting platform
2. Jangan hardcode kredensial di config.js
3. Pastikan HTTPS di-enable (required untuk Supabase)
4. Pertimbangkan untuk menggunakan service role key hanya di server-side

## Fitur Tambahan yang Ditambahkan

- ✅ Login/Register dengan email dan password
- ✅ Sinkronisasi data antar perangkat
- ✅ Row Level Security (RLS) untuk keamanan data
- ✅ Backup otomatis ke cloud
- ✅ Mendukung kedua metode login (PIN dan Email)
- ✅ Tab switcher untuk memilih metode login
