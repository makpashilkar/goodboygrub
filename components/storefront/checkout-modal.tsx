'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Loader2, MapPin } from 'lucide-react';
import type { CartItem, OrderRow, CheckoutForm } from '@/lib/types';
import { CHEESE_ADDON_PRICE } from '@/lib/menu';
import { getDeliveryInfo } from '@/lib/delivery';
import {
  createOrder,
  saveCustomerDetails,
  getSavedCustomerDetails,
  ApiError,
} from '@/lib/supabase';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  cartTotal: number;
  onOrderPlaced: (order: OrderRow) => void;
}

const ADDRESS_TYPES: Array<CheckoutForm['addressType']> = ['Home', 'Work', 'Other'];

const BLOCKED_PHONES = [
  '9999999999',
  '8888888888',
  '7777777777',
  '6666666666',
  '5555555555',
  '0000000000',
  '1111111111',
  '1234567890',
  '9876543210',
];

function isValidIndianPhone(phone: string): boolean {
  if (!/^[6-9]\d{9}$/.test(phone)) return false;
  if (BLOCKED_PHONES.includes(phone)) return false;
  const first = phone[0];
  if (phone.split('').every((d) => d === first)) return false;
  return true;
}

export function CheckoutModal({
  isOpen,
  onClose,
  cart,
  cartTotal,
  onOrderPlaced,
}: CheckoutModalProps) {
  const [form, setForm] = useState<CheckoutForm>({
    customerName: '',
    phone: '',
    addressType: 'Home',
    address: '',
    pincode: '',
    specialInstructions: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CheckoutForm, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  // One key per checkout attempt: retries/double-clicks resolve to the same saved order.
  const idempotencyKeyRef = useRef<string>('');

  const deliveryInfo = form.pincode.length === 6 ? getDeliveryInfo(form.pincode) : null;
  const deliveryFee = deliveryInfo?.deliveryFee ?? 0;
  const grandTotal = cartTotal + deliveryFee;

  useEffect(() => {
    if (isOpen) {
      setSubmitError(null);
      const saved = getSavedCustomerDetails();
      if (saved) {
        setForm((prev) => ({
          ...prev,
          customerName: saved.customerName,
          phone: saved.phone,
          address: saved.address,
          pincode: saved.pincode,
          addressType: saved.addressType,
        }));
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const e: Partial<Record<keyof CheckoutForm, string>> = {};
    if (!form.customerName.trim()) e.customerName = 'Name is required';
    if (!isValidIndianPhone(form.phone)) {
      e.phone = 'Enter a valid 10-digit Indian mobile number (starts with 6-9)';
    }
    if (!form.address.trim()) e.address = 'Address is required';
    if (!/^\d{6}$/.test(form.pincode)) e.pincode = 'Enter a valid 6-digit Thane pincode';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return; // guard against rapid repeated clicks
    if (!validate()) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();

    try {
      // Server re-prices the cart and the Resend email is sent server-side after the DB write succeeds.
      const order = await createOrder({
        customerName: form.customerName,
        phone: form.phone,
        address: form.address,
        pincode: form.pincode,
        addressType: form.addressType,
        specialInstructions: form.specialInstructions,
        items: cart,
        idempotencyKey: idempotencyKeyRef.current,
      });

      idempotencyKeyRef.current = ''; // next order gets a fresh key
      saveCustomerDetails({
        customerName: form.customerName,
        phone: form.phone,
        address: form.address,
        pincode: form.pincode,
        addressType: form.addressType,
      });

      onOrderPlaced(order);
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const inputClass = (field: keyof CheckoutForm) =>
    `w-full bg-white border-[3px] border-[#111111] px-3 py-2.5 font-body text-sm focus:outline-none focus:shadow-[4px_4px_0px_#FF5722] transition-shadow ${
      errors[field] ? 'border-[#FF5722] bg-[#FF5722]/5' : ''
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 animate-fade-in" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[95vh] bg-white border-[3px] border-[#111111] brutal-shadow-orange flex flex-col animate-scale-in">
        {/* Header (locked) */}
        <div className="flex items-center justify-between p-4 border-b-[3px] border-[#111111] bg-[#111111] text-white flex-shrink-0">
          <h2 className="font-heading font-bold text-lg uppercase tracking-tight">Checkout</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center border-2 border-white/30 hover:border-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="font-heading font-bold text-sm uppercase tracking-wide block mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              placeholder="e.g. Rohan Mehta"
              className={inputClass('customerName')}
            />
            {errors.customerName && <p className="font-body text-xs text-[#FF5722] mt-1">{errors.customerName}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="font-heading font-bold text-sm uppercase tracking-wide block mb-1.5">
              WhatsApp Number
            </label>
            <div className="flex items-stretch border-[3px] border-[#111111]">
              <span className="flex items-center px-3 bg-[#111111] text-white font-body text-sm font-medium">+91</span>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                placeholder="10-digit mobile number"
                className="flex-1 bg-white px-3 py-2.5 font-body text-sm focus:outline-none no-spinner"
              />
            </div>
            {errors.phone && <p className="font-body text-xs text-[#FF5722] mt-1">{errors.phone}</p>}
          </div>

          {/* Address Type */}
          <div>
            <label className="font-heading font-bold text-sm uppercase tracking-wide block mb-1.5">
              Address Type
            </label>
            <div className="flex gap-2">
              {ADDRESS_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => setForm({ ...form, addressType: type })}
                  className={`px-4 py-2 font-heading font-bold text-sm uppercase border-[3px] border-[#111111] brutal-press transition-colors ${
                    form.addressType === type ? 'bg-[#FF5722] text-white' : 'bg-white text-[#111111] hover:bg-[#111111] hover:text-white'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="font-heading font-bold text-sm uppercase tracking-wide block mb-1.5">
              Full Street Address
            </label>
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Flat / House no, Building, Street, Area, Landmark"
              rows={3}
              className={`${inputClass('address')} resize-none`}
            />
            {errors.address && <p className="font-body text-xs text-[#FF5722] mt-1">{errors.address}</p>}
          </div>

          {/* Pincode */}
          <div>
            <label className="font-heading font-bold text-sm uppercase tracking-wide block mb-1.5">
              Thane Pincode
            </label>
            <input
              type="tel"
              value={form.pincode}
              onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
              placeholder="e.g. 400601"
              className={`${inputClass('pincode')} no-spinner`}
            />
            {errors.pincode && <p className="font-body text-xs text-[#FF5722] mt-1">{errors.pincode}</p>}

            {/* Delivery fee preview */}
            {deliveryInfo && (
              <div className="mt-2 bg-[#F9F8F6] border-2 border-[#111111] px-3 py-2 flex items-center justify-between">
                <span className="font-body text-xs flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {deliveryInfo.distanceKm} km from kitchen hub
                </span>
                <span className={`font-heading font-bold text-sm ${deliveryFee === 0 ? 'text-[#FF5722]' : ''}`}>
                  {deliveryFee === 0 ? 'FREE Delivery' : `₹${deliveryFee} delivery`}
                </span>
              </div>
            )}
          </div>

          {/* Special Instructions */}
          <div>
            <label className="font-heading font-bold text-sm uppercase tracking-wide block mb-1.5">
              Special Instructions <span className="text-[#111111]/40 font-body normal-case">(optional)</span>
            </label>
            <textarea
              value={form.specialInstructions}
              onChange={(e) => setForm({ ...form, specialInstructions: e.target.value })}
              placeholder="e.g. Ring the bell twice, no onion, etc."
              rows={2}
              className="w-full bg-white border-[3px] border-[#111111] px-3 py-2.5 font-body text-sm focus:outline-none focus:shadow-[4px_4px_0px_#FF5722] transition-shadow resize-none"
            />
          </div>

          {/* Order Summary */}
          <div className="bg-[#F9F8F6] border-[3px] border-[#111111] p-3">
            <div className="font-heading font-bold text-sm uppercase mb-2">Order Summary</div>
            <div className="space-y-1.5 font-body text-sm">
              {cart.map((item, idx) => {
                const unitPrice = item.price + (item.addCheese ? CHEESE_ADDON_PRICE : 0);
                return (
                  <div key={`${item.id}-${item.addCheese}-${idx}`} className="flex justify-between">
                    <span className="text-[#111111]/80">
                      {item.quantity}x {item.name}
                      {item.addCheese ? ' + Cheese' : ''}
                    </span>
                    <span className="font-medium">₹{unitPrice * item.quantity}</span>
                  </div>
                );
              })}
              <div className="receipt-divider pt-2 mt-1" />
              <div className="flex justify-between">
                <span className="text-[#111111]/70">Subtotal</span>
                <span className="font-medium">₹{cartTotal}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#111111]/70">Delivery</span>
                <span className="font-medium">
                  {form.pincode.length === 6 ? (deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`) : 'Enter pincode'}
                </span>
              </div>
              <div className="receipt-divider pt-2 mt-1" />
              <div className="flex justify-between items-center pt-1">
                <span className="font-heading font-bold text-base uppercase">Total</span>
                <span className="font-heading font-bold text-xl">₹{form.pincode.length === 6 ? grandTotal : cartTotal}</span>
              </div>
            </div>
          </div>

          {submitError && (
            <div className="bg-[#FF5722]/10 border-2 border-[#FF5722] px-3 py-2 font-body text-sm text-[#FF5722]">
              {submitError}
            </div>
          )}

          {/* Payment note */}
          <div className="bg-[#111111] text-white p-3 flex items-start gap-2">
            <div className="w-5 h-5 bg-[#FF5722] flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="font-heading font-bold text-[10px]">₹</span>
            </div>
            <p className="font-body text-xs leading-relaxed">
              Payment via GPay / UPI. After you place your order, we will message you on WhatsApp to confirm it and share payment details. Cash on Delivery also available.
            </p>
          </div>
        </div>

        {/* Footer (locked, sticky) */}
        <div className="flex-shrink-0 p-4 border-t-[3px] border-[#111111] bg-white">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || cart.length === 0}
            className="w-full bg-[#FF5722] text-white border-[3px] border-[#111111] py-3.5 font-heading font-bold text-base uppercase tracking-wide brutal-shadow brutal-press disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Placing Order...
              </>
            ) : (
              `Place Order • ₹${form.pincode.length === 6 ? grandTotal : cartTotal}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
