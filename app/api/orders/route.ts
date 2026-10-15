import { NextRequest, NextResponse } from 'next/server';
import { MENU_ITEMS, CHEESE_ADDON_PRICE } from '@/lib/menu';
import { getDeliveryInfo } from '@/lib/delivery';
import { broadcastChange, errorResponse, getServiceClient, sendOrderEmail } from '@/lib/server/admin-client';
import { countTodayOrders, isKitchenClosedByTimeIST, loadSettings, remainingSlots } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

const PHONE_RE = /^[6-9]\d{9}$/;
const ADDRESS_TYPES = ['Home', 'Work', 'Other'];
const UUID_RE = /^[0-9a-f-]{16,64}$/i;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * Creates an order. All prices, delivery fee and totals are recomputed here from
 * server-side menu/delivery data; client-submitted prices are ignored.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad('Invalid request');
  }

  const customerName = str(body.customerName, 100);
  const phone = str(body.phone, 10);
  const address = str(body.address, 300);
  const pincode = str(body.pincode, 6);
  const addressType = ADDRESS_TYPES.includes(body.addressType as string) ? (body.addressType as string) : 'Home';
  const special = str(body.specialInstructions, 500);
  const idempotencyKey = str(body.idempotencyKey, 64);

  if (!customerName) return bad('Name is required');
  if (!PHONE_RE.test(phone)) return bad('Enter a valid 10-digit mobile number');
  if (!address) return bad('Address is required');
  if (!/^\d{6}$/.test(pincode)) return bad('Enter a valid 6-digit pincode');
  if (!UUID_RE.test(idempotencyKey)) return bad('Invalid request');

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length < 1 || rawItems.length > 20) return bad('Your cart is empty');

  const items: Array<{ id: string; name: string; price: number; quantity: number; addCheese: boolean }> = [];
  for (const raw of rawItems as Array<Record<string, unknown>>) {
    const menu = MENU_ITEMS.find((m) => m.id === raw?.id);
    const qty = Number(raw?.quantity);
    if (!menu || !Number.isInteger(qty) || qty < 1 || qty > 20) return bad('Your cart contains an invalid item');
    items.push({ id: menu.id, name: menu.name, price: menu.price, quantity: qty, addCheese: raw?.addCheese === true });
  }

  const subtotal = items.reduce(
    (s, i) => s + (i.price + (i.addCheese ? CHEESE_ADDON_PRICE : 0)) * i.quantity,
    0
  );
  const { distanceKm, deliveryFee } = getDeliveryInfo(pincode);
  const totalAmount = subtotal + deliveryFee;

  try {
    const db = getServiceClient();

    // Idempotent retry: return the order already saved for this key.
    const existing = await db.from('orders').select('*').eq('idempotency_key', idempotencyKey).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return NextResponse.json({ order: stripKey(existing.data), duplicate: true });

    const settings = await loadSettings();
    if (!settings.is_store_open || isKitchenClosedByTimeIST()) return bad('The kitchen is currently closed.', 409);
    if (items.some((i) => settings.sold_out_items.includes(i.id))) {
      return bad('An item in your cart is sold out.', 409);
    }
    if (remainingSlots(settings, await countTodayOrders()) <= 0) {
      return bad('Sorry, all of today\'s slots are taken.', 409);
    }

    for (let attempt = 0; attempt < 6; attempt++) {
      const latest = await db
        .from('orders')
        .select('order_number')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest.error) throw latest.error;
      const match = latest.data?.order_number?.match(/GBG-(\d+)/);
      const seq = (match ? parseInt(match[1], 10) : 0) + 1 + attempt;
      const orderNumber = `GBG-${String(seq).padStart(4, '0')}`;

      const { data, error } = await db
        .from('orders')
        .insert({
          order_number: orderNumber,
          customer_name: customerName,
          phone,
          address,
          pincode,
          address_type: addressType,
          special_instructions: special || null,
          items,
          subtotal,
          delivery_fee: deliveryFee,
          total_amount: totalAmount,
          distance_km: distanceKm,
          status: 'new',
          payment_method: 'gpay_whatsapp',
          is_whatsapp_verified: false,
          idempotency_key: idempotencyKey,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          // Duplicate idempotency key (concurrent double submit) or order_number race.
          const again = await db.from('orders').select('*').eq('idempotency_key', idempotencyKey).maybeSingle();
          if (again.data) return NextResponse.json({ order: stripKey(again.data), duplicate: true });
          continue;
        }
        throw error;
      }

      // Order is saved: notify kitchen displays and send the email (failures here do not undo the order).
      await Promise.allSettled([
        broadcastChange('orders', data.id),
        sendOrderEmail({
          orderNumber: data.order_number,
          customerName,
          phone,
          address,
          pincode,
          totalAmount,
          items,
        }),
      ]);
      return NextResponse.json({ order: stripKey(data) }, { status: 201 });
    }
    return bad('Could not allocate an order number. Please try again.', 503);
  } catch (err) {
    return errorResponse('create-order', err, 'We could not save your order. Please try again.');
  }
}

function stripKey<T extends Record<string, unknown>>(row: T) {
  const { idempotency_key: _k, ...rest } = row;
  return rest;
}
