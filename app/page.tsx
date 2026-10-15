'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ShoppingBag, Plus, Minus, X, Flame, Award, Leaf, Clock, Truck, ChefHat, Check, MapPin, Phone, Mail, Instagram, MessageCircle } from 'lucide-react';
import type { CartItem, StoreSettings, OrderRow } from '@/lib/types';
import { MENU_ITEMS, CHEESE_ADDON_PRICE, DAILY_SLOT_LIMIT, WHATSAPP_NUMBER } from '@/lib/menu';
import {
  fetchPublicStatus,
  subscribeToOrders,
  isKitchenClosedByTime,
} from '@/lib/supabase';
import { CartDrawer } from '@/components/storefront/cart-drawer';
import { CheckoutModal } from '@/components/storefront/checkout-modal';
import { OrderSuccess } from '@/components/storefront/order-success';

const SANDWICH_IMAGES: Record<string, string> = {
  'smoky-bbq-pull': 'https://images.pexels.com/photos/38550576/pexels-photo-38550576.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  'peri-peri-firecracker': 'https://images.pexels.com/photos/7596517/pexels-photo-7596517.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  'creamy-garlic-herb': 'https://images.pexels.com/photos/5122952/pexels-photo-5122952.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
};

const HERO_IMAGE = 'https://images.pexels.com/photos/38550575/pexels-photo-38550575.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';

const BADGE_ICONS: Record<string, typeof Flame> = {
  BESTSELLER: Award,
  SPICY: Flame,
  CREAMY: Leaf,
};

