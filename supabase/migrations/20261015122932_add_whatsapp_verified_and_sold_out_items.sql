/*
# Add is_whatsapp_verified and sold_out_items to schema

## Changes
- Added `is_whatsapp_verified` column to `orders` (BOOLEAN, NOT NULL, DEFAULT false)
  - Set to false when order is placed; kitchen toggles to true after WhatsApp confirmation
- Added `sold_out_items` column to `store_settings` (JSONB, NOT NULL, DEFAULT '[]'::jsonb)
  - Array of menu item IDs that are marked as sold out from the KDS

## Security
- No RLS policy changes needed — existing policies already allow public read/update.
*/

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_whatsapp_verified BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS sold_out_items JSONB NOT NULL DEFAULT '[]'::jsonb;
