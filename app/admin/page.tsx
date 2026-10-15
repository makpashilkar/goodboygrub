'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Lock, Power, RotateCcw, TrendingUp, Package, MessageCircle,
  ArrowRight, ArrowLeft, ChefHat, Truck, CheckCircle2, Clock,
  Plus, Minus, Trash2, XCircle, History, Layout,
  Volume2, VolumeX,
} from 'lucide-react';
import type { OrderRow, StoreSettings } from '@/lib/types';
import { DAILY_SLOT_LIMIT, CHEESE_ADDON_PRICE, MENU_ITEMS } from '@/lib/menu';
import {
  fetchStoreSettings, fetchOrders, updateStoreOpen, updateOrderStatus,
  cancelOrder, deleteOrder, updateSlotAdjustment, resetDailyCount, subscribeToOrders,
  getRemainingSlots, setOrderWhatsAppVerified, toggleSoldOutItem, adminLogin,
  type RealtimeState,
} from '@/lib/supabase';

const STATUS_COLUMNS: Array<{
  status: OrderRow['status'];
  title: string;
  icon: typeof ChefHat;
  nextStatus: OrderRow['status'] | null;
  nextLabel: string;
  prevStatus: OrderRow['status'] | null;
  prevLabel: string;
  color: string;
}> = [
  {
    status: 'new',
    title: 'New Orders',
    icon: Clock,
    nextStatus: 'preparing',
    nextLabel: 'Start Grilling',
    prevStatus: null,
    prevLabel: '',
    color: 'border-t-[#FF5722]',
  },
  {
    status: 'preparing',
    title: 'Assembling / On The Grill',
    icon: ChefHat,
    nextStatus: 'dispatched',
    nextLabel: 'Mark Dispatched',
    prevStatus: 'new',
    prevLabel: 'Back to New',
    color: 'border-t-[#FF5722]',
  },
  {
    status: 'dispatched',
    title: 'Dispatched / Delivered',
    icon: Truck,
    nextStatus: 'delivered',
    nextLabel: 'Mark Delivered',
    prevStatus: 'preparing',
    prevLabel: 'Back to Grill',
    color: 'border-t-[#FF5722]',
  },
];

