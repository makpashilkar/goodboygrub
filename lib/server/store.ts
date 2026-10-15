import type { StoreSettings } from '@/lib/types';
import { DAILY_SLOT_LIMIT } from '@/lib/menu';
import { getServiceClient } from './admin-client';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Start of the current day in IST, as a UTC ISO string. */
export function startOfTodayIST(): string {
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  istNow.setUTCHours(0, 0, 0, 0);
  return new Date(istNow.getTime() - IST_OFFSET_MS).toISOString();
}

export function isKitchenClosedByTimeIST(): boolean {
  // Testing aid: ALLOW_AFTER_HOURS_ORDERS=true skips the hours check, never in production.
  if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_AFTER_HOURS_ORDERS === 'true') {
    return false;
  }
  const hour = new Date(Date.now() + IST_OFFSET_MS).getUTCHours();
  return hour < 11 || hour >= 23;
}

export async function loadSettings(): Promise<StoreSettings> {
  const { data, error } = await getServiceClient()
    .from('store_settings')
    .select('*')
    .eq('id', 'primary')
    .maybeSingle();
  if (error) throw error;
  const s = (data ?? {
    id: 'primary',
    is_store_open: true,
    daily_slot_limit: DAILY_SLOT_LIMIT,
    slot_adjustment: 0,
    sold_out_items: [],
    updated_at: new Date().toISOString(),
  }) as StoreSettings;
  return { ...s, slot_adjustment: s.slot_adjustment ?? 0, sold_out_items: s.sold_out_items ?? [] };
}

export async function countTodayOrders(): Promise<number> {
  const { count, error } = await getServiceClient()
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfTodayIST())
    .neq('status', 'cancelled');
  if (error) throw error;
  return count ?? 0;
}

export function remainingSlots(settings: StoreSettings, todayCount: number): number {
  return Math.max(0, settings.daily_slot_limit + settings.slot_adjustment - todayCount);
}
