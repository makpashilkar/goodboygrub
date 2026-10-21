-- ============================================================
-- Admin (Kitchen) users — replaces the single ADMIN_PASSCODE env var.
-- Passwords are hashed with bcrypt (pgcrypto). Run in the Supabase SQL Editor.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Locked down: RLS on with NO policies => anon/authenticated can never read it.
-- Only the server (service-role key) can reach it.
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_users FROM anon, authenticated;

-- Credential check performed inside the database; the hash never leaves it.
CREATE OR REPLACE FUNCTION public.verify_admin_login(p_username TEXT, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE username = p_username
          AND password_hash = crypt(p_password, password_hash)
    );
$$;

REVOKE ALL ON FUNCTION public.verify_admin_login(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_login(TEXT, TEXT) TO service_role;

-- Seed a first admin. CHANGE THE USERNAME/PASSWORD before running.
INSERT INTO public.admin_users (username, password_hash)
VALUES ('admin', crypt('sungodnika@11', gen_salt('bf')))
ON CONFLICT (username) DO NOTHING;
