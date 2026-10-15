'use client';

import { X, Plus, Minus, ShoppingBag } from 'lucide-react';
import type { CartItem } from '@/lib/types';
import { CHEESE_ADDON_PRICE } from '@/lib/menu';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  cartTotal: number;
  cartCount: number;
  onUpdateQuantity: (id: string, addCheese: boolean, delta: number) => void;
  onToggleCheese: (id: string, currentAddCheese: boolean) => void;
  onCheckout: () => void;
  isKitchenOpen: boolean;
}

export function CartDrawer({
  isOpen,
  onClose,
  cart,
  cartTotal,
  cartCount,
  onUpdateQuantity,
  onToggleCheese,
  onCheckout,
  isKitchenOpen,
}: CartDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 animate-fade-in"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-md h-full bg-white border-l-[3px] border-[#111111] flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-[3px] border-[#111111] bg-[#111111] text-white">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" />
            <h2 className="font-heading font-bold text-lg uppercase tracking-tight">
              Your Order
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center border-2 border-white/30 hover:border-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Receipt Items */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="w-16 h-16 border-[3px] border-[#111111] flex items-center justify-center mb-4">
                <ShoppingBag className="w-8 h-8 text-[#111111]/40" />
              </div>
              <p className="font-heading font-bold text-lg uppercase mb-1">Cart is Empty</p>
              <p className="font-body text-sm text-[#111111]/60">Add a sub to get started.</p>
            </div>
          ) : (
            <div className="p-4 space-y-1">
              {/* Receipt header */}
              <div className="text-center mb-3 pb-3 receipt-divider">
                <div className="font-heading font-bold text-sm uppercase tracking-wider">Good Boy Grub</div>
                <div className="font-body text-xs text-[#111111]/60">Thane West • Order Slip</div>
              </div>

              {cart.map((item, idx) => {
                const unitPrice = item.price + (item.addCheese ? CHEESE_ADDON_PRICE : 0);
                const lineTotal = unitPrice * item.quantity;
                return (
                  <div key={`${item.id}-${item.addCheese}-${idx}`} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => onUpdateQuantity(item.id, item.addCheese, -1)}
                              className="w-6 h-6 border-2 border-[#111111] flex items-center justify-center hover:bg-[#111111] hover:text-white transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-heading font-bold text-base w-6 text-center">{item.quantity}</span>
                            <button
                              onClick={() => onUpdateQuantity(item.id, item.addCheese, 1)}
                              className="w-6 h-6 border-2 border-[#111111] flex items-center justify-center hover:bg-[#111111] hover:text-white transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="font-body text-sm font-medium truncate">{item.name}</span>
                        </div>
                        <div className="font-body text-xs text-[#111111]/60 mt-1 ml-12">₹{unitPrice} each</div>
                      </div>
                      <span className="font-heading font-bold text-base whitespace-nowrap">₹{lineTotal}</span>
                    </div>

                    {/* Add Extra Cheese Toggle */}
                    <label className="flex items-center gap-2 mt-2 ml-12 cursor-pointer group">
                      <div
                        className={`w-5 h-5 border-2 border-[#111111] flex items-center justify-center transition-colors ${
                          item.addCheese ? 'bg-[#FF5722]' : 'bg-white'
                        }`}
                        onClick={() => onToggleCheese(item.id, item.addCheese)}
                      >
                        {item.addCheese && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span
                        className="font-body text-xs font-medium select-none"
                        onClick={() => onToggleCheese(item.id, item.addCheese)}
                      >
                        Add Extra Cheese (+₹{CHEESE_ADDON_PRICE})
                      </span>
                    </label>
                  </div>
                );
              })}

              {/* Receipt divider before totals */}
              <div className="receipt-divider pt-3 mt-2" />
              <div className="space-y-1.5 py-2">
                <div className="flex justify-between font-body text-sm">
                  <span className="text-[#111111]/70">Subtotal</span>
                  <span className="font-medium">₹{cartTotal}</span>
                </div>
                <div className="flex justify-between font-body text-sm">
                  <span className="text-[#111111]/70">Delivery</span>
                  <span className="font-medium text-[#111111]/70">Calculated at checkout</span>
                </div>
                <div className="receipt-divider pt-2 mt-1" />
                <div className="flex justify-between items-center pt-1">
                  <span className="font-heading font-bold text-base uppercase">Total</span>
                  <span className="font-heading font-bold text-xl">₹{cartTotal}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="p-4 border-t-[3px] border-[#111111]">
            <button
              onClick={onCheckout}
              disabled={!isKitchenOpen}
              className="w-full bg-[#FF5722] text-white border-[3px] border-[#111111] py-3.5 font-heading font-bold text-base uppercase tracking-wide brutal-shadow brutal-press disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Proceed to Checkout
            </button>
            {!isKitchenOpen && (
              <p className="font-body text-xs text-center mt-2 text-[#FF5722] font-bold">
                Kitchen opens at 11 AM (Timings: 11 AM – 10 PM)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
