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

1. Copy file `config.example.js` ke `config.js`
2. Buka file `config.js` di project
3. Ganti nilai berikut dengan kredensial dari Supabase:

```javascript
window.SUPABASE_URL = 'https://your-project-id.supabase.co';
window.SUPABASE_ANON_KEY = 'your-anon-key-here';
```

4. Uncomment script config.js di `index.html`:
```html
<script src="config.js"></script>
```

**CATATAN**: File `config.js` sudah ada di `.gitignore` untuk keamanan.

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

-- Tabel untuk manajemen role user
CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user', -- 'user', 'admin', 'super_admin'
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_role CHECK (role IN ('user', 'admin', 'super_admin'))
);

-- Enable Row Level Security (RLS)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Policy untuk products: User biasa hanya bisa akses data sendiri, admin bisa akses semua
CREATE POLICY "Users can view own products"
  ON products FOR SELECT
  USING (
    auth.uid()::text = user_id OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()::text
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Users can insert own products"
  ON products FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own products"
  ON products FOR UPDATE
  USING (
    auth.uid()::text = user_id OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()::text
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Users can delete own products"
  ON products FOR DELETE
  USING (auth.uid()::text = user_id);

-- Policy untuk sales: User biasa hanya bisa akses data sendiri, admin bisa akses semua
CREATE POLICY "Users can view own sales"
  ON sales FOR SELECT
  USING (
    auth.uid()::text = user_id OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()::text
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Users can insert own sales"
  ON sales FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own sales"
  ON sales FOR UPDATE
  USING (
    auth.uid()::text = user_id OR
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()::text
      AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Users can delete own sales"
  ON sales FOR DELETE
  USING (auth.uid()::text = user_id);

-- Policy untuk user_roles: Hanya super_admin yang bisa kelola roles
CREATE POLICY "Super admins can manage all roles"
  ON user_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()::text
      AND role = 'super_admin'
    )
  );

-- Policy untuk user agar bisa view role sendiri
CREATE POLICY "Users can view own role"
  ON user_roles FOR SELECT
  USING (auth.uid()::text = user_id);

-- Function untuk check user role
CREATE OR REPLACE FUNCTION get_user_role(user_id_param TEXT)
RETURNS TEXT AS $$
  SELECT role FROM user_roles WHERE user_id = user_id_param;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Function untuk otomatis create user role saat user baru register
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_roles (id, user_id, role, email)
  VALUES (
    gen_random_uuid()::text,
    NEW.id::text,
    'user',
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger untuk otomatis create role saat user baru
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

4. Klik "Run" untuk mengeksekusi SQL

## Langkah 5: Konfigurasi Email Authentication

1. Di dashboard Supabase, masuk ke **Authentication** → **Providers**
2. Pastikan **Email** provider sudah enabled
3. **PENTING**: Untuk keamanan, email confirmation harus di-enable:
   - Masuk ke **Authentication** → **Settings**
   - Scroll ke "Email Confirmation"
   - Pastikan "Confirm email" dalam keadaan "Turn on"
   - Klik "Save"
4. Configure email settings (SMTP) untuk production:
   - Masuk ke **Authentication** → **Settings** → **SMTP Settings**
   - Setup SMTP provider (SendGrid, Mailgun, dll)
   - Atau gunakan Supabase built-in email untuk development

## Langkah 6: Setup Admin User Pertama

Setelah database setup, Anda perlu membuat admin user pertama:

1. Register akun baru melalui aplikasi
2. Verifikasi email melalui link yang dikirim ke email
3. Login ke Supabase dashboard
4. Masuk ke **SQL Editor**
5. Jalankan SQL berikut untuk menjadikan user pertama sebagai super_admin:

```sql
-- Ganti 'your-email@example.com' dengan email admin yang baru didaftarkan
UPDATE user_roles
SET role = 'super_admin'
WHERE email = 'your-email@example.com';
```

6. User tersebut sekarang memiliki akses admin dashboard

## Langkah 7: Testing

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
- ✅ Sistem Role (User, Admin, Super Admin)
- ✅ Admin Dashboard untuk manajemen user
- ✅ Email verification wajib untuk keamanan
- ✅ Role-based access control
- ✅ Manajemen role user oleh super admin

## Sistem Role dan Admin

### Role Hierarchy
1. **User**: Role default untuk user baru, akses data sendiri saja
2. **Admin**: Bisa melihat semua data user, mengubah role user biasa
3. **Super Admin**: Full access, bisa mengubah role admin dan menghapus user

### Setup Admin Pertama
Setelah database setup, buat admin pertama:
1. Register akun baru melalui aplikasi
2. Verifikasi email
3. Jalankan SQL di Supabase untuk menjadikan super admin:
```sql
UPDATE user_roles SET role = 'super_admin' WHERE email = 'your-email@example.com';
```

### Admin Dashboard
- Hanya user dengan role admin/super admin yang bisa akses
- Melihat daftar semua user yang terdaftar
- Mengubah role user (super admin only)
- Menghapus user (super admin only)
- Statistik user (total, admin, user biasa)

### Email Verification
- Email verification WAJIB di-enable untuk keamanan
- User tidak bisa login sebelum email diverifikasi
- Mencegah registrasi spam dan fake accounts
- Pastikan SMTP settings di Supabase sudah dikonfigurasi
