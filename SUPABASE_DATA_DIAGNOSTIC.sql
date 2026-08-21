-- NON-DESTRUCTIVE DATA VISIBILITY DIAGNOSTIC
-- Run this in Supabase SQL Editor. It only reads data and schema.

-- 1) Auth accounts. Compare these IDs with the ID shown in the app's
-- Pengaturan > Status Cloud card.
SELECT id::text AS auth_user_id, email, created_at, last_sign_in_at
FROM auth.users
ORDER BY created_at;

-- 2) Ownership distribution. The user_id values must match the active
-- auth_user_id shown by the web app for rows to pass RLS.
SELECT 'products' AS table_name, user_id, COUNT(*) AS total
FROM public.products GROUP BY user_id
UNION ALL
SELECT 'sales', user_id, COUNT(*) FROM public.sales GROUP BY user_id
UNION ALL
SELECT 'cash_entries', user_id, COUNT(*) FROM public.cash_entries GROUP BY user_id
UNION ALL
SELECT 'receivables', user_id, COUNT(*) FROM public.receivables GROUP BY user_id
UNION ALL
SELECT 'receivable_payments', user_id, COUNT(*) FROM public.receivable_payments GROUP BY user_id
UNION ALL
SELECT 'change_returns', user_id::text, COUNT(*) FROM public.change_returns GROUP BY user_id
ORDER BY table_name, user_id;

-- 3) Required application columns.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('products','sales','cash_entries','receivables','receivable_payments','change_returns')
ORDER BY table_name, ordinal_position;

-- 4) Count rows by the active Auth ID. Replace the placeholder with the ID
-- shown in the app. This is read-only and works even when SQL Editor runs
-- with an admin context.
-- SELECT 'products' AS table_name, COUNT(*) AS visible_for_active_user
-- FROM public.products WHERE user_id = 'PASTE_ACTIVE_AUTH_USER_ID_HERE'
-- UNION ALL
-- SELECT 'sales', COUNT(*) FROM public.sales WHERE user_id = 'PASTE_ACTIVE_AUTH_USER_ID_HERE'
-- UNION ALL
-- SELECT 'cash_entries', COUNT(*) FROM public.cash_entries WHERE user_id = 'PASTE_ACTIVE_AUTH_USER_ID_HERE'
-- UNION ALL
-- SELECT 'receivables', COUNT(*) FROM public.receivables WHERE user_id = 'PASTE_ACTIVE_AUTH_USER_ID_HERE'
-- UNION ALL
-- SELECT 'receivable_payments', COUNT(*) FROM public.receivable_payments WHERE user_id = 'PASTE_ACTIVE_AUTH_USER_ID_HERE'
-- UNION ALL
-- SELECT 'change_returns', COUNT(*) FROM public.change_returns WHERE user_id::text = 'PASTE_ACTIVE_AUTH_USER_ID_HERE';
