import { NextRequest, NextResponse } from 'next/server';
import { broadcastChange, errorResponse, getServiceClient, requireAdmin } from '@/lib/server/admin-client';
import { loadSettings, startOfTodayIST } from '@/lib/server/store';
import { MENU_ITEMS } from '@/lib/menu';

export const dynamic = 'force-dynamic';

/** Admin store controls: toggle open, adjust slots, toggle sold-out item, reset today's orders. */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  let body: { action?: string; isOpen?: boolean; delta?: number; itemId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const db = getServiceClient();
    const settings = await loadSettings();
    const base = { id: 'primary', updated_at: new Date().toISOString() };

    if (body.action === 'set-open') {
      const { error } = await db.from('store_settings').upsert({ ...settings, ...base, is_store_open: body.isOpen === true });
      if (error) throw error;
    } else if (body.action === 'adjust-slots') {
      const delta = Number(body.delta);
      if (!Number.isInteger(delta) || Math.abs(delta) > 100) {
        return NextResponse.json({ error: 'Invalid delta' }, { status: 400 });
      }
      const { error } = await db
        .from('store_settings')
        .upsert({ ...settings, ...base, slot_adjustment: settings.slot_adjustment + delta });
      if (error) throw error;
    } else if (body.action === 'toggle-sold-out') {
      if (!MENU_ITEMS.some((m) => m.id === body.itemId)) {
        return NextResponse.json({ error: 'Unknown item' }, { status: 400 });
      }
      const id = body.itemId as string;
      const sold = settings.sold_out_items.includes(id)
        ? settings.sold_out_items.filter((x) => x !== id)
        : [...settings.sold_out_items, id];
      const { error } = await db.from('store_settings').upsert({ ...settings, ...base, sold_out_items: sold });
      if (error) throw error;
    } else if (body.action === 'reset-daily') {
      const { error } = await db.from('orders').delete().gte('created_at', startOfTodayIST());
      if (error) throw error;
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    await broadcastChange(body.action === 'reset-daily' ? 'orders' : 'settings');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse('admin-settings', err, 'Could not update settings');
  }
}
