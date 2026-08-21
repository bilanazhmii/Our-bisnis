-- SUPABASE AUTH SIGNUP REPAIR
-- Run this file in Supabase SQL Editor after setup_supabase.sql.
-- It repairs the auth.users trigger and backfills missing user_roles rows.

CREATE TABLE IF NOT EXISTS public.user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

UPDATE public.user_roles
SET role = 'user'
WHERE role IS NULL OR role NOT IN ('user', 'admin', 'super_admin');

UPDATE public.user_roles
SET email = ''
WHERE email IS NULL;

ALTER TABLE public.user_roles ALTER COLUMN email SET DEFAULT '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Role creation is optional for Auth itself. If an old installation has a
  -- partially migrated role table, do not abort the Auth transaction.
  IF to_regclass('public.user_roles') IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = NEW.id::text
  ) THEN
    INSERT INTO public.user_roles (id, user_id, role, email)
    VALUES (
      NEW.id::text,
      NEW.id::text,
      'user',
      COALESCE(NEW.email, '')
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never turn a successful Auth signup into HTTP 500 because an optional
  -- application role row is unavailable. The warning remains visible in
  -- Postgres Logs for diagnosis and the client falls back to role=user.
  RAISE WARNING 'handle_new_user role sync failed for %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill role rows for users created while the old trigger was broken.
INSERT INTO public.user_roles (id, user_id, role, email)
SELECT u.id::text, u.id::text, 'user', COALESCE(u.email, '')
FROM auth.users AS u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_roles AS r
  WHERE r.user_id = u.id::text
);

NOTIFY pgrst, 'reload schema';
