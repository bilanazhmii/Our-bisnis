-- ============================================
-- COMPLETE SUPABASE SETUP SCRIPT
-- Copy semua script ini dan paste ke Supabase SQL Editor
-- ============================================

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

-- Helper functions must be created before RLS policies. They avoid recursive
-- user_roles policies when checking whether the current user is an admin.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()::text
    AND role IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()::text
    AND role = 'super_admin'
  );
$$;

-- Enable Row Level Security (RLS)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- This makes the script safe to run again when updating an existing project.
DROP POLICY IF EXISTS "Users can view own products" ON products;
DROP POLICY IF EXISTS "Users can insert own products" ON products;
DROP POLICY IF EXISTS "Users can update own products" ON products;
DROP POLICY IF EXISTS "Users can delete own products" ON products;
DROP POLICY IF EXISTS "Users can view own sales" ON sales;
DROP POLICY IF EXISTS "Users can insert own sales" ON sales;
DROP POLICY IF EXISTS "Users can update own sales" ON sales;
DROP POLICY IF EXISTS "Users can delete own sales" ON sales;
DROP POLICY IF EXISTS "Super admins can manage all roles" ON user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON user_roles;

-- ============================================
-- POLICIES untuk PRODUCTS
-- ============================================

-- User biasa hanya bisa view data sendiri, admin bisa view semua
CREATE POLICY "Users can view own products"
  ON products FOR SELECT
  USING (
    auth.uid()::text = user_id OR
    public.is_admin()
  );

-- User hanya bisa insert data sendiri
CREATE POLICY "Users can insert own products"
  ON products FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- User biasa hanya bisa update data sendiri, admin bisa update semua
CREATE POLICY "Users can update own products"
  ON products FOR UPDATE
  USING (
    auth.uid()::text = user_id OR
    public.is_admin()
  );

-- User hanya bisa delete data sendiri
CREATE POLICY "Users can delete own products"
  ON products FOR DELETE
  USING (auth.uid()::text = user_id);

-- ============================================
-- POLICIES untuk SALES
-- ============================================

-- User biasa hanya bisa view data sendiri, admin bisa view semua
CREATE POLICY "Users can view own sales"
  ON sales FOR SELECT
  USING (
    auth.uid()::text = user_id OR
    public.is_admin()
  );

-- User hanya bisa insert data sendiri
CREATE POLICY "Users can insert own sales"
  ON sales FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- User biasa hanya bisa update data sendiri, admin bisa update semua
CREATE POLICY "Users can update own sales"
  ON sales FOR UPDATE
  USING (
    auth.uid()::text = user_id OR
    public.is_admin()
  );

-- User hanya bisa delete data sendiri
CREATE POLICY "Users can delete own sales"
  ON sales FOR DELETE
  USING (auth.uid()::text = user_id);

-- ============================================
-- POLICIES untuk USER_ROLES
-- ============================================

-- Hanya super_admin yang bisa kelola semua roles
CREATE POLICY "Super admins can manage all roles"
  ON user_roles FOR ALL
  USING (
    public.is_super_admin()
  );

-- User bisa view role sendiri
CREATE POLICY "Users can view own role"
  ON user_roles FOR SELECT
  USING (auth.uid()::text = user_id);

-- ============================================
-- FUNCTIONS dan TRIGGERS
-- ============================================

-- Function untuk otomatis create user role saat user baru register
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (id, user_id, role, email)
  VALUES (
    gen_random_uuid()::text,
    NEW.id::text,
    'user',
    NEW.email
  )
  ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email,
      updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Recreate the trigger so an existing project always uses the function above.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- SETUP ADMIN PERTAMA (GANTI EMAIL DIBAWAH)
-- ============================================

-- Uncomment dan jalankan baris ini setelah register akun admin pertama:
-- UPDATE user_roles SET role = 'super_admin' WHERE email = 'your-email@example.com';

-- ============================================
-- VERIFICATION SETUP
-- ============================================

-- Pastikan email confirmation di-enable di Supabase Dashboard:
-- Authentication → Settings → Email Confirmation → Turn on

-- Configure SMTP di Supabase Dashboard:
-- Authentication → Settings → SMTP Settings
-- Pilih provider: Supabase built-in (development) atau SendGrid (production)

-- ============================================
-- SETUP SELESAI
-- ============================================

-- Verifikasi setup:
-- SELECT * FROM user_roles;
-- SELECT * FROM products;
-- SELECT * FROM sales;