export default function Home() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<OrderRow | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [serverRemainingSlots, setServerRemainingSlots] = useState<number | null>(null);
  const [timeClosed, setTimeClosed] = useState(false);
  const mounted = useRef(true);

  const loadInitialData = useCallback(async () => {
    try {
      const status = await fetchPublicStatus();
      if (!mounted.current) return;
      setStoreSettings(status.settings);
      setServerRemainingSlots(status.remainingSlots);
      setTimeClosed(status.kitchenClosedByTime);
    } catch {
      /* keep last known status; the server still enforces limits at checkout */
      if (mounted.current) setTimeClosed(isKitchenClosedByTime());
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadInitialData();
    const unsubscribe = subscribeToOrders(() => {
      loadInitialData();
    });
    const interval = setInterval(() => {
      loadInitialData();
    }, 60000);
    return () => {
      mounted.current = false;
      unsubscribe();
      clearInterval(interval);
    };
  }, [loadInitialData]);

  const isStoreOpen = storeSettings?.is_store_open ?? true;
  const isKitchenOpen = isStoreOpen && !timeClosed;
  const remainingSlots =
    serverRemainingSlots ??
    (storeSettings?.daily_slot_limit ?? DAILY_SLOT_LIMIT) + (storeSettings?.slot_adjustment ?? 0);
  const slotsExhausted = remainingSlots <= 0;
  const soldOutItems = storeSettings?.sold_out_items ?? [];

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => {
    const unitPrice = item.price + (item.addCheese ? CHEESE_ADDON_PRICE : 0);
    return sum + unitPrice * item.quantity;
  }, 0);

  const addToCart = (itemId: string) => {
    if (!isKitchenOpen || slotsExhausted) return;
    if (soldOutItems.includes(itemId)) return;
    setCart((prev) => {
      const existing = prev.find((c) => c.id === itemId && !c.addCheese);
      if (existing) {
        return prev.map((c) =>
          c.id === itemId && !c.addCheese ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      const item = MENU_ITEMS.find((m) => m.id === itemId);
      if (!item) return prev;
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1, addCheese: false }];
    });
    setIsCartOpen(true);
  };

  const updateQuantity = (id: string, addCheese: boolean, delta: number) => {
    setCart((prev) => {
      return prev
        .map((c) => {
          if (c.id === id && c.addCheese === addCheese) {
            return { ...c, quantity: c.quantity + delta };
          }
          return c;
        })
        .filter((c) => c.quantity > 0);
    });
  };

  const toggleCheese = (id: string, currentAddCheese: boolean) => {
    setCart((prev) => {
      const item = prev.find((c) => c.id === id && c.addCheese === currentAddCheese);
      if (!item) return prev;
      if (item.quantity > 1) {
        return prev.map((c) => {
          if (c.id === id && c.addCheese === currentAddCheese) {
            return { ...c, quantity: c.quantity - 1 };
          }
          return c;
        }).concat([{ ...item, quantity: 1, addCheese: !currentAddCheese }]);
      }
      return prev.map((c) => {
        if (c.id === id && c.addCheese === currentAddCheese) {
          return { ...c, addCheese: !currentAddCheese };
        }
        return c;
      });
    });
  };

  const scrollToMenu = () => {
    document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCheckout = () => {
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  const handleOrderPlaced = (order: OrderRow) => {
    setPlacedOrder(order);
    setIsCheckoutOpen(false);
    setCart([]);
    loadInitialData();
  };

  const kitchenClosedMessage = 'Kitchen opens at 11 AM (Timings: 11 AM – 10 PM)';

  return (
    <div className="min-h-screen bg-[#F9F8F6]">
      {/* NAVBAR */}
      <nav className="sticky top-0 z-40 bg-[#F9F8F6] border-b-[3px] border-[#111111]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          {/* Logo */}
          <a href="#" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FF5722] border-[3px] border-[#111111] flex items-center justify-center font-heading font-bold text-white text-lg">
              GB
            </div>
            <div className="block">
              <div className="font-heading font-bold text-sm sm:text-lg leading-none tracking-tight">GOOD BOY GRUB</div>
              <div className="font-body text-[8px] sm:text-[10px] text-[#111111]/60 leading-none mt-0.5">THANE • SUBMARINES</div>
            </div>
          </a>

          {/* Center Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#" className="font-heading font-medium text-sm uppercase tracking-wide hover:text-[#FF5722] transition-colors">Home</a>
            <a href="#menu" className="font-heading font-medium text-sm uppercase tracking-wide hover:text-[#FF5722] transition-colors">Menu</a>
            <a href="#contact" className="font-heading font-medium text-sm uppercase tracking-wide hover:text-[#FF5722] transition-colors">Contact</a>
          </div>

          {/* Cart Button */}
          <button
            onClick={() => setIsCartOpen(true)}
            className="relative bg-white text-[#111111] border-[3px] border-[#111111] shadow-[4px_4px_0px_#111111] rounded-none font-heading font-bold text-sm uppercase px-5 py-2 flex items-center gap-2 hover:bg-[#FF5722] hover:text-white active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">Cart</span>
            {cartCount > 0 && (
              <span className="bg-[#FF5722] text-white w-5 h-5 flex items-center justify-center text-xs font-bold border-2 border-[#111111]">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative border-b-[3px] border-[#111111] overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20 grid md:grid-cols-2 gap-8 items-center">
          <div className="space-y-6">
            <div className="inline-block bg-[#FF5722] text-white border-[3px] border-[#111111] px-4 py-1.5 font-heading font-bold text-sm uppercase tracking-wide rotate-[-2deg] brutal-shadow">
              Served Fresh Daily
            </div>
            <h1 className="font-heading font-bold text-4xl sm:text-5xl md:text-6xl leading-[0.95] tracking-tight">
              The Ultimate<br />
              <span className="text-[#FF5722]">Shredded Chicken</span><br />
              Submarines.
            </h1>
            <p className="font-body text-base sm:text-lg text-[#111111]/80 max-w-md leading-relaxed">
              Small-batch, air-fried shredded chicken. Sourced fresh daily, shredded by hand, and piled high on fresh sub rolls. Only 10 made each day.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={scrollToMenu}
                className="bg-[#FF5722] text-white border-[3px] border-[#111111] px-8 py-3 font-heading font-bold text-base uppercase tracking-wide brutal-shadow brutal-press"
              >
                Order Now
              </button>
              <a
                href="#how-it-works"
                className="bg-white text-[#111111] border-[3px] border-[#111111] px-8 py-3 font-heading font-bold text-base uppercase tracking-wide brutal-shadow brutal-press"
              >
                How It Works
              </a>
            </div>
          </div>
          <div className="relative">
            <div className="border-[3px] border-[#111111] brutal-shadow overflow-hidden bg-white">
              <img
                src={HERO_IMAGE}
                alt="Freshly made shredded chicken submarine sandwich"
                className="w-full h-[300px] sm:h-[400px] object-cover"
              />
            </div>
            <div className="absolute -bottom-3 -left-3 bg-[#111111] text-white border-[3px] border-[#111111] px-4 py-2 font-heading font-bold text-sm uppercase rotate-[-3deg]">
              Made in Thane
            </div>
          </div>
        </div>
      </section>

      {/* SCARCITY / STORE STATUS BANNER */}
      <section className="border-b-[3px] border-[#111111]">
        <div className={`px-4 sm:px-6 py-3 font-heading font-bold text-sm uppercase tracking-wide text-center ${isKitchenOpen && !slotsExhausted ? 'bg-[#111111] text-white' : 'bg-[#FF5722] text-white'}`}>
          {isKitchenOpen && !slotsExhausted ? (
            <span className="flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" />
              Only {remainingSlots} of {storeSettings?.daily_slot_limit ?? DAILY_SLOT_LIMIT} Daily Slots Remaining Today
            </span>
          ) : (
            <span>{slotsExhausted ? 'All 10 Daily Slots Sold Out — Try Again Tomorrow at 11:00 AM' : 'Kitchen Closed — Opens at 11:00 AM (Timings: 11 AM – 10 PM)'}</span>
          )}
        </div>
      </section>

      {/* MENU */}
      <section id="menu" className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="mb-8 sm:mb-12">
          <h2 className="font-heading font-bold text-3xl sm:text-5xl tracking-tight">Today's Menu</h2>
          <p className="font-body text-[#111111]/70 mt-2 text-sm sm:text-base">Three flavor profiles. All ₹299. Air-fried, never greasy.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
          {MENU_ITEMS.map((item) => {
            const BadgeIcon = BADGE_ICONS[item.badge ?? ''] ?? Flame;
            const isSoldOut = soldOutItems.includes(item.id);
            const isDisabled = !isKitchenOpen || slotsExhausted || isSoldOut;
            return (
              <div
                key={item.id}
                className="bg-white border-[3px] border-[#111111] brutal-shadow flex flex-col"
              >
                {/* Image */}
                <div className="relative border-b-[3px] border-[#111111] overflow-hidden h-48 sm:h-56">
                  <img
                    src={SANDWICH_IMAGES[item.id]}
                    alt={item.name}
                    className={`w-full h-full object-cover ${isSoldOut ? 'grayscale opacity-60' : ''}`}
                  />
                  {item.badge && (
                    <div className={`absolute top-3 left-3 ${item.badgeColor} border-[3px] border-[#111111] px-3 py-1 font-heading font-bold text-xs uppercase tracking-wide rotate-[-2deg]`}>
                      <span className="flex items-center gap-1">
                        <BadgeIcon className="w-3 h-3" />
                        {item.badge}
                      </span>
                    </div>
                  )}
                  {isSoldOut && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-[#111111] text-white border-[3px] border-[#111111] px-6 py-2 font-heading font-bold text-lg uppercase rotate-[-3deg]">
                        Sold Out
                      </div>
                    </div>
                  )}
                </div>
                {/* Body */}
                <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-heading font-bold text-xl leading-tight mb-2">{item.name}</h3>
                  <p className="font-body text-sm text-[#111111]/70 leading-relaxed flex-1">{item.description}</p>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t-2 border-dashed border-[#111111]">
                    <span className="font-heading font-bold text-2xl">₹299</span>
                    <button
                      onClick={() => addToCart(item.id)}
                      disabled={isDisabled}
                      className={`border-[3px] border-[#111111] px-4 py-2 font-heading font-bold text-sm uppercase tracking-wide flex items-center gap-1.5 transition-all ${
                        isDisabled
                          ? 'bg-gray-300 text-gray-600 cursor-not-allowed shadow-none'
                          : 'bg-[#FF5722] text-white brutal-press'
                      }`}
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  </div>
                  {!isKitchenOpen && (
                    <p className="font-body text-xs text-[#FF5722] font-bold mt-2">
                      {kitchenClosedMessage}
                    </p>
                  )}
                  {isKitchenOpen && isSoldOut && (
                    <p className="font-body text-xs text-[#111111]/60 font-bold mt-2">
                      This item is currently sold out.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="border-t-[3px] border-[#111111] bg-[#111111] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <h2 className="font-heading font-bold text-3xl sm:text-5xl tracking-tight mb-8 sm:mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
            {[
              {
                num: '01',
                icon: ChefHat,
                title: 'Pick Your Sub',
                desc: 'Select your preferred shredded chicken flavor profile — smoky BBQ, fiery peri-peri, or creamy garlic & herb.',
              },
              {
                num: '02',
                icon: Flame,
                title: 'Air-Fried in Small Batches',
                desc: 'Chicken is sourced fresh daily, shredded by hand, and air-fried in limited 10-order batches for maximum crunch and zero grease.',
              },
              {
                num: '03',
                icon: Truck,
                title: 'Fast Thane Delivery',
                desc: 'Dispatched immediately from our Thane hub in insulated packaging. Free delivery within 4 km.',
              },
            ].map((step, i) => (
              <div key={step.num} className="relative">
                <div className="bg-white text-[#111111] border-[3px] border-[#111111] p-6 brutal-shadow">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-[#FF5722] border-[3px] border-[#111111] flex items-center justify-center">
                      <step.icon className="w-6 h-6 text-white" />
                    </div>
                    <span className="font-heading font-bold text-4xl text-[#111111]/15">{step.num}</span>
                  </div>
                  <h3 className="font-heading font-bold text-xl mb-2">{step.title}</h3>
                  <p className="font-body text-sm text-[#111111]/70 leading-relaxed">{step.desc}</p>
                </div>
                {i < 2 && (
                  <div className="hidden md:block absolute top-1/2 -right-5 z-10 text-[#FF5722] font-heading font-bold text-3xl">
                    →
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DARK BRUTALIST FOOTER */}
      <footer id="contact" className="bg-[#111111] text-[#F9F8F6] border-t-[6px] border-[#FF5722] pt-16 pb-8 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-10">
            {/* Left Column — Brand */}
            <div>
              <h3 className="font-heading font-bold text-3xl text-[#FF5722] tracking-tight mb-3">GOOD BOY GRUB</h3>
              <p className="font-body text-sm text-gray-400 leading-relaxed max-w-xs">
                No-nonsense shredded chicken submarine sandwiches. Prepared fresh daily using industrial-grade flavor and heavy-duty portions.
              </p>
            </div>

            {/* Middle Column — HQ / Kitchen */}
            <div>
              <h4 className="font-heading font-bold text-lg uppercase mb-4 tracking-wide text-white">HQ / Kitchen</h4>
              <ul className="space-y-3 font-body text-sm text-gray-400">
                <li className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-[#FF5722] flex-shrink-0 mt-0.5" />
                  <span>Teen Hath Naka, Thane West, Maharashtra 400601</span>
                </li>
                <li className="flex items-start gap-3">
                  <MessageCircle className="w-4 h-4 text-[#FF5722] flex-shrink-0 mt-0.5" />
                  <span>WhatsApp: +91 90000 00000</span>
                </li>
                <li className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-[#FF5722] flex-shrink-0 mt-0.5" />
                  <span>hello@goodboygrub.store</span>
                </li>
                <li className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-[#FF5722] flex-shrink-0 mt-0.5" />
                  <span>11 AM — 10 PM Daily</span>
                </li>
              </ul>
            </div>

            {/* Right Column — Info */}
            <div>
              <h4 className="font-heading font-bold text-lg uppercase mb-4 tracking-wide text-white">Info</h4>
              <div className="space-y-3 font-body text-sm">
                <a href="#" className="block text-gray-400 hover:text-[#FF5722] transition-colors">Terms of Service</a>
                <a href="#" className="block text-gray-400 hover:text-[#FF5722] transition-colors">Privacy Policy</a>
              </div>
              <div className="flex gap-3 mt-5">
                <a
                  href="#"
                  className="w-10 h-10 border-2 border-gray-500 hover:border-[#FF5722] flex items-center justify-center transition-colors"
                  aria-label="Instagram"
                >
                  <Instagram className="w-4 h-4 text-gray-400" />
                </a>
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 border-2 border-gray-500 hover:border-[#FF5722] flex items-center justify-center transition-colors"
                  aria-label="WhatsApp"
                >
                  <MessageCircle className="w-4 h-4 text-gray-400" />
                </a>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-gray-800 pt-6 mt-12 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="font-body text-xs text-gray-500 tracking-wide">
              © 2026 GOOD BOY GRUB. ALL RIGHTS RESERVED.
            </p>
            <a
              href="/admin"
              className="font-heading font-bold text-xs uppercase tracking-wide border-2 border-gray-600 hover:border-[#FF5722] hover:text-[#FF5722] px-4 py-2 transition-colors"
            >
              Kitchen Portal
            </a>
          </div>
        </div>
      </footer>

      {/* CART DRAWER */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        cartTotal={cartTotal}
        cartCount={cartCount}
        onUpdateQuantity={updateQuantity}
        onToggleCheese={toggleCheese}
        onCheckout={handleCheckout}
        isKitchenOpen={isKitchenOpen && !slotsExhausted}
      />

      {/* CHECKOUT MODAL */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cart={cart}
        cartTotal={cartTotal}
        onOrderPlaced={handleOrderPlaced}
      />

      {/* ORDER SUCCESS */}
      {placedOrder && (
        <OrderSuccess
          order={placedOrder}
          onClose={() => setPlacedOrder(null)}
          whatsappNumber={WHATSAPP_NUMBER}
        />
      )}
    </div>
  );
}
