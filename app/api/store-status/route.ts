import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/server/admin-client';
import { countTodayOrders, isKitchenClosedByTimeIST, loadSettings, remainingSlots } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/** Public, non-sensitive store status (no customer data). */
export async function GET() {
  try {
    const settings = await loadSettings();
    const count = await countTodayOrders();
    return NextResponse.json({
      settings,
      remainingSlots: remainingSlots(settings, count),
      kitchenClosedByTime: isKitchenClosedByTimeIST(),
    });
  } catch (err) {
    return errorResponse('store-status', err, 'Could not load store status');
  }
}