const STATUS_LABELS: Record<OrderRow['status'], { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-[#FF5722] text-white' },
  preparing: { label: 'Preparing', color: 'bg-[#111111] text-white' },
  dispatched: { label: 'Dispatched', color: 'bg-[#111111] text-white' },
  delivered: { label: 'Delivered', color: 'bg-[#25D366] text-[#111111]' },
  cancelled: { label: 'Cancelled', color: 'bg-[#FF5722]/20 text-[#FF5722]' },
};

type ViewMode = 'kitchen' | 'history';

export default function AdminPage() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState(false);

  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('kitchen');
  const [scrapConfirmId, setScrapConfirmId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('connecting');
  const [loginBusy, setLoginBusy] = useState(false);
  const loadSeq = useRef(0);
  const prevOrderCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mounted = useRef(true);
  const soundEnabledRef = useRef(true);
  soundEnabledRef.current = soundEnabled;

  const loadData = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const [settings, allOrders] = await Promise.all([
        fetchStoreSettings(),
        fetchOrders(),
      ]);
      // Ignore unmounted calls and responses older than the latest request.
      if (!mounted.current || seq !== loadSeq.current) return;
      setStoreSettings(settings);
      setOrders(allOrders);
      setLoadError(null);
      setLoading(false);

      const newCount = allOrders.filter((o) => o.status === 'new').length;
      if (
        soundEnabledRef.current &&
        prevOrderCountRef.current > 0 &&
        newCount > prevOrderCountRef.current
      ) {
        playBell();
      }
      prevOrderCountRef.current = newCount;
    } catch (err) {
      if (!mounted.current || seq !== loadSeq.current) return;
      setLoadError(err instanceof Error ? err.message : 'Could not load orders');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (isAuthed) {
      loadData();
      const unsubscribe = subscribeToOrders(() => loadData(), setRealtimeState);
      return () => {
        mounted.current = false;
        unsubscribe();
      };
    }
    return () => { mounted.current = false; };
  }, [isAuthed, loadData]);

  function playBell() {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(
          'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
        );
      }
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    } catch {
      /* noop */
    }
  }

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginBusy(true);
    try {
      if (await adminLogin(passcode)) {
        setIsAuthed(true);
        setPasscodeError(false);
      } else {
        setPasscodeError(true);
      }
    } catch (err) {
      setPasscodeError(false);
      setLoadError(err instanceof Error ? err.message : 'Could not reach the server');
    } finally {
      setLoginBusy(false);
    }
  };

  /** Runs a write; on failure surfaces the error instead of silently ignoring it; always re-syncs from Supabase. */
  const runAction = async (fn: () => Promise<void>) => {
    try {
      await fn();
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
    loadData();
  };

  const handleToggleStore = async () => {
    if (!storeSettings) return;
    await runAction(() => updateStoreOpen(!storeSettings.is_store_open));
  };

  const handleResetDaily = async () => {
    await runAction(() => resetDailyCount());
  };

  const handleAdvance = async (orderId: string, newStatus: OrderRow['status']) => {
    await runAction(() => updateOrderStatus(orderId, newStatus));
  };

  const handleScrap = async (orderId: string) => {
    await runAction(() => cancelOrder(orderId));
    setScrapConfirmId(null);
  };

  const handleDelete = async (orderId: string) => {
    await runAction(() => deleteOrder(orderId));
    setDeleteConfirmId(null);
  };

  const handleSlotAdjust = async (delta: number) => {
    await runAction(() => updateSlotAdjustment(delta));
  };

  const handleToggleVerified = async (orderId: string, current: boolean) => {
    await runAction(() => setOrderWhatsAppVerified(orderId, !current));
  };

  const handleToggleSoldOut = async (itemId: string) => {
    await runAction(() => toggleSoldOutItem(itemId));
  };

  const today = new Date().toDateString();
  const todayOrders = orders.filter(
    (o) => new Date(o.created_at).toDateString() === today && o.status !== 'cancelled'
  );
  const activeOrders = orders.filter(
    (o) => o.status === 'new' || o.status === 'preparing' || o.status === 'dispatched'
  );
  const todayRevenue = todayOrders.reduce((sum, o) => sum + o.total_amount, 0);
  const allTimeRevenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total_amount, 0);
  const totalOrders = orders.filter((o) => o.status !== 'cancelled').length;
  const slotAdj = storeSettings?.slot_adjustment ?? 0;
  const effectiveLimit = (storeSettings?.daily_slot_limit ?? DAILY_SLOT_LIMIT) + slotAdj;
  const remainingSlots = getRemainingSlots(
    orders,
    storeSettings?.daily_slot_limit ?? DAILY_SLOT_LIMIT,
    slotAdj
  );
  const soldOutItems = storeSettings?.sold_out_items ?? [];

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="inline-flex w-16 h-16 bg-[#FF5722] border-[3px] border-[#111111] items-center justify-center mb-4 brutal-shadow">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="font-heading font-bold text-2xl uppercase text-white tracking-tight">Kitchen Admin</h1>
            <p className="font-body text-sm text-white/50 mt-1">Enter passcode to access dashboard</p>
          </div>
          <form onSubmit={handlePasscodeSubmit} className="space-y-3">
            <input
              type="password"
              value={passcode}
              onChange={(e) => {
                setPasscode(e.target.value);
                setPasscodeError(false);
              }}
              placeholder="Passcode"
              autoFocus
              className="w-full bg-white text-[#111111] border-[3px] border-[#111111] px-4 py-3 font-body text-sm focus:outline-none focus:shadow-[4px_4px_0px_#FF5722] transition-shadow"
            />
            {passcodeError && (
              <p className="font-body text-sm text-[#FF5722]">Incorrect passcode. Try again.</p>
            )}
            {loadError && (
              <p className="font-body text-sm text-[#FF5722]">{loadError}</p>
            )}
            <button
              type="submit"
              disabled={loginBusy}
              className="w-full bg-[#FF5722] text-white border-[3px] border-[#111111] py-3 font-heading font-bold text-base uppercase tracking-wide brutal-shadow brutal-press disabled:opacity-60"
            >
              {loginBusy ? 'Checking...' : 'Enter Dashboard'}
            </button>
          </form>
          <a href="/" className="block text-center mt-4 font-body text-sm text-white/40 hover:text-white transition-colors">
            ← Back to Storefront
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] text-white">
      {/* Admin Header */}
      <div className="border-b-[3px] border-white/20 sticky top-0 z-30 bg-[#121212]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#FF5722] border-[3px] border-[#111111] flex items-center justify-center font-heading font-bold text-white text-sm">
              GB
            </div>
            <div>
              <div className="font-heading font-bold text-sm uppercase tracking-tight">Kitchen Command</div>
              <div className="font-body text-[10px] text-white/50">Admin Dashboard</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span
              className="font-body text-xs text-white/60 flex items-center gap-1.5"
              title={realtimeState === 'live' ? 'Receiving live updates' : 'Live updates unavailable; refreshing every 15s'}
            >
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  realtimeState === 'live' ? 'bg-[#25D366]' : realtimeState === 'connecting' ? 'bg-yellow-400' : 'bg-[#FF5722]'
                }`}
              />
              {realtimeState === 'live' ? 'Live' : realtimeState === 'connecting' ? 'Connecting' : 'Offline (polling)'}
            </span>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="flex items-center gap-2 font-heading font-bold text-xs uppercase border-2 border-white/30 px-3 py-1.5 hover:border-[#FF5722] transition-colors"
              title={soundEnabled ? 'Disable new-order sound' : 'Enable new-order sound'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              {soundEnabled ? 'Sound On' : 'Sound Off'}
            </button>
            <a href="/" className="font-body text-sm text-white/50 hover:text-[#FF5722] transition-colors">
              View Storefront →
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {(loadError || actionError) && (
          <div role="alert" className="bg-[#FF5722]/15 border-2 border-[#FF5722] px-4 py-3 font-body text-sm text-[#FF5722]">
            {actionError ?? loadError}
            {loadError && !actionError ? ' — retrying automatically.' : ''}
          </div>
        )}
        {/* Top Controls — 5 metrics now */}
        <div className="grid md:grid-cols-5 gap-4">
          {/* Master Kitchen Switch */}
          <div className="md:col-span-1 bg-white text-[#111111] border-[3px] border-[#111111] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Power className="w-5 h-5 text-[#FF5722]" />
              <span className="font-heading font-bold text-sm uppercase">Kitchen</span>
            </div>
            <button
              onClick={handleToggleStore}
              className={`w-full py-3 font-heading font-bold text-base uppercase border-[3px] border-[#111111] brutal-press transition-colors ${
                storeSettings?.is_store_open
                  ? 'bg-[#FF5722] text-white'
                  : 'bg-[#111111] text-white'
              }`}
            >
              {storeSettings?.is_store_open ? 'Store Open' : 'Store Closed'}
            </button>
            <p className="font-body text-xs text-[#111111]/60 mt-2 text-center">
              {storeSettings?.is_store_open ? 'Accepting orders' : 'Orders locked'}
            </p>
          </div>

          {/* Daily Slots with Adjustment */}
          <div className="bg-white text-[#111111] border-[3px] border-[#111111] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-5 h-5 text-[#FF5722]" />
              <span className="font-heading font-bold text-sm uppercase">Daily Slots</span>
            </div>
            <div className="font-heading font-bold text-3xl">
              {todayOrders.length}<span className="text-[#111111]/30 text-xl">/{effectiveLimit}</span>
            </div>
            <div className="flex items-center justify-between mt-2 gap-2">
              <span className="font-body text-xs text-[#111111]/60">
                {remainingSlots} left{slotAdj !== 0 ? ` (${slotAdj > 0 ? '+' : ''}${slotAdj} adj.)` : ''}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleSlotAdjust(-1)}
                  className="w-7 h-7 border-2 border-[#111111] flex items-center justify-center hover:bg-[#111111] hover:text-white transition-colors brutal-press"
                  title="Decrease available slots by 1"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleSlotAdjust(1)}
                  className="w-7 h-7 border-2 border-[#111111] bg-[#FF5722] text-white flex items-center justify-center brutal-press"
                  title="Increase available slots by 1 (free up a slot)"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleResetDaily}
                  className="font-body text-xs font-medium text-[#FF5722] hover:underline flex items-center gap-1 ml-1"
                  title="Delete all of today's orders and reset count"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Active Orders */}
          <div className="bg-white text-[#111111] border-[3px] border-[#111111] p-4">
            <div className="flex items-center gap-2 mb-2">
              <ChefHat className="w-5 h-5 text-[#FF5722]" />
              <span className="font-heading font-bold text-sm uppercase">Active Orders</span>
            </div>
            <div className="font-heading font-bold text-3xl">{activeOrders.length}</div>
            <p className="font-body text-xs text-[#111111]/60 mt-2">In pipeline now</p>
          </div>

          {/* Today's Revenue */}
          <div className="bg-white text-[#111111] border-[3px] border-[#111111] p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-[#FF5722]" />
              <span className="font-heading font-bold text-sm uppercase">Today's Revenue</span>
            </div>
            <div className="font-heading font-bold text-3xl">₹{todayRevenue}</div>
            <p className="font-body text-xs text-[#111111]/60 mt-2">From {todayOrders.length} orders</p>
          </div>

          {/* All-Time Revenue */}
          <div className="bg-white text-[#111111] border-[3px] border-[#111111] p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-[#FF5722]" />
              <span className="font-heading font-bold text-sm uppercase">All-Time Revenue</span>
            </div>
            <div className="font-heading font-bold text-3xl">₹{allTimeRevenue}</div>
            <p className="font-body text-xs text-[#111111]/60 mt-2">From {totalOrders} orders total</p>
          </div>
        </div>

        {/* Sold-Out Toggle Bar */}
        <div className="bg-[#1a1a1a] border-[3px] border-white/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-4 h-4 text-[#FF5722]" />
            <span className="font-heading font-bold text-sm uppercase tracking-wide">Menu Item Stock Control</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {MENU_ITEMS.map((item) => {
              const isSoldOut = soldOutItems.includes(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => handleToggleSoldOut(item.id)}
                  className={`px-3 py-2 font-heading font-bold text-xs uppercase border-[3px] border-[#111111] brutal-press transition-colors ${
                    isSoldOut
                      ? 'bg-[#FF5722] text-white'
                      : 'bg-white text-[#111111] hover:bg-[#111111] hover:text-white'
                  }`}
                >
                  {isSoldOut ? 'SOLD OUT' : 'IN STOCK'} — {item.shortName}
                </button>
              );
            })}
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('kitchen')}
            className={`px-4 py-2 font-heading font-bold text-sm uppercase border-[3px] border-white/30 brutal-press flex items-center gap-2 transition-colors ${
              viewMode === 'kitchen' ? 'bg-[#FF5722] text-white border-[#111111]' : 'bg-transparent text-white/60'
            }`}
          >
            <Layout className="w-4 h-4" />
            Today's Kitchen
          </button>
          <button
            onClick={() => setViewMode('history')}
            className={`px-4 py-2 font-heading font-bold text-sm uppercase border-[3px] border-white/30 brutal-press flex items-center gap-2 transition-colors ${
              viewMode === 'history' ? 'bg-[#FF5722] text-white border-[#111111]' : 'bg-transparent text-white/60'
            }`}
          >
            <History className="w-4 h-4" />
            Order History
            <span className="bg-white/20 px-1.5 text-xs">{orders.length}</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="font-heading font-bold text-lg uppercase text-white/40">Loading orders...</div>
          </div>
        ) : viewMode === 'kitchen' ? (
          /* KANBAN BOARD */
          <div className="grid md:grid-cols-3 gap-4">
            {STATUS_COLUMNS.map((col) => {
              const colOrders = orders.filter((o) => o.status === col.status);
              return (
                <div key={col.status} className={`bg-[#1a1a1a] border-[3px] border-white/20 border-t-[3px] ${col.color}`}>
                  <div className="p-3 border-b-[3px] border-white/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <col.icon className="w-4 h-4 text-[#FF5722]" />
                      <span className="font-heading font-bold text-sm uppercase tracking-wide">{col.title}</span>
                    </div>
                    <span className="font-heading font-bold text-sm bg-[#FF5722] text-white w-6 h-6 flex items-center justify-center border-2 border-[#111111]">
                      {colOrders.length}
                    </span>
                  </div>
                  <div className="p-3 space-y-3 min-h-[200px]">
                    {colOrders.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="font-body text-xs text-white/30">No orders here</p>
                      </div>
                    ) : (
                      colOrders.map((order) => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          column={col}
                          onAdvance={handleAdvance}
                          onScrap={(id) => setScrapConfirmId(id)}
                          scrapConfirmId={scrapConfirmId}
                          onConfirmScrap={handleScrap}
                          onCancelScrap={() => setScrapConfirmId(null)}
                          onToggleVerified={handleToggleVerified}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ORDER HISTORY VIEW */
          <OrderHistory
            orders={orders}
            deleteConfirmId={deleteConfirmId}
            onDelete={handleDelete}
            onSetDeleteConfirm={setDeleteConfirmId}
          />
        )}
      </div>
    </div>
  );
}

