import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CartItem, OrderRow, StoreSettings } from './types';
import { DAILY_SLOT_LIMIT } from './menu';

/* ============================================================
   SUPABASE CLIENT (browser)
   Only the public/publishable key is used here and only for the
   Realtime "something changed" signal. All order data goes through
   server API routes (service-role key stays server-side).
   ============================================================ */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// The project's .env uses NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; the legacy ANON name is still accepted.
const supabasePublicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublicKey);

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl!, supabasePublicKey!);
  }
  return supabaseInstance;
}

const LS_LAST_ORDER_KEY = 'gbg_last_order_time';
const LS_CUSTOMER_KEY = 'gbg_customer_details';
const SS_ADMIN_PASS_KEY = 'gbg_admin_passcode';

/* ============================================================
   API HELPERS
   ============================================================ */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getAdminPasscode(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(SS_ADMIN_PASS_KEY) ?? '';
}

async function api<T>(path: string, init: RequestInit = {}, admin = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (admin) headers['x-admin-passcode'] = getAdminPasscode();
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) }, cache: 'no-store' });
  } catch {
    throw new ApiError('Network error. Check your connection and try again.', 0);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    if (process.env.NODE_ENV !== 'production') {
      console.error('[api]', init.method ?? 'GET', path, res.status, msg);
    }
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

/* ============================================================
   ADMIN AUTH (passcode verified by the server)
   ============================================================ */

/** Returns true if the server accepts the passcode, false if it is wrong. Throws on other failures. */
export async function adminLogin(passcode: string): Promise<boolean> {
  sessionStorage.setItem(SS_ADMIN_PASS_KEY, passcode);
  try {
    await api('/api/admin/orders', {}, true);
    return true;
  } catch (err) {
    sessionStorage.removeItem(SS_ADMIN_PASS_KEY);
    if (err instanceof ApiError && err.status === 401) return false;
    throw err;
  }
}

/* ============================================================
   DATA ACCESS (all backed by Supabase through the server)
   ============================================================ */

export interface PublicStatus {
  settings: StoreSettings;
  remainingSlots: number;
  kitchenClosedByTime: boolean;
}

export async function fetchPublicStatus(): Promise<PublicStatus> {
  return api<PublicStatus>('/api/store-status');
}

export async function fetchStoreSettings(): Promise<StoreSettings> {
  return (await fetchPublicStatus()).settings;
}

export async function updateStoreOpen(isOpen: boolean): Promise<void> {
  await api('/api/admin/settings', { method: 'POST', body: JSON.stringify({ action: 'set-open', isOpen }) }, true);
}

/** Throws on failure so the KDS can show an error instead of silently showing no orders. */
export async function fetchOrders(): Promise<OrderRow[]> {
  const { orders } = await api<{ orders: OrderRow[] }>('/api/admin/orders', {}, true);
  return orders;
}

export interface NewOrderInput {
  customerName: string;
  phone: string;
  address: string;
  pincode: string;
  addressType: 'Home' | 'Work' | 'Other';
  specialInstructions: string;
  items: CartItem[];
  /** Stable per checkout attempt; makes retries/double-clicks create a single order. */
  idempotencyKey: string;
}

/** Saves the order in Supabase (prices are recomputed server-side). Throws ApiError on failure. */
export async function createOrder(input: NewOrderInput): Promise<OrderRow> {
  const { order } = await api<{ order: OrderRow }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      // Only ids/quantities/options are trusted by the server; prices are ignored.
      items: input.items.map((i) => ({ id: i.id, quantity: i.quantity, addCheese: i.addCheese })),
    }),
  });
  return order;
}

export async function updateOrderStatus(orderId: string, status: OrderRow['status']): Promise<void> {
  await api(`/api/admin/orders/${orderId}`, { method: 'PATCH', body: JSON.stringify({ status }) }, true);
}

export async function cancelOrder(orderId: string): Promise<void> {
  await updateOrderStatus(orderId, 'cancelled');
}

export async function deleteOrder(orderId: string): Promise<void> {
  await api(`/api/admin/orders/${orderId}`, { method: 'DELETE' }, true);
}

export async function updateSlotAdjustment(delta: number): Promise<void> {
  await api('/api/admin/settings', { method: 'POST', body: JSON.stringify({ action: 'adjust-slots', delta }) }, true);
}

