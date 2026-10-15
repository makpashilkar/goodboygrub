import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getServiceClient, requireAdmin } from '@/lib/server/admin-client';

export const dynamic = 'force-dynamic';

/** Kitchen: list all orders (newest first). Requires admin passcode header. */
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  try {
    const { data, error } = await getServiceClient()
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const orders = (data ?? []).map(({ idempotency_key: _k, ...rest }) => rest);
    return NextResponse.json({ orders });
  } catch (err) {
    return errorResponse('admin-orders-list', err, 'Could not load orders');
  }
}
