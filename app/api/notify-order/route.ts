import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      console.log('[notify-order] No RESEND_API_KEY set — logging order notification as fallback:');
      console.log('[notify-order] Order:', JSON.stringify(body, null, 2));
      return NextResponse.json({
        success: true,
        message: 'Notification logged (no Resend API key configured)',
      });
    }

    const { orderNumber, customerName, phone, items, totalAmount, address, pincode } = body;

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Good Boy Grub <onboarding@resend.dev>', //
        to: ['goodboygrub@gmail.com'], //changing the email
        subject: `New Order ${orderNumber} — ${customerName}`,
        html: `
          <h2>New Order: ${orderNumber}</h2>
          <p><strong>Customer:</strong> ${customerName}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Address:</strong> ${address}, ${pincode}</p>
          <h3>Items:</h3>
          <ul>
            ${items.map((item: any) => `<li>${item.quantity}x ${item.name} ${item.addCheese ? '(+ Extra Cheese)' : ''} — ₹${item.price * item.quantity}</li>`).join('')}
          </ul>
          <p><strong>Total:</strong> ₹${totalAmount}</p>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      console.error('[notify-order] Resend API error:', errText);
      return NextResponse.json(
        { success: false, message: 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: 'Email sent' });
  } catch (err) {
    console.error('[notify-order] Error:', err);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}
