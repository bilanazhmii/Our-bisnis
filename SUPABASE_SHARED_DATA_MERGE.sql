-- ============================================================
-- EL MATCHA × EL KOPI — SHARED DATA MERGE
-- ============================================================
-- Canonical account: 64c65e90-35eb-4bff-b3ad-76aad739d737
--
-- This script does NOT delete business rows. It changes ownership to one
-- canonical Auth user and changes POS RLS to a shared authenticated workspace.
-- After this runs, every authenticated account in this Supabase project can
-- read and modify the same POS dataset.
--
-- Run SUPABASE_CLEAN_REPAIR.sql first if the schema is incomplete, then run
-- this file once. It is idempotent for ownership and policies.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = '64c65e90-35eb-4bff-b3ad-76aad739d737'::uuid
  ) THEN
    RAISE EXCEPTION 'Canonical Auth user 64c65e90-35eb-4bff-b3ad-76aad739d737 was not found. Stop without changing data.';
  END IF;
END $$;

-- Before counts: record these results before continuing if desired.
SELECT 'BEFORE products' AS checkpoint, COUNT(*) AS total FROM public.products
UNION ALL SELECT 'BEFORE sales', COUNT(*) FROM public.sales
UNION ALL SELECT 'BEFORE cash_entries', COUNT(*) FROM public.cash_entries
UNION ALL SELECT 'BEFORE receivables', COUNT(*) FROM public.receivables
UNION ALL SELECT 'BEFORE receivable_payments', COUNT(*) FROM public.receivable_payments
UNION ALL SELECT 'BEFORE change_returns', COUNT(*) FROM public.change_returns;

-- Consolidate ownership. These are UPDATE statements only; no rows are removed.
UPDATE public.products
SET user_id = '64c65e90-35eb-4bff-b3ad-76aad739d737'
WHERE user_id IS DISTINCT FROM '64c65e90-35eb-4bff-b3ad-76aad739d737';

UPDATE public.sales
SET user_id = '64c65e90-35eb-4bff-b3ad-76aad739d737'
WHERE user_id IS DISTINCT FROM '64c65e90-35eb-4bff-b3ad-76aad739d737';

UPDATE public.cash_entries
SET user_id = '64c65e90-35eb-4bff-b3ad-76aad739d737'
WHERE user_id IS DISTINCT FROM '64c65e90-35eb-4bff-b3ad-76aad739d737';

UPDATE public.receivables
SET user_id = '64c65e90-35eb-4bff-b3ad-76aad739d737'
WHERE user_id IS DISTINCT FROM '64c65e90-35eb-4bff-b3ad-76aad739d737';

UPDATE public.receivable_payments
SET user_id = '64c65e90-35eb-4bff-b3ad-76aad739d737'
WHERE user_id IS DISTINCT FROM '64c65e90-35eb-4bff-b3ad-76aad739d737';

UPDATE public.change_returns
SET user_id = '64c65e90-35eb-4bff-b3ad-76aad739d737'::uuid
WHERE user_id IS DISTINCT FROM '64c65e90-35eb-4bff-b3ad-76aad739d737'::uuid;

-- Remove existing business-table policies so old per-user policies cannot
-- conflict with the shared workspace policies below.
DO $$
DECLARE
  policy_row RECORD;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('products','sales','cash_entries','receivables','receivable_payments','change_returns')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END $$;

-- Shared workspace: every authenticated account can use the same POS data.
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivable_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "POS shared products select" ON public.products
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared products insert" ON public.products
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared products update" ON public.products
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared products delete" ON public.products
  FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY "POS shared sales select" ON public.sales
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared sales insert" ON public.sales
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared sales update" ON public.sales
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared sales delete" ON public.sales
  FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY "POS shared cash select" ON public.cash_entries
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared cash insert" ON public.cash_entries
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared cash update" ON public.cash_entries
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared cash delete" ON public.cash_entries
  FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY "POS shared receivables select" ON public.receivables
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared receivables insert" ON public.receivables
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared receivables update" ON public.receivables
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared receivables delete" ON public.receivables
  FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY "POS shared payments select" ON public.receivable_payments
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared payments insert" ON public.receivable_payments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared payments update" ON public.receivable_payments
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared payments delete" ON public.receivable_payments
  FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE POLICY "POS shared change select" ON public.change_returns
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared change insert" ON public.change_returns
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared change update" ON public.change_returns
  FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "POS shared change delete" ON public.change_returns
  FOR DELETE USING (auth.uid() IS NOT NULL);

NOTIFY pgrst, 'reload schema';
COMMIT;

-- After counts: totals must match the BEFORE totals.
SELECT 'AFTER products' AS checkpoint, COUNT(*) AS total FROM public.products
UNION ALL SELECT 'AFTER sales', COUNT(*) FROM public.sales
UNION ALL SELECT 'AFTER cash_entries', COUNT(*) FROM public.cash_entries
UNION ALL SELECT 'AFTER receivables', COUNT(*) FROM public.receivables
UNION ALL SELECT 'AFTER receivable_payments', COUNT(*) FROM public.receivable_payments
UNION ALL SELECT 'AFTER change_returns', COUNT(*) FROM public.change_returns;

SELECT 'MERGED products' AS table_name, user_id, COUNT(*) AS total FROM public.products GROUP BY user_id
UNION ALL SELECT 'MERGED sales', user_id, COUNT(*) FROM public.sales GROUP BY user_id
UNION ALL SELECT 'MERGED cash_entries', user_id, COUNT(*) FROM public.cash_entries GROUP BY user_id
UNION ALL SELECT 'MERGED receivables', user_id, COUNT(*) FROM public.receivables GROUP BY user_id
UNION ALL SELECT 'MERGED receivable_payments', user_id, COUNT(*) FROM public.receivable_payments GROUP BY user_id
UNION ALL SELECT 'MERGED change_returns', user_id::text, COUNT(*) FROM public.change_returns GROUP BY user_id
ORDER BY table_name, user_id;
