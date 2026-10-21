'use client';

import { X, Check, AlertCircle } from 'lucide-react';
import type { OrderRow } from '@/lib/types';
import { CHEESE_ADDON_PRICE } from '@/lib/menu';

interface OrderSuccessProps {
  order: OrderRow;
  onClose: () => void;
}

export function OrderSuccess({ order, onClose }: OrderSuccessProps) {
  const items = order.items || [];
  const subtotal = items.reduce((sum, item) => {
    const unitPrice = item.price + (item.addCheese ? CHEESE_ADDON_PRICE : 0);
    return sum + unitPrice * item.quantity;
  }, 0);


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/70 animate-fade-in" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white border-[3px] border-[#111111] brutal-shadow-orange animate-scale-in max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-[3px] border-[#111111] bg-[#FF5722] text-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white border-[3px] border-[#111111] flex items-center justify-center">
              <Check className="w-5 h-5 text-[#FF5722]" />
            </div>
            <h2 className="font-heading font-bold text-lg uppercase tracking-tight">Order Placed</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center border-2 border-white/40 hover:border-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Receipt body */}
        <div className="p-5">
          {/* Stamp */}
          <div className="flex justify-center mb-4">
            <div className="bg-[#FF5722] text-white border-[3px] border-[#111111] px-5 py-2 font-heading font-bold text-2xl tracking-wide rotate-[-3deg] animate-stamp-in">
              #{order.order_number}
            </div>
          </div>

          {/* Order received notice (admin reaches out on WhatsApp) */}
          <div className="mb-4 bg-[#FF5722]/10 border-2 border-[#FF5722] p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-[#FF5722] flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-body text-xs text-[#111111]/80 leading-relaxed">
                Order Received! We will reach out to you on WhatsApp in a few minutes to confirm your order and payment details.
              </p>
            </div>
          </div>

          {/* Receipt details */}
          <div className="border-[3px] border-[#111111] bg-[#F9F8F6] p-4">
            <div className="text-center mb-3 pb-3 receipt-divider">
              <div className="font-heading font-bold text-sm uppercase tracking-wider">Good Boy Grub</div>
              <div className="font-body text-xs text-[#111111]/60">{new Date(order.created_at).toLocaleString('en-IN')}</div>
            </div>

            <div className="space-y-2 mb-3">
              <div className="flex justify-between font-body text-sm">
                <span className="text-[#111111]/70">Customer</span>
                <span className="font-medium">{order.customer_name}</span>
              </div>
              <div className="flex justify-between font-body text-sm">
                <span className="text-[#111111]/70">Phone</span>
                <span className="font-medium">+91 {order.phone}</span>
              </div>
              <div className="flex justify-between font-body text-sm">
                <span className="text-[#111111]/70">Address</span>
                <span className="font-medium text-right max-w-[60%]">{order.address}, {order.pincode}</span>
              </div>
            </div>

            <div className="receipt-divider pt-3 mb-3" />

            {/* Items */}
            <div className="space-y-2">
              {items.map((item, idx) => {
                const unitPrice = item.price + (item.addCheese ? CHEESE_ADDON_PRICE : 0);
                return (
                  <div key={`${item.id}-${idx}`} className="flex justify-between font-body text-sm">
                    <div>
                      <span className="font-medium">{item.quantity}x {item.name}</span>
                      {item.addCheese && (
                        <span className="block text-xs text-[#FF5722] font-bold mt-0.5">+ EXTRA CHEESE</span>
                      )}
                    </div>
                    <span className="font-medium">₹{unitPrice * item.quantity}</span>
                  </div>
                );
              })}
            </div>

            <div className="receipt-divider pt-3 mt-3" />

            {/* Totals */}
            <div className="space-y-1.5 mt-3">
              <div className="flex justify-between font-body text-sm">
                <span className="text-[#111111]/70">Subtotal</span>
                <span className="font-medium">₹{subtotal}</span>
              </div>
              <div className="flex justify-between font-body text-sm">
                <span className="text-[#111111]/70">Delivery ({order.distance_km} km)</span>
                <span className="font-medium">{order.delivery_fee === 0 ? 'FREE' : `₹${order.delivery_fee}`}</span>
              </div>
              <div className="receipt-divider pt-2 mt-1" />
              <div className="flex justify-between items-center pt-1">
                <span className="font-heading font-bold text-base uppercase">Total</span>
                <span className="font-heading font-bold text-xl">₹{order.total_amount}</span>
              </div>
            </div>
          </div>


          <button
            onClick={onClose}
            className="mt-3 w-full bg-white text-[#111111] border-[3px] border-[#111111] py-2.5 font-heading font-bold text-sm uppercase tracking-wide brutal-press"
          >
            Back to Menu
          </button>
        </div>
      </div>
    </div>
  );
}
