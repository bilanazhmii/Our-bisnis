-- READ-ONLY RECOVERY CHECK FOR TODAY'S DATA
-- This file does not update or delete anything.

-- 1) Recent sales across every user_id, not filtered by RLS when run in SQL Editor.
SELECT id, bill_no, date, product, qty, total, customer, user_id, created_at, updated_at
FROM public.sales
WHERE date >= to_char(current_date - INTERVAL '7 days', 'YYYY-MM-DD')
ORDER BY date DESC, created_at DESC NULLS LAST;

-- 2) Counts by date and owner. This shows whether today's entries exist under
-- another account or were never uploaded to Supabase.
SELECT date, user_id, COUNT(*) AS total_sales, SUM(total) AS omzet
FROM public.sales
GROUP BY date, user_id
ORDER BY date DESC, user_id;

-- 3) Today's rows specifically, using the Supabase server date.
SELECT id, bill_no, date, product, qty, total, customer, user_id, created_at
FROM public.sales
WHERE date = to_char(current_date, 'YYYY-MM-DD')
ORDER BY created_at DESC NULLS LAST;

-- 4) If your local timezone date differs from Supabase server date, replace
-- the date below manually with the date shown by your POS date input.
-- SELECT id, bill_no, date, product, qty, total, customer, user_id, created_at
-- FROM public.sales
-- WHERE date = 'YYYY-MM-DD'
-- ORDER BY created_at DESC NULLS LAST;

-- 5) Recent cloud count by table.
SELECT 'sales_last_7_days' AS check_name, COUNT(*) AS total
FROM public.sales
WHERE date >= to_char(current_date - INTERVAL '7 days', 'YYYY-MM-DD')
UNION ALL
SELECT 'cash_last_7_days', COUNT(*)
FROM public.cash_entries
WHERE date >= to_char(current_date - INTERVAL '7 days', 'YYYY-MM-DD')
UNION ALL
SELECT 'receivables_last_7_days', COUNT(*)
FROM public.receivables
WHERE date >= to_char(current_date - INTERVAL '7 days', 'YYYY-MM-DD');
