import { NextRequest, NextResponse } from 'next/server';
import { broadcastChange, errorResponse, getServiceClient, requireAdmin } from '@/lib/server/admin-client';

export const dynamic = 'force-dynamic';

const STATUSES = ['new', 'preparing', 'dispatched', 'delivered', 'cancelled'];

/** Update an order's status and/or WhatsApp-verified flag. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  let body: { status?: string; is_whatsapp_verified?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    patch.status = body.status;
  }
  if (body.is_whatsapp_verified !== undefined) patch.is_whatsapp_verified = body.is_whatsapp_verified === true;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  try {
    const { data, error } = await getServiceClient()
      .from('orders')
      .update(patch)
      .eq('id', params.id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    await broadcastChange('orders', params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse('admin-order-update', err, 'Could not update order');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const { error } = await getServiceClient().from('orders').delete().eq('id', params.id);
    if (error) throw error;
    await broadcastChange('orders', params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse('admin-order-delete', err, 'Could not delete order');
  }
}
