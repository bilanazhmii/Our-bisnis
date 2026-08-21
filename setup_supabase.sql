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

-- Upgrade older installations without removing existing business data.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS product TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS qty INTEGER DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cost NUMERIC DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS total NUMERIC DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS profit NUMERIC DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'valid_role' AND conrelid = 'public.user_roles'::regclass
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT valid_role CHECK (role IN ('user', 'admin', 'super_admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS products_user_id_idx ON public.products (user_id);
CREATE INDEX IF NOT EXISTS sales_user_id_idx ON public.sales (user_id);
CREATE INDEX IF NOT EXISTS sales_user_id_date_idx ON public.sales (user_id, date);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_set_updated_at ON public.products;
CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS sales_set_updated_at ON public.sales;
CREATE TRIGGER sales_set_updated_at
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS user_roles_set_updated_at ON public.user_roles;
CREATE TRIGGER user_roles_set_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
    NEW.id::text,
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


-- ============================================
-- MODUL BISNIS: MENU, PEMBAYARAN, KAS, PIUTANG
-- Jalankan bagian ini pada instalasi lama maupun baru.
-- ============================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Umum';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'pcs';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS change_amount NUMERIC DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS change_recipient TEXT DEFAULT '';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer TEXT DEFAULT '';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS due_date TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS receivable_id TEXT;

CREATE TABLE IF NOT EXISTS public.cash_entries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'in',
  category TEXT NOT NULL DEFAULT 'Lainnya',
  amount NUMERIC NOT NULL DEFAULT 0,
  party TEXT DEFAULT '',
  reference TEXT DEFAULT '',
  note TEXT DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT cash_entries_type CHECK (type IN ('in', 'out')),
  CONSTRAINT cash_entries_amount CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS public.receivables (
  id TEXT PRIMARY KEY,
  sale_id TEXT,
  date TEXT NOT NULL,
  customer TEXT NOT NULL,
  due_date TEXT,
  total NUMERIC NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT receivables_total CHECK (total >= 0)
);

CREATE TABLE IF NOT EXISTS public.receivable_payments (
  id TEXT PRIMARY KEY,
  receivable_id TEXT NOT NULL,
  date TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'cash',
  note TEXT DEFAULT '',
  user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT receivable_payments_amount CHECK (amount > 0)
);

-- Complete older business tables without dropping existing rows.
ALTER TABLE public.cash_entries ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE public.cash_entries ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'in';
ALTER TABLE public.cash_entries ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Lainnya';
ALTER TABLE public.cash_entries ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE public.cash_entries ADD COLUMN IF NOT EXISTS party TEXT DEFAULT '';
ALTER TABLE public.cash_entries ADD COLUMN IF NOT EXISTS reference TEXT DEFAULT '';
ALTER TABLE public.cash_entries ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE public.cash_entries ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE public.cash_entries ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE public.cash_entries ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.cash_entries ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.cash_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS sale_id TEXT;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS bill_no TEXT;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS customer TEXT DEFAULT '';
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS due_date TEXT;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS total NUMERIC DEFAULT 0;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS receivable_id TEXT;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS date TEXT;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'cash';
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Safe legacy ownership repair: if exactly one Auth user exists, assign orphaned
-- business rows to that user. With multiple users, no unsafe guess is made.
DO $$
DECLARE
  owner_id TEXT;
  owner_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO owner_count FROM auth.users;
  IF owner_count = 1 THEN
    SELECT id::text INTO owner_id FROM auth.users LIMIT 1;
    UPDATE public.products SET user_id = owner_id WHERE user_id IS NULL OR btrim(user_id) = '';
    UPDATE public.sales SET user_id = owner_id WHERE user_id IS NULL OR btrim(user_id) = '';
    UPDATE public.cash_entries SET user_id = owner_id WHERE user_id IS NULL OR btrim(user_id) = '';
    UPDATE public.receivables SET user_id = owner_id WHERE user_id IS NULL OR btrim(user_id) = '';
    UPDATE public.receivable_payments SET user_id = owner_id WHERE user_id IS NULL OR btrim(user_id) = '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cash_entries_user_id_date_idx ON public.cash_entries (user_id, date);
CREATE INDEX IF NOT EXISTS cash_entries_user_id_source_idx ON public.cash_entries (user_id, source, source_id);
CREATE INDEX IF NOT EXISTS receivables_user_id_due_date_idx ON public.receivables (user_id, due_date);
CREATE INDEX IF NOT EXISTS receivable_payments_user_id_receivable_idx ON public.receivable_payments (user_id, receivable_id);

DROP TRIGGER IF EXISTS cash_entries_set_updated_at ON public.cash_entries;
CREATE TRIGGER cash_entries_set_updated_at BEFORE UPDATE ON public.cash_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS receivables_set_updated_at ON public.receivables;
CREATE TRIGGER receivables_set_updated_at BEFORE UPDATE ON public.receivables FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS receivable_payments_set_updated_at ON public.receivable_payments;
CREATE TRIGGER receivable_payments_set_updated_at BEFORE UPDATE ON public.receivable_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivable_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own cash entries" ON public.cash_entries;
DROP POLICY IF EXISTS "Users can insert own cash entries" ON public.cash_entries;
DROP POLICY IF EXISTS "Users can update own cash entries" ON public.cash_entries;
DROP POLICY IF EXISTS "Users can delete own cash entries" ON public.cash_entries;
CREATE POLICY "Users can view own cash entries" ON public.cash_entries FOR SELECT USING (auth.uid()::text = user_id OR public.is_admin());
CREATE POLICY "Users can insert own cash entries" ON public.cash_entries FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can update own cash entries" ON public.cash_entries FOR UPDATE USING (auth.uid()::text = user_id OR public.is_admin()) WITH CHECK (auth.uid()::text = user_id OR public.is_admin());
CREATE POLICY "Users can delete own cash entries" ON public.cash_entries FOR DELETE USING (auth.uid()::text = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can view own receivables" ON public.receivables;
DROP POLICY IF EXISTS "Users can insert own receivables" ON public.receivables;
DROP POLICY IF EXISTS "Users can update own receivables" ON public.receivables;
DROP POLICY IF EXISTS "Users can delete own receivables" ON public.receivables;
CREATE POLICY "Users can view own receivables" ON public.receivables FOR SELECT USING (auth.uid()::text = user_id OR public.is_admin());
CREATE POLICY "Users can insert own receivables" ON public.receivables FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can update own receivables" ON public.receivables FOR UPDATE USING (auth.uid()::text = user_id OR public.is_admin()) WITH CHECK (auth.uid()::text = user_id OR public.is_admin());
CREATE POLICY "Users can delete own receivables" ON public.receivables FOR DELETE USING (auth.uid()::text = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can view own receivable payments" ON public.receivable_payments;
DROP POLICY IF EXISTS "Users can insert own receivable payments" ON public.receivable_payments;
DROP POLICY IF EXISTS "Users can update own receivable payments" ON public.receivable_payments;
DROP POLICY IF EXISTS "Users can delete own receivable payments" ON public.receivable_payments;
CREATE POLICY "Users can view own receivable payments" ON public.receivable_payments FOR SELECT USING (auth.uid()::text = user_id OR public.is_admin());
CREATE POLICY "Users can insert own receivable payments" ON public.receivable_payments FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "Users can update own receivable payments" ON public.receivable_payments FOR UPDATE USING (auth.uid()::text = user_id OR public.is_admin()) WITH CHECK (auth.uid()::text = user_id OR public.is_admin());
CREATE POLICY "Users can delete own receivable payments" ON public.receivable_payments FOR DELETE USING (auth.uid()::text = user_id OR public.is_admin());


-- Automatic underpayment receivable metadata
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS bill_no TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS tendered_amount NUMERIC DEFAULT 0;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS bill_no TEXT;
CREATE INDEX IF NOT EXISTS sales_user_id_bill_no_idx ON public.sales (user_id, bill_no);
CREATE INDEX IF NOT EXISTS receivables_user_id_bill_no_idx ON public.receivables (user_id, bill_no);


-- ============================================
-- AUTH SIGNUP REPAIR (IDEMPOTENT)
-- Prevent optional role-sync failures from aborting Auth signup.
-- ============================================

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
UPDATE public.user_roles SET email = '' WHERE email IS NULL;
ALTER TABLE public.user_roles ALTER COLUMN email SET DEFAULT '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF to_regclass('public.user_roles') IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = NEW.id::text
  ) THEN
    INSERT INTO public.user_roles (id, user_id, role, email)
    VALUES (NEW.id::text, NEW.id::text, 'user', COALESCE(NEW.email, ''));
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user role sync failed for %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.user_roles (id, user_id, role, email)
SELECT u.id::text, u.id::text, 'user', COALESCE(u.email, '')
FROM auth.users AS u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles AS r WHERE r.user_id = u.id::text
);

NOTIFY pgrst, 'reload schema';


-- ============================================
-- ORDER DELIVERY STATUS (IDEMPOTENT)
-- Indicates whether the customer has received the order.
-- Existing sales default to not yet received.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS order_received BOOLEAN DEFAULT FALSE;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS change_returned_confirmed BOOLEAN DEFAULT FALSE;

-- CHANGE RETURN LEDGER (IDEMPOTENT)
-- Tracks change that is still owed or returned in parts.
-- ============================================
CREATE TABLE IF NOT EXISTS public.change_returns (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  bill_no TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  recipient TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  note TEXT NOT NULL DEFAULT '',
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS sale_id TEXT;
ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS bill_no TEXT DEFAULT '';
ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS recipient TEXT DEFAULT '';
ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

DO $$
DECLARE
  owner_id UUID;
  owner_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO owner_count FROM auth.users;
  IF owner_count = 1 THEN
    SELECT id INTO owner_id FROM auth.users LIMIT 1;
    UPDATE public.change_returns SET user_id = owner_id WHERE user_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.change_returns ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS change_returns_user_sale_idx ON public.change_returns (user_id, sale_id);
CREATE INDEX IF NOT EXISTS change_returns_user_date_idx ON public.change_returns (user_id, date DESC);
-- ============================================
-- SHARED WORKSPACE FINAL POLICIES
-- Rerunning this file must not restore per-user isolation.
-- All authenticated POS accounts share the same business dataset.
-- ============================================
DROP POLICY IF EXISTS "Users can view own products" ON public.products;
DROP POLICY IF EXISTS "Users can insert own products" ON public.products;
DROP POLICY IF EXISTS "Users can update own products" ON public.products;
DROP POLICY IF EXISTS "Users can delete own products" ON public.products;
DROP POLICY IF EXISTS "Users can view own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can insert own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can update own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can delete own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can view own cash entries" ON public.cash_entries;
DROP POLICY IF EXISTS "Users can insert own cash entries" ON public.cash_entries;
DROP POLICY IF EXISTS "Users can update own cash entries" ON public.cash_entries;
DROP POLICY IF EXISTS "Users can delete own cash entries" ON public.cash_entries;
DROP POLICY IF EXISTS "Users can view own receivables" ON public.receivables;
DROP POLICY IF EXISTS "Users can insert own receivables" ON public.receivables;
DROP POLICY IF EXISTS "Users can update own receivables" ON public.receivables;
DROP POLICY IF EXISTS "Users can delete own receivables" ON public.receivables;
DROP POLICY IF EXISTS "Users can view own receivable payments" ON public.receivable_payments;
DROP POLICY IF EXISTS "Users can insert own receivable payments" ON public.receivable_payments;
DROP POLICY IF EXISTS "Users can update own receivable payments" ON public.receivable_payments;
DROP POLICY IF EXISTS "Users can delete own receivable payments" ON public.receivable_payments;
DROP POLICY IF EXISTS "Users can view own change returns" ON public.change_returns;
DROP POLICY IF EXISTS "Users can insert own change returns" ON public.change_returns;
DROP POLICY IF EXISTS "Users can update own change returns" ON public.change_returns;
DROP POLICY IF EXISTS "Users can delete own change returns" ON public.change_returns;

DROP POLICY IF EXISTS "POS shared products select" ON public.products;
DROP POLICY IF EXISTS "POS shared products insert" ON public.products;
DROP POLICY IF EXISTS "POS shared products update" ON public.products;
DROP POLICY IF EXISTS "POS shared products delete" ON public.products;
CREATE POLICY "POS shared products select" ON public.products FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared products insert" ON public.products FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared products update" ON public.products FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared products delete" ON public.products FOR DELETE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "POS shared sales select" ON public.sales;
DROP POLICY IF EXISTS "POS shared sales insert" ON public.sales;
DROP POLICY IF EXISTS "POS shared sales update" ON public.sales;
DROP POLICY IF EXISTS "POS shared sales delete" ON public.sales;
CREATE POLICY "POS shared sales select" ON public.sales FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared sales insert" ON public.sales FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared sales update" ON public.sales FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared sales delete" ON public.sales FOR DELETE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "POS shared cash select" ON public.cash_entries;
DROP POLICY IF EXISTS "POS shared cash insert" ON public.cash_entries;
DROP POLICY IF EXISTS "POS shared cash update" ON public.cash_entries;
DROP POLICY IF EXISTS "POS shared cash delete" ON public.cash_entries;
CREATE POLICY "POS shared cash select" ON public.cash_entries FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared cash insert" ON public.cash_entries FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared cash update" ON public.cash_entries FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared cash delete" ON public.cash_entries FOR DELETE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "POS shared receivables select" ON public.receivables;
DROP POLICY IF EXISTS "POS shared receivables insert" ON public.receivables;
DROP POLICY IF EXISTS "POS shared receivables update" ON public.receivables;
DROP POLICY IF EXISTS "POS shared receivables delete" ON public.receivables;
CREATE POLICY "POS shared receivables select" ON public.receivables FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared receivables insert" ON public.receivables FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared receivables update" ON public.receivables FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared receivables delete" ON public.receivables FOR DELETE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "POS shared payments select" ON public.receivable_payments;
DROP POLICY IF EXISTS "POS shared payments insert" ON public.receivable_payments;
DROP POLICY IF EXISTS "POS shared payments update" ON public.receivable_payments;
DROP POLICY IF EXISTS "POS shared payments delete" ON public.receivable_payments;
CREATE POLICY "POS shared payments select" ON public.receivable_payments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared payments insert" ON public.receivable_payments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared payments update" ON public.receivable_payments FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared payments delete" ON public.receivable_payments FOR DELETE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "POS shared change select" ON public.change_returns;
DROP POLICY IF EXISTS "POS shared change insert" ON public.change_returns;
DROP POLICY IF EXISTS "POS shared change update" ON public.change_returns;
DROP POLICY IF EXISTS "POS shared change delete" ON public.change_returns;
CREATE POLICY "POS shared change select" ON public.change_returns FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared change insert" ON public.change_returns FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared change update" ON public.change_returns FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared change delete" ON public.change_returns FOR DELETE USING (auth.uid() IS NOT NULL);

NOTIFY pgrst, 'reload schema';