/* ============================================================
   ORDER CARD COMPONENT (Kanban)
   ============================================================ */

interface OrderCardProps {
  order: OrderRow;
  column: typeof STATUS_COLUMNS[number];
  onAdvance: (orderId: string, status: OrderRow['status']) => void;
  onScrap: (orderId: string) => void;
  scrapConfirmId: string | null;
  onConfirmScrap: (orderId: string) => void;
  onCancelScrap: () => void;
  onToggleVerified: (orderId: string, current: boolean) => void;
}

function OrderCard({ order, column, onAdvance, onScrap, scrapConfirmId, onConfirmScrap, onCancelScrap, onToggleVerified }: OrderCardProps) {
  const items = order.items || [];
  const waText = encodeURIComponent(
    `Hi ${order.customer_name}! This is Good Boy Grub regarding your order #${order.order_number}. Please share your GPay screenshot or let us know your delivery preference. Total: ₹${order.total_amount}`
  );
  const waUrl = `https://wa.me/91${order.phone}?text=${waText}`;
  const hasCheese = items.some((i) => i.addCheese);
  const isConfirmingScrap = scrapConfirmId === order.id;
  const isVerified = order.is_whatsapp_verified;

  return (
    <div className="bg-white text-[#111111] border-[3px] border-[#111111] brutal-shadow">
      {/* Card header with verification badge */}
      <div className="p-3 border-b-2 border-dashed border-[#111111]">
        <div className="flex items-center justify-between mb-1">
          <span className="font-heading font-bold text-base">#{order.order_number}</span>
          <button
            onClick={() => onToggleVerified(order.id, isVerified)}
            className={`px-2 py-0.5 font-heading font-bold text-[10px] uppercase border-2 border-[#111111] brutal-press transition-colors ${
              isVerified
                ? 'bg-[#25D366] text-[#111111]'
                : 'bg-[#FF5722] text-white'
            }`}
            title={isVerified ? 'Click to mark as unverified' : 'Click to mark as WhatsApp verified'}
          >
            {isVerified ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Verified
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                Unverified
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-body text-sm font-medium">{order.customer_name}</div>
            <div className="font-body text-xs text-[#111111]/60">+91 {order.phone}</div>
          </div>
          <span className="font-body text-xs text-[#111111]/60">
            {new Date(order.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Items */}
      <div className="p-3 border-b-2 border-dashed border-[#111111]">
        <div className="space-y-1.5">
          {items.map((item, idx) => (
            <div key={`${item.id}-${idx}`} className="flex justify-between font-body text-sm">
              <div>
                <span className="font-medium">{item.quantity}x {item.name}</span>
                {item.addCheese && (
                  <span className="block text-xs text-[#FF5722] font-bold">+ Extra Cheese</span>
                )}
              </div>
              <span className="font-medium">
                ₹{(item.price + (item.addCheese ? CHEESE_ADDON_PRICE : 0)) * item.quantity}
              </span>
            </div>
          ))}
        </div>
        {hasCheese && (
          <div className="mt-2 inline-block bg-[#FF5722] text-white border-2 border-[#111111] px-2 py-0.5 font-heading font-bold text-[10px] uppercase rotate-[-1deg]">
            + Extra Cheese
          </div>
        )}
      </div>

      {/* Delivery info */}
      <div className="p-3 border-b-2 border-dashed border-[#111111] space-y-1">
        <div className="font-body text-xs text-[#111111]/70">
          <span className="font-bold uppercase">{order.address_type}</span> • {order.address}, {order.pincode}
        </div>
        <div className="flex justify-between font-body text-xs">
          <span className="text-[#111111]/60">Distance: {order.distance_km} km</span>
          <span className="text-[#111111]/60">Delivery: {order.delivery_fee === 0 ? 'FREE' : `₹${order.delivery_fee}`}</span>
        </div>
        {order.special_instructions && (
          <div className="font-body text-xs text-[#FF5722] italic mt-1">
            Note: {order.special_instructions}
          </div>
        )}
      </div>

      {/* Total + Actions */}
      <div className="p-3">
        <div className="flex justify-between items-center mb-3">
          <span className="font-heading font-bold text-sm uppercase">Total</span>
          <span className="font-heading font-bold text-xl">₹{order.total_amount}</span>
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          {/* Scrap confirmation */}
          {isConfirmingScrap ? (
            <div className="border-2 border-[#FF5722] bg-[#FF5722]/10 p-2 space-y-2">
              <p className="font-body text-xs text-center font-medium">
                Scrap this order? Slot will be freed.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => onConfirmScrap(order.id)}
                  className="flex-1 bg-[#FF5722] text-white border-[3px] border-[#111111] py-1.5 font-heading font-bold text-xs uppercase brutal-press"
                >
                  Yes, Scrap
                </button>
                <button
                  onClick={onCancelScrap}
                  className="flex-1 bg-white text-[#111111] border-[3px] border-[#111111] py-1.5 font-heading font-bold text-xs uppercase brutal-press"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {column.prevStatus && (
                <button
                  onClick={() => onAdvance(order.id, column.prevStatus!)}
                  className="w-full bg-white text-[#111111] border-[3px] border-[#111111] py-2 font-heading font-bold text-xs uppercase tracking-wide brutal-press flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {column.prevLabel}
                </button>
              )}
              {column.nextStatus && (
                <button
                  onClick={() => onAdvance(order.id, column.nextStatus!)}
                  className="w-full bg-[#FF5722] text-white border-[3px] border-[#111111] py-2 font-heading font-bold text-xs uppercase tracking-wide brutal-press flex items-center justify-center gap-1.5"
                >
                  {column.nextLabel}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
              {order.status === 'delivered' && (
                <div className="w-full bg-[#111111]/10 text-[#111111]/50 border-[3px] border-[#111111]/20 py-2 font-heading font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Delivered
                </div>
              )}
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-[#25D366] text-[#111111] border-[3px] border-[#111111] py-2 font-heading font-bold text-xs uppercase tracking-wide brutal-press flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Chat on WhatsApp
              </a>
              {/* Scrap button */}
              <button
                onClick={() => onScrap(order.id)}
                className="w-full bg-transparent text-[#FF5722] border-[3px] border-[#FF5722] py-2 font-heading font-bold text-xs uppercase tracking-wide brutal-press flex items-center justify-center gap-1.5 hover:bg-[#FF5722] hover:text-white transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                Scrap Order
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ORDER HISTORY VIEW
   ============================================================ */

interface OrderHistoryProps {
  orders: OrderRow[];
  deleteConfirmId: string | null;
  onDelete: (orderId: string) => void;
  onSetDeleteConfirm: (id: string | null) => void;
}

function OrderHistory({ orders, deleteConfirmId, onDelete, onSetDeleteConfirm }: OrderHistoryProps) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <History className="w-12 h-12 text-white/20 mb-4" />
        <p className="font-heading font-bold text-lg uppercase text-white/40">No Orders Yet</p>
        <p className="font-body text-sm text-white/30 mt-1">Orders will appear here once customers start placing them.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary row */}
      <div className="flex items-center gap-4 text-sm font-body flex-wrap">
        <span className="text-white/60">
          <span className="font-heading font-bold text-white text-base">{orders.length}</span> total orders
        </span>
        <span className="text-white/60">
          <span className="font-heading font-bold text-white text-base">
            ₹{orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.total_amount, 0)}
          </span> all-time revenue
        </span>
      </div>

      {/* History table */}
      <div className="bg-[#1a1a1a] border-[3px] border-white/20 overflow-x-auto">
        {/* Table header */}
        <div className="hidden md:grid grid-cols-[100px_90px_1fr_120px_90px_120px_100px] gap-2 p-3 border-b-[3px] border-white/20 font-heading font-bold text-xs uppercase text-white/50 min-w-[700px]">
          <span>Date</span>
          <span>Ticket</span>
          <span>Customer</span>
          <span>Items</span>
          <span>Total</span>
          <span>Status</span>
          <span>Actions</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-white/10">
          {orders.map((order) => {
            const items = order.items || [];
            const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
            const statusInfo = STATUS_LABELS[order.status];
            const waText = encodeURIComponent(
              `Hi ${order.customer_name}! Good Boy Grub order #${order.order_number}. Total: ₹${order.total_amount}`
            );
            const waUrl = `https://wa.me/91${order.phone}?text=${waText}`;
            const isConfirmingDelete = deleteConfirmId === order.id;
            const orderDate = new Date(order.created_at);
            const isToday = orderDate.toDateString() === new Date().toDateString();

            return (
              <div
                key={order.id}
                className="grid grid-cols-2 md:grid-cols-[100px_90px_1fr_120px_90px_120px_100px] gap-2 p-3 items-center font-body text-sm hover:bg-white/5 transition-colors min-w-[700px]"
              >
                {/* Date */}
                <div className="text-white/60 text-xs">
                  {isToday ? (
                    <span>Today {orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                  ) : (
                    <span>{orderDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                  )}
                </div>
                {/* Ticket */}
                <div className="font-heading font-bold text-sm text-white">
                  #{order.order_number}
                </div>
                {/* Customer */}
                <div className="min-w-0">
                  <div className="font-medium text-white truncate">{order.customer_name}</div>
                  <div className="text-xs text-white/40">+91 {order.phone}</div>
                  <div className="text-xs text-white/30 truncate hidden md:block">{order.address}, {order.pincode}</div>
                  <div className="mt-1">
                    {order.is_whatsapp_verified ? (
                      <span className="inline-block bg-[#25D366] text-[#111111] px-1.5 py-0.5 font-heading font-bold text-[9px] uppercase border border-[#111111]">Verified</span>
                    ) : (
                      <span className="inline-block bg-[#FF5722] text-white px-1.5 py-0.5 font-heading font-bold text-[9px] uppercase border border-[#111111]">Unverified</span>
                    )}
                  </div>
                </div>
                {/* Items */}
                <div className="text-white/60 text-xs">
                  {itemCount} item{itemCount !== 1 ? 's' : ''}
                  {items.some((i) => i.addCheese) && (
                    <span className="block text-[#FF5722] text-[10px] font-bold">+ Cheese</span>
                  )}
                </div>
                {/* Total */}
                <div className="font-heading font-bold text-base text-white">
                  ₹{order.total_amount}
                </div>
                {/* Status */}
                <div>
                  <span className={`inline-block px-2 py-0.5 font-heading font-bold text-[10px] uppercase border-2 border-[#111111] ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  {isConfirmingDelete ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => onDelete(order.id)}
                        className="w-7 h-7 bg-[#FF5722] text-white border-2 border-[#111111] flex items-center justify-center brutal-press"
                        title="Confirm permanent deletion"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onSetDeleteConfirm(null)}
                        className="w-7 h-7 bg-white text-[#111111] border-2 border-[#111111] flex items-center justify-center brutal-press"
                        title="Cancel"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-7 h-7 bg-[#25D366] text-[#111111] border-2 border-[#111111] flex items-center justify-center brutal-press"
                        title="Chat on WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => onSetDeleteConfirm(order.id)}
                        className="w-7 h-7 bg-transparent text-[#FF5722] border-2 border-[#FF5722] flex items-center justify-center brutal-press hover:bg-[#FF5722] hover:text-white transition-colors"
                        title="Delete order permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
