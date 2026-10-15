/*
# Add slot_adjustment column to store_settings

## Purpose
The admin needs the ability to manually increase or decrease available daily slots
when a customer doesn't confirm on WhatsApp or when slots need to be freed up manually.
This column stores an integer offset that adjusts the effective daily slot limit.

## Changes
- Added `slot_adjustment` column to `store_settings` (INT, NOT NULL, DEFAULT 0)
  - Positive values increase available slots (e.g., +1 frees up one slot)
  - Negative values decrease available slots (e.g., -1 removes one slot)
  - The effective slot limit = daily_slot_limit + slot_adjustment

## Security
- No RLS policy changes needed — existing policies already allow public read/update.
*/

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS slot_adjustment INT NOT NULL DEFAULT 0;
