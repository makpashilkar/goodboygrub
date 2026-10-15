import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * SERVER ONLY. The service-role key bypasses RLS and must never be imported
 * from client components or prefixed with NEXT_PUBLIC_.
 */
let cached: SupabaseClient | null = null;

export class ConfigError extends Error {}

export function getServiceClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ConfigError(
      'Server is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (server-only .env variable).'
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Returns a 401 response if the admin passcode header is missing/wrong, else null. */
export function requireAdmin(req: NextRequest): NextResponse | null {
  // Set ADMIN_PASSCODE in the server .env. In development only, the previous default is used.
  const expected = process.env.ADMIN_PASSCODE || (process.env.NODE_ENV !== 'production' ? 'admin1234' : '');
  const given = req.headers.get('x-admin-passcode') ?? '';
  if (!expected || !given || !safeEqual(given, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/** Logs diagnostics in development only; never logs customer PII or secrets. */
export function devLog(scope: string, detail: unknown) {
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[${scope}]`, detail);
  }
}

export function errorResponse(scope: string, err: unknown, fallback = 'Server error') {
  if (err instanceof ConfigError) {
    devLog(scope, err.message);
    return NextResponse.json({ error: 'Server is not configured for database access.' }, { status: 500 });
  }
  const e = err as { code?: string; message?: string; details?: string; hint?: string };
  devLog(scope, { code: e?.code, message: e?.message, details: e?.details, hint: e?.hint });
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/**
 * Tells connected KDS/storefront clients that data changed. The payload carries
 * no customer data; clients re-fetch through the authenticated API.
 */
export async function broadcastChange(kind: 'orders' | 'settings', orderId?: string) {
  try {
    const client = getServiceClient();
    const channel = client.channel('gbg-changes');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 3000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    await channel.send({ type: 'broadcast', event: 'changed', payload: { kind, orderId, at: Date.now() } });
    await client.removeChannel(channel);
  } catch (err) {
    devLog('broadcastChange', err instanceof Error ? err.message : err);
  }
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface OrderEmail {
  orderNumber: string | null;
  customerName: string;
  phone: string;
  address: string;
  pincode: string;
  totalAmount: number;
  items: Array<{ name: string; quantity: number; price: number; addCheese: boolean }>;
}

/** Same Resend email as the existing /api/notify-order route, sent after the order is saved. */
export async function sendOrderEmail(o: OrderEmail): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    devLog('notify-order', 'RESEND_API_KEY not set; skipping email');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Good Boy Grub <onboarding@resend.dev>',
      to: ['goodboygrub@gmail.com'],
      subject: `New Order ${esc(o.orderNumber)} — ${esc(o.customerName)}`,
      html: `
        <h2>New Order: ${esc(o.orderNumber)}</h2>
        <p><strong>Customer:</strong> ${esc(o.customerName)}</p>
        <p><strong>Phone:</strong> ${esc(o.phone)}</p>
        <p><strong>Address:</strong> ${esc(o.address)}, ${esc(o.pincode)}</p>
        <h3>Items:</h3>
        <ul>
          ${o.items
            .map(
              (i) =>
                `<li>${i.quantity}x ${esc(i.name)} ${i.addCheese ? '(+ Extra Cheese)' : ''} — ₹${i.price * i.quantity}</li>`
            )
            .join('')}
        </ul>
        <p><strong>Total:</strong> ₹${o.totalAmount}</p>
      `,
    }),
  });
  if (!res.ok) {
    devLog('notify-order', `Resend responded ${res.status}`);
  }
}