export async function resetDailyCount(): Promise<void> {
  await api('/api/admin/settings', { method: 'POST', body: JSON.stringify({ action: 'reset-daily' }) }, true);
}

export async function setOrderWhatsAppVerified(orderId: string, verified: boolean): Promise<void> {
  await api(
    `/api/admin/orders/${orderId}`,
    { method: 'PATCH', body: JSON.stringify({ is_whatsapp_verified: verified }) },
    true
  );
}

export async function toggleSoldOutItem(itemId: string): Promise<void> {
  await api('/api/admin/settings', { method: 'POST', body: JSON.stringify({ action: 'toggle-sold-out', itemId }) }, true);
}

export function defaultSettings(): StoreSettings {
  return {
    id: 'primary',
    is_store_open: true,
    daily_slot_limit: DAILY_SLOT_LIMIT,
    slot_adjustment: 0,
    sold_out_items: [],
    updated_at: new Date().toISOString(),
  };
}

/* ============================================================
   ANTI-SPAM: RATE LIMITING & CUSTOMER AUTO-FILL
   ============================================================ */

export function getOrderCooldownMs(): number {
  return 5 * 60 * 1000;
}

export function canPlaceOrder(): { allowed: boolean; remainingMs: number } {
  if (typeof window === 'undefined') return { allowed: true, remainingMs: 0 };
  try {
    const last = parseInt(localStorage.getItem(LS_LAST_ORDER_KEY) || '0', 10);
    if (!last) return { allowed: true, remainingMs: 0 };
    const elapsed = Date.now() - last;
    const cooldown = getOrderCooldownMs();
    if (elapsed < cooldown) {
      return { allowed: false, remainingMs: cooldown - elapsed };
    }
    return { allowed: true, remainingMs: 0 };
  } catch {
    return { allowed: true, remainingMs: 0 };
  }
}

export function recordOrderPlaced(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_LAST_ORDER_KEY, String(Date.now()));
  } catch {
    /* noop */
  }
}

export interface SavedCustomerDetails {
  customerName: string;
  phone: string;
  address: string;
  pincode: string;
  addressType: 'Home' | 'Work' | 'Other';
}

export function saveCustomerDetails(details: SavedCustomerDetails): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_CUSTOMER_KEY, JSON.stringify(details));
  } catch {
    /* noop */
  }
}

export function getSavedCustomerDetails(): SavedCustomerDetails | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_CUSTOMER_KEY);
    if (raw) return JSON.parse(raw);
    return null;
  } catch {
    return null;
  }
}

/* ============================================================
   REALTIME SUBSCRIPTION HELPER
   Server routes broadcast a payload-free "changed" signal on channel
   `gbg-changes` after every successful write. Listeners re-fetch via the API,
   so duplicate/out-of-order events are harmless. A slow poll and
   resync-on-reconnect/visibility cover missed events.
   ============================================================ */

export type RealtimeState = 'connecting' | 'live' | 'offline';

export function subscribeToOrders(
  callback: () => void,
  onState?: (state: RealtimeState) => void
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(callback, 150); // coalesce bursts of duplicate events
  };

  const client = getSupabaseClient();
  let channel: ReturnType<SupabaseClient['channel']> | null = null;
  if (client) {
    onState?.('connecting');
    channel = client
      .channel('gbg-changes')
      .on('broadcast', { event: 'changed' }, fire)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          onState?.('live');
          fire(); // resync anything missed while disconnected
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          onState?.('offline');
        }
      });
  } else {
    onState?.('offline');
  }

  const poll = setInterval(callback, 15000);
  const onVisible = () => {
    if (document.visibilityState === 'visible') fire();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', fire);

  return () => {
    if (timer) clearTimeout(timer);
    clearInterval(poll);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', fire);
    if (client && channel) client.removeChannel(channel);
  };
}

/* ============================================================
   STORE STATUS LOGIC
   ============================================================ */

export function isKitchenClosedByTime(): boolean {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
  const hour = istTime.getHours();
  return hour < 11 || hour >= 23;
}

export function getRemainingSlots(
  orders: OrderRow[],
  slotLimit: number,
  slotAdjustment: number = 0
): number {
  const today = new Date().toDateString();
  const todayOrders = orders.filter(
    (o) => new Date(o.created_at).toDateString() === today && o.status !== 'cancelled'
  );
  const effectiveLimit = slotLimit + slotAdjustment;
  return Math.max(0, effectiveLimit - todayOrders.length);
}
