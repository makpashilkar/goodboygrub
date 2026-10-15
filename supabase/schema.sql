-- ============================================================
-- Good Boy Grub — Complete Database Schema
-- Copy-paste this entire script into the Supabase SQL Editor
-- and run it. Safe to re-run (uses IF NOT EXISTS / ON CONFLICT).
-- ============================================================

-- 1. Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    pincode TEXT NOT NULL,
    address_type TEXT DEFAULT 'Home',
    special_instructions TEXT,
    items JSONB NOT NULL,
    subtotal NUMERIC(10, 2) NOT NULL,
    delivery_fee NUMERIC(10, 2) DEFAULT 0.00,
    total_amount NUMERIC(10, 2) NOT NULL,
    distance_km NUMERIC(5, 2) DEFAULT 0.00,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'preparing', 'dispatched', 'delivered', 'cancelled')),
    payment_method TEXT DEFAULT 'gpay_whatsapp',
    is_whatsapp_verified BOOLEAN NOT NULL DEFAULT false
);

-- 2. Store Settings Table
CREATE TABLE IF NOT EXISTS public.store_settings (
    id TEXT PRIMARY KEY DEFAULT 'primary',
    is_store_open BOOLEAN NOT NULL DEFAULT true,
    daily_slot_limit INT NOT NULL DEFAULT 10,
    slot_adjustment INT NOT NULL DEFAULT 0,
    sold_out_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Seed default settings row
INSERT INTO public.store_settings (id, is_store_open, daily_slot_limit, slot_adjustment, sold_out_items)
VALUES ('primary', true, 10, 0, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 4. Add columns if they were missing from an earlier schema version
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_whatsapp_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS slot_adjustment INT NOT NULL DEFAULT 0;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS sold_out_items JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 5. Enable Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies — Orders (public CRUD for guest checkout, no auth required)
DO $$ BEGIN
  DROP POLICY IF EXISTS "select_orders" ON public.orders;
  EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  DROP POLICY IF EXISTS "insert_orders" ON public.orders;
  EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  DROP POLICY IF EXISTS "update_orders" ON public.orders;
  EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  DROP POLICY IF EXISTS "delete_orders" ON public.orders;
  EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "select_orders" ON public.orders FOR SELECT
    TO anon, authenticated USING (true);
CREATE POLICY "insert_orders" ON public.orders FOR INSERT
    TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_orders" ON public.orders FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_orders" ON public.orders FOR DELETE
    TO anon, authenticated USING (true);

-- 7. RLS Policies — Store Settings (public read + update for admin toggle)
DO $$ BEGIN
  DROP POLICY IF EXISTS "select_store_settings" ON public.store_settings;
  EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  DROP POLICY IF EXISTS "update_store_settings" ON public.store_settings;
  EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  DROP POLICY IF EXISTS "insert_store_settings" ON public.store_settings;
  EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "select_store_settings" ON public.store_settings FOR SELECT
    TO anon, authenticated USING (true);
CREATE POLICY "update_store_settings" ON public.store_settings FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "insert_store_settings" ON public.store_settings FOR INSERT
    TO anon, authenticated WITH CHECK (true);

-- 8. Enable Realtime Publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_settings;

-- 9. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
