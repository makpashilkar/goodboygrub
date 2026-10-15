/*
  # Lock down orders; add idempotency key

  The app now reads/writes orders only through server API routes using the
  service-role key (which bypasses RLS). The anon/publishable key therefore
  needs NO table access. Previously every visitor could read, update and
  delete all orders (including customer names, phones and addresses).

  ## Changes
  - orders.idempotency_key (unique) prevents duplicate orders on retries/double clicks.
  - Drops all permissive anon/authenticated policies on orders and store_settings.
    RLS stays ENABLED; with no policies, anon/authenticated are denied.
  - Adds CHECK constraints for sane amounts.
*/

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_key ON public.orders (idempotency_key);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_orders" ON public.orders;
DROP POLICY IF EXISTS "insert_orders" ON public.orders;
DROP POLICY IF EXISTS "update_orders" ON public.orders;
DROP POLICY IF EXISTS "delete_orders" ON public.orders;
DROP POLICY IF EXISTS "anon_select_orders" ON public.orders;
DROP POLICY IF EXISTS "anon_insert_orders" ON public.orders;
DROP POLICY IF EXISTS "anon_update_orders" ON public.orders;
DROP POLICY IF EXISTS "anon_delete_orders" ON public.orders;

DROP POLICY IF EXISTS "select_store_settings" ON public.store_settings;
DROP POLICY IF EXISTS "update_store_settings" ON public.store_settings;
DROP POLICY IF EXISTS "insert_store_settings" ON public.store_settings;
DROP POLICY IF EXISTS "anon_select_store_settings" ON public.store_settings;
DROP POLICY IF EXISTS "anon_update_store_settings" ON public.store_settings;

DO $$ BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_amounts_nonnegative
    CHECK (subtotal >= 0 AND delivery_fee >= 0 AND total_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
