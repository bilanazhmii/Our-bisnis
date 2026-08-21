-- ============================================================
-- EL MATCHA × EL KOPI — SUPABASE CLEAN REPAIR
-- ============================================================
-- PURPOSE:
--   Repair and align an existing POS database without deleting data.
--
-- SAFETY:
--   This script contains no DROP TABLE, TRUNCATE, DELETE, or reset.
--   DROP POLICY only replaces access rules; business rows are preserved.
--   Orphan ownership is backfilled only when exactly one Auth user exists.
--   If multiple Auth users exist, ownership is not guessed or changed.
--
-- RUN:
--   Supabase SQL Editor -> paste the complete file -> Run.
--   Review the result tables printed at the end.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Ensure all tables exist before altering legacy installations.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user',
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT 'Umum',
  unit TEXT DEFAULT 'pcs',
  cost NUMERIC DEFAULT 0,
  price NUMERIC DEFAULT 0,
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  note TEXT DEFAULT '',
  user_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sales (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL DEFAULT '',
  bill_no TEXT DEFAULT '',
  product_id TEXT,
  product TEXT NOT NULL DEFAULT '',
  price NUMERIC DEFAULT 0,
  qty INTEGER DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  profit NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  paid_amount NUMERIC DEFAULT 0,
  tendered_amount NUMERIC DEFAULT 0,
  change_amount NUMERIC DEFAULT 0,
  change_recipient TEXT DEFAULT '',
  order_received BOOLEAN DEFAULT FALSE,
  change_returned_confirmed BOOLEAN DEFAULT FALSE,
  customer TEXT DEFAULT '',
  due_date TEXT,
  note TEXT DEFAULT '',
  receivable_id TEXT,
  user_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cash_entries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'in',
  category TEXT NOT NULL DEFAULT 'Lainnya',
  amount NUMERIC NOT NULL DEFAULT 0,
  party TEXT DEFAULT '',
  reference TEXT DEFAULT '',
  note TEXT DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  user_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.receivables (
  id TEXT PRIMARY KEY,
  sale_id TEXT,
  bill_no TEXT DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  customer TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  total NUMERIC NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  user_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.receivable_payments (
  id TEXT PRIMARY KEY,
  receivable_id TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'cash',
  note TEXT DEFAULT '',
  user_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.change_returns (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  bill_no TEXT NOT NULL DEFAULT '',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  recipient TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2. Add every application column to older existing tables.
-- ------------------------------------------------------------
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Umum';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'pcs';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS date TEXT DEFAULT '';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS bill_no TEXT DEFAULT '';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS product_id TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS product TEXT DEFAULT '';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS qty INTEGER DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cost NUMERIC DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS total NUMERIC DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS profit NUMERIC DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS tendered_amount NUMERIC DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS change_amount NUMERIC DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS change_recipient TEXT DEFAULT '';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS order_received BOOLEAN DEFAULT FALSE;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS change_returned_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer TEXT DEFAULT '';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS due_date TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS receivable_id TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.cash_entries ADD COLUMN IF NOT EXISTS date TEXT DEFAULT '';
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
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS bill_no TEXT DEFAULT '';
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS date TEXT DEFAULT '';
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS customer TEXT DEFAULT '';
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS due_date TEXT;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS total NUMERIC DEFAULT 0;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS receivable_id TEXT;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS date TEXT DEFAULT '';
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'cash';
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS sale_id TEXT;
ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS bill_no TEXT DEFAULT '';
ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS recipient TEXT DEFAULT '';
ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;
ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.change_returns ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ------------------------------------------------------------
-- 3. Safe normalization of blank values. No business rows removed.
-- ------------------------------------------------------------
UPDATE public.products SET category = 'Umum' WHERE category IS NULL OR btrim(category) = '';
UPDATE public.products SET unit = 'pcs' WHERE unit IS NULL OR btrim(unit) = '';
UPDATE public.products SET cost = 0 WHERE cost IS NULL;
UPDATE public.products SET price = 0 WHERE price IS NULL;
UPDATE public.products SET stock = 0 WHERE stock IS NULL;
UPDATE public.products SET min_stock = 0 WHERE min_stock IS NULL;
UPDATE public.products SET active = TRUE WHERE active IS NULL;
UPDATE public.products SET note = '' WHERE note IS NULL;

UPDATE public.sales SET bill_no = id WHERE bill_no IS NULL OR btrim(bill_no) = '';
UPDATE public.sales SET payment_method = 'cash' WHERE payment_method IS NULL OR btrim(payment_method) = '';
UPDATE public.sales SET discount = 0 WHERE discount IS NULL;
UPDATE public.sales SET paid_amount = 0 WHERE paid_amount IS NULL;
UPDATE public.sales SET tendered_amount = paid_amount WHERE tendered_amount IS NULL;
UPDATE public.sales SET change_amount = 0 WHERE change_amount IS NULL;
UPDATE public.sales SET change_recipient = COALESCE(customer, '') WHERE change_recipient IS NULL;
UPDATE public.sales SET order_received = FALSE WHERE order_received IS NULL;
UPDATE public.sales SET change_returned_confirmed = FALSE WHERE change_returned_confirmed IS NULL;
UPDATE public.sales SET customer = '' WHERE customer IS NULL;
UPDATE public.sales SET note = '' WHERE note IS NULL;

UPDATE public.cash_entries SET type = 'in' WHERE type IS NULL OR type NOT IN ('in', 'out');
UPDATE public.cash_entries SET category = 'Lainnya' WHERE category IS NULL OR btrim(category) = '';
UPDATE public.cash_entries SET amount = 0 WHERE amount IS NULL;
UPDATE public.cash_entries SET party = '' WHERE party IS NULL;
UPDATE public.cash_entries SET reference = '' WHERE reference IS NULL;
UPDATE public.cash_entries SET note = '' WHERE note IS NULL;
UPDATE public.cash_entries SET source = 'manual' WHERE source IS NULL OR btrim(source) = '';

UPDATE public.receivables SET bill_no = COALESCE(sale_id, id) WHERE bill_no IS NULL OR btrim(bill_no) = '';
UPDATE public.receivables SET customer = '' WHERE customer IS NULL;
UPDATE public.receivables SET total = 0 WHERE total IS NULL;
UPDATE public.receivables SET note = '' WHERE note IS NULL;
UPDATE public.receivable_payments SET amount = 0 WHERE amount IS NULL;
UPDATE public.receivable_payments SET method = 'cash' WHERE method IS NULL OR btrim(method) = '';
UPDATE public.receivable_payments SET note = '' WHERE note IS NULL;
UPDATE public.change_returns SET bill_no = COALESCE(sale_id, id) WHERE bill_no IS NULL OR btrim(bill_no) = '';
UPDATE public.change_returns SET recipient = '' WHERE recipient IS NULL;
UPDATE public.change_returns SET amount = 0 WHERE amount IS NULL;
UPDATE public.change_returns SET note = '' WHERE note IS NULL;

-- ------------------------------------------------------------
-- 4. Safe ownership repair.
--    Only runs automatically when exactly one Auth user exists.
-- ------------------------------------------------------------
DO $$
DECLARE
  owner_text TEXT;
  owner_uuid UUID;
  owner_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO owner_count FROM auth.users;
  IF owner_count = 1 THEN
    SELECT id::text, id INTO owner_text, owner_uuid FROM auth.users LIMIT 1;
    UPDATE public.products SET user_id = owner_text WHERE user_id IS NULL OR btrim(user_id) = '';
    UPDATE public.sales SET user_id = owner_text WHERE user_id IS NULL OR btrim(user_id) = '';
    UPDATE public.cash_entries SET user_id = owner_text WHERE user_id IS NULL OR btrim(user_id) = '';
    UPDATE public.receivables SET user_id = owner_text WHERE user_id IS NULL OR btrim(user_id) = '';
    UPDATE public.receivable_payments SET user_id = owner_text WHERE user_id IS NULL OR btrim(user_id) = '';
    UPDATE public.change_returns SET user_id = owner_uuid WHERE user_id IS NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 5. Timestamp maintenance and indexes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pos_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pos_products_updated_at ON public.products;
CREATE TRIGGER pos_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.pos_set_updated_at();
DROP TRIGGER IF EXISTS pos_sales_updated_at ON public.sales;
CREATE TRIGGER pos_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.pos_set_updated_at();
DROP TRIGGER IF EXISTS pos_cash_entries_updated_at ON public.cash_entries;
CREATE TRIGGER pos_cash_entries_updated_at BEFORE UPDATE ON public.cash_entries FOR EACH ROW EXECUTE FUNCTION public.pos_set_updated_at();
DROP TRIGGER IF EXISTS pos_receivables_updated_at ON public.receivables;
CREATE TRIGGER pos_receivables_updated_at BEFORE UPDATE ON public.receivables FOR EACH ROW EXECUTE FUNCTION public.pos_set_updated_at();
DROP TRIGGER IF EXISTS pos_receivable_payments_updated_at ON public.receivable_payments;
CREATE TRIGGER pos_receivable_payments_updated_at BEFORE UPDATE ON public.receivable_payments FOR EACH ROW EXECUTE FUNCTION public.pos_set_updated_at();

CREATE INDEX IF NOT EXISTS pos_products_user_idx ON public.products (user_id);
CREATE INDEX IF NOT EXISTS pos_sales_user_date_idx ON public.sales (user_id, date);
CREATE INDEX IF NOT EXISTS pos_sales_user_bill_idx ON public.sales (user_id, bill_no);
CREATE INDEX IF NOT EXISTS pos_cash_user_date_idx ON public.cash_entries (user_id, date);
CREATE INDEX IF NOT EXISTS pos_cash_user_source_idx ON public.cash_entries (user_id, source, source_id);
CREATE INDEX IF NOT EXISTS pos_receivables_user_due_idx ON public.receivables (user_id, due_date);
CREATE INDEX IF NOT EXISTS pos_payments_user_receivable_idx ON public.receivable_payments (user_id, receivable_id);
CREATE INDEX IF NOT EXISTS pos_change_user_sale_idx ON public.change_returns (user_id, sale_id);
CREATE INDEX IF NOT EXISTS pos_change_user_date_idx ON public.change_returns (user_id, date DESC);

-- ------------------------------------------------------------
-- 6. RLS policies. Replacing policies does not touch business data.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pos_is_admin()
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

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivable_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "POS products select own" ON public.products;
DROP POLICY IF EXISTS "POS products insert own" ON public.products;
DROP POLICY IF EXISTS "POS products update own" ON public.products;
DROP POLICY IF EXISTS "POS products delete own" ON public.products;
CREATE POLICY "POS products select own" ON public.products FOR SELECT USING (auth.uid()::text = user_id::text OR public.pos_is_admin());
CREATE POLICY "POS products insert own" ON public.products FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "POS products update own" ON public.products FOR UPDATE USING (auth.uid()::text = user_id::text OR public.pos_is_admin()) WITH CHECK (auth.uid()::text = user_id::text OR public.pos_is_admin());
CREATE POLICY "POS products delete own" ON public.products FOR DELETE USING (auth.uid()::text = user_id::text OR public.pos_is_admin());

DROP POLICY IF EXISTS "POS sales select own" ON public.sales;
DROP POLICY IF EXISTS "POS sales insert own" ON public.sales;
DROP POLICY IF EXISTS "POS sales update own" ON public.sales;
DROP POLICY IF EXISTS "POS sales delete own" ON public.sales;
CREATE POLICY "POS sales select own" ON public.sales FOR SELECT USING (auth.uid()::text = user_id::text OR public.pos_is_admin());
CREATE POLICY "POS sales insert own" ON public.sales FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "POS sales update own" ON public.sales FOR UPDATE USING (auth.uid()::text = user_id::text OR public.pos_is_admin()) WITH CHECK (auth.uid()::text = user_id::text OR public.pos_is_admin());
CREATE POLICY "POS sales delete own" ON public.sales FOR DELETE USING (auth.uid()::text = user_id::text OR public.pos_is_admin());

DROP POLICY IF EXISTS "POS cash select own" ON public.cash_entries;
DROP POLICY IF EXISTS "POS cash insert own" ON public.cash_entries;
DROP POLICY IF EXISTS "POS cash update own" ON public.cash_entries;
DROP POLICY IF EXISTS "POS cash delete own" ON public.cash_entries;
CREATE POLICY "POS cash select own" ON public.cash_entries FOR SELECT USING (auth.uid()::text = user_id::text OR public.pos_is_admin());
CREATE POLICY "POS cash insert own" ON public.cash_entries FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "POS cash update own" ON public.cash_entries FOR UPDATE USING (auth.uid()::text = user_id::text OR public.pos_is_admin()) WITH CHECK (auth.uid()::text = user_id::text OR public.pos_is_admin());
CREATE POLICY "POS cash delete own" ON public.cash_entries FOR DELETE USING (auth.uid()::text = user_id::text OR public.pos_is_admin());

DROP POLICY IF EXISTS "POS receivables select own" ON public.receivables;
DROP POLICY IF EXISTS "POS receivables insert own" ON public.receivables;
DROP POLICY IF EXISTS "POS receivables update own" ON public.receivables;
DROP POLICY IF EXISTS "POS receivables delete own" ON public.receivables;
CREATE POLICY "POS receivables select own" ON public.receivables FOR SELECT USING (auth.uid()::text = user_id::text OR public.pos_is_admin());
CREATE POLICY "POS receivables insert own" ON public.receivables FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "POS receivables update own" ON public.receivables FOR UPDATE USING (auth.uid()::text = user_id::text OR public.pos_is_admin()) WITH CHECK (auth.uid()::text = user_id::text OR public.pos_is_admin());
CREATE POLICY "POS receivables delete own" ON public.receivables FOR DELETE USING (auth.uid()::text = user_id::text OR public.pos_is_admin());

DROP POLICY IF EXISTS "POS payments select own" ON public.receivable_payments;
DROP POLICY IF EXISTS "POS payments insert own" ON public.receivable_payments;
DROP POLICY IF EXISTS "POS payments update own" ON public.receivable_payments;
DROP POLICY IF EXISTS "POS payments delete own" ON public.receivable_payments;
CREATE POLICY "POS payments select own" ON public.receivable_payments FOR SELECT USING (auth.uid()::text = user_id::text OR public.pos_is_admin());
CREATE POLICY "POS payments insert own" ON public.receivable_payments FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "POS payments update own" ON public.receivable_payments FOR UPDATE USING (auth.uid()::text = user_id::text OR public.pos_is_admin()) WITH CHECK (auth.uid()::text = user_id::text OR public.pos_is_admin());
CREATE POLICY "POS payments delete own" ON public.receivable_payments FOR DELETE USING (auth.uid()::text = user_id::text OR public.pos_is_admin());

DROP POLICY IF EXISTS "POS change select own" ON public.change_returns;
DROP POLICY IF EXISTS "POS change insert own" ON public.change_returns;
DROP POLICY IF EXISTS "POS change update own" ON public.change_returns;
DROP POLICY IF EXISTS "POS change delete own" ON public.change_returns;
CREATE POLICY "POS change select own" ON public.change_returns FOR SELECT USING (auth.uid()::text = user_id::text OR public.pos_is_admin());
CREATE POLICY "POS change insert own" ON public.change_returns FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY "POS change update own" ON public.change_returns FOR UPDATE USING (auth.uid()::text = user_id::text OR public.pos_is_admin()) WITH CHECK (auth.uid()::text = user_id::text OR public.pos_is_admin());
CREATE POLICY "POS change delete own" ON public.change_returns FOR DELETE USING (auth.uid()::text = user_id::text OR public.pos_is_admin());

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ------------------------------------------------------------
-- 7. Read-only verification output.
-- ------------------------------------------------------------
SELECT 'products' AS table_name, COUNT(*) AS total FROM public.products
UNION ALL SELECT 'sales', COUNT(*) FROM public.sales
UNION ALL SELECT 'cash_entries', COUNT(*) FROM public.cash_entries
UNION ALL SELECT 'receivables', COUNT(*) FROM public.receivables
UNION ALL SELECT 'receivable_payments', COUNT(*) FROM public.receivable_payments
UNION ALL SELECT 'change_returns', COUNT(*) FROM public.change_returns
ORDER BY table_name;

SELECT 'products' AS table_name, user_id, COUNT(*) AS total FROM public.products GROUP BY user_id
UNION ALL SELECT 'sales', user_id, COUNT(*) FROM public.sales GROUP BY user_id
UNION ALL SELECT 'cash_entries', user_id, COUNT(*) FROM public.cash_entries GROUP BY user_id
UNION ALL SELECT 'receivables', user_id, COUNT(*) FROM public.receivables GROUP BY user_id
UNION ALL SELECT 'receivable_payments', user_id, COUNT(*) FROM public.receivable_payments GROUP BY user_id
UNION ALL SELECT 'change_returns', user_id::text, COUNT(*) FROM public.change_returns GROUP BY user_id
ORDER BY table_name, user_id;
