# Learning Guide — Good Boy Grub Technical Reference

A deep-dive into the architecture, patterns, and design decisions behind Good Boy Grub. Intended for developers who want to understand how every piece fits together.

## Table of Contents

1. [Next.js App Router Architecture](#1-nextjs-app-router-architecture)
2. [Client vs Server Component Boundaries](#2-client-vs-server-component-boundaries)
3. [State Management Strategy](#3-state-management-strategy)
4. [Supabase Integration & Realtime](#4-supabase-integration--realtime)
5. [Data Access Layer & Dual-Mode Pattern](#5-data-access-layer--dual-mode-pattern)
6. [Brutalist Design System](#6-brutalist-design-system)
7. [Delivery Fee Calculation Logic](#7-delivery-fee-calculation-logic)
8. [Admin Dashboard Architecture](#8-admin-dashboard-architecture)
9. [KDS Kill Switch & 11 AM–10 PM Time-Lock](#9-kds-kill-switch--11-am10-pm-time-lock)
10. [All-Time vs Daily Revenue Aggregation](#10-all-time-vs-daily-revenue-aggregation)
11. [Anti-Fake Order Validation](#11-anti-fake-order-validation)
12. [API Routes](#12-api-routes)
13. [Key Patterns & Gotchas](#13-key-patterns--gotchas)

---

## 1. Next.js App Router Architecture

This project uses Next.js 13 with the **App Router** (`app/` directory), not the legacy Pages Router (`pages/`).

### File-Based Routing

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Customer storefront |
| `/admin` | `app/admin/page.tsx` | Kitchen admin dashboard (KDS) |
| `/api/notify-order` | `app/api/notify-order/route.ts` | Email notification endpoint |

### Layout File (`app/layout.tsx`)

The root layout wraps every page. It handles:
- Font loading via `next/font/google` (Oswald for headings, Space Grotesk for body)
- CSS variable injection for Tailwind to consume
- Global metadata (title, description, viewport)

### Why App Router?

- **Nested layouts** — shared layout shell across pages
- **Server Components by default** — better performance, less client JS
- **Route handlers** — API endpoints live alongside pages
- **Streaming & Suspense** — progressive page loading (future enhancement)

---

## 2. Client vs Server Component Boundaries

Next.js App Router defaults to **Server Components**. Any component using React hooks (`useState`, `useEffect`, `useCallback`, `useRef`) or browser APIs must opt into client-side rendering.

### How This Project Handles It

Every interactive page starts with `'use client'`:

```
'use client';                          // app/page.tsx (storefront)
'use client';                          // app/admin/page.tsx (admin)
```

The storefront and admin are both fully client-side because they:
- Manage cart/UI state with `useState`
- Subscribe to Supabase Realtime with `useEffect`
- Read/write `localStorage` (fallback mode + rate limiting + customer auto-fill)
- Handle button clicks and form submissions

### The API Route Stays Server-Side

`app/api/notify-order/route.ts` runs on the server (Node.js runtime). It can safely use `RESEND_API_KEY` — a server-only environment variable never exposed to the browser.

---

## 3. State Management Strategy

No external state library (Redux, Zustand, Jotai) is used. State is managed with **React built-in hooks** in a deliberate pattern.

### Storefront State (`app/page.tsx`)

| State | Type | Purpose |
|-------|------|---------|
| `cart` | `CartItem[]` | Items in the customer's cart |
| `isCartOpen` | `boolean` | Cart drawer visibility |
| `isCheckoutOpen` | `boolean` | Checkout modal visibility |
| `placedOrder` | `OrderRow \| null` | Last placed order (for success screen) |
| `storeSettings` | `StoreSettings \| null` | Kitchen open/closed, slot limits, sold-out items |
| `orders` | `OrderRow[]` | All orders (for slot calculation) |
| `timeClosed` | `boolean` | Kitchen closed by time-of-day check |

### Admin State (`app/admin/page.tsx`)

| State | Type | Purpose |
|-------|------|---------|
| `isAuthed` | `boolean` | Passcode gate |
| `storeSettings` | `StoreSettings \| null` | Same as storefront + sold-out items |
| `orders` | `OrderRow[]` | All orders for Kanban + history |
| `viewMode` | `'kitchen' \| 'history'` | Toggle between Kanban board and history table |
| `scrapConfirmId` | `string \| null` | Order ID awaiting scrap confirmation |
| `deleteConfirmId` | `string \| null` | Order ID awaiting permanent delete confirmation |
| `soundEnabled` | `boolean` | New-order bell chime toggle |
| `prevOrderCountRef` | `useRef<number>` | Tracks previous "new" order count for sound trigger |

### The `mounted` Ref Pattern

Both pages use a `useRef(true)` to prevent state updates after unmount:

```typescript
const mounted = useRef(true);

useEffect(() => {
  mounted.current = true;
  // ... subscribe to realtime
  return () => {
    mounted.current = false;
    unsubscribe();
  };
}, []);
```

This prevents the "setState on unmounted component" warning when Realtime callbacks fire after navigation away.

---

## 4. Supabase Integration & Realtime

### Client Initialization (`lib/supabase.ts`)

A singleton Supabase client is created lazily:

```typescript
let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl!, supabaseAnonKey!);
  }
  return supabaseInstance;
}
```

- Returns `null` if env vars are missing, triggering the localStorage fallback
- Singleton prevents multiple WebSocket connections to Realtime

### Realtime Subscriptions

The `subscribeToOrders` function listens to changes on both the `orders` and `store_settings` tables:

```typescript
const channel = client
  .channel('orders-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, callback)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'store_settings' }, callback)
  .subscribe();
```

When any change occurs (new order, status update, store toggle, slot adjustment, sold-out toggle, WhatsApp verification), the callback fires, which triggers `loadData()` to refetch all orders and settings. This creates a **real-time sync** between the customer storefront and the admin dashboard.

### LocalStorage Fallback Realtime

When Supabase isn't configured, the same pattern works via custom DOM events:

```typescript
window.addEventListener('gbg-orders-changed', handler);
window.addEventListener('gbg-settings-changed', handler);
```

Data functions dispatch these events after mutations, so the UI updates instantly even without a backend.

---

## 5. Data Access Layer & Dual-Mode Pattern

Every data function in `lib/supabase.ts` follows the same structure:

```typescript
export async function someOperation(): Promise<T> {
  const client = getSupabaseClient();
  if (client) {
    // Supabase path — real database
    await client.from('table')...
    return;
  }
  // localStorage path — fallback for dev/demo
  // ... read/write localStorage
  window.dispatchEvent(new Event('gbg-orders-changed'));
}
```

### Available Functions

| Function | Purpose |
|----------|---------|
| `fetchStoreSettings()` | Get kitchen open/closed state, slot limit, adjustment, sold-out items |
| `fetchOrders()` | Get all orders, newest first |
| `createOrder(data)` | Insert a new order with auto-incrementing ticket number; sets `is_whatsapp_verified: false` |
| `updateOrderStatus(id, status)` | Move order through the pipeline |
| `cancelOrder(id)` | Set status to 'cancelled' (frees slot, keeps record) |
| `deleteOrder(id)` | Permanently remove order from database |
| `updateStoreOpen(isOpen)` | Toggle kitchen open/closed (Kill Switch) |
| `updateSlotAdjustment(delta)` | Add/subtract from available daily slots |
| `resetDailyCount()` | Delete all of today's orders |
| `setOrderWhatsAppVerified(id, verified)` | Toggle the `is_whatsapp_verified` flag on an order |
| `toggleSoldOutItem(itemId)` | Add/remove a menu item ID from the `sold_out_items` array |
| `subscribeToOrders(callback)` | Realtime subscription (Supabase or localStorage events) |
| `getRemainingSlots(orders, limit, adjustment)` | Calculate available slots for today |
| `adminLogin(username, password)` | Validate admin credentials against Supabase `admin_users` via the server |
| `saveCustomerDetails(details)` | Save customer info to localStorage for auto-fill |
| `getSavedCustomerDetails()` | Retrieve saved customer info for checkout pre-fill |
| `isKitchenClosedByTime()` | Returns true if current IST time is outside 11 AM–10 PM |

---

## 6. Brutalist Design System

### Typography

Two fonts loaded via `next/font/google` in `app/layout.tsx`:

| Font | CSS Variable | Tailwind Class | Usage |
|------|-------------|----------------|-------|
| Oswald | `--font-oswald` | `font-heading` | All headings, navbar links, product titles, badges, buttons |
| Space Grotesk | `--font-space-grotesk` | `font-body` | Body paragraphs, input fields, tabular receipt prices |

Global CSS in `app/globals.css` applies Oswald (uppercase, tight tracking) to all `h1`–`h6` elements and Space Grotesk to `body`.

### Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Burnt Orange | `#FF5722` | Primary accent, CTAs, active states, footer heading |
| Near Black | `#111111` | Borders, dark backgrounds, text on light, footer bg |
| Charcoal | `#121212` | Admin page background |
| Off White | `#F9F8F6` | Storefront background |
| WhatsApp Green | `#25D366` | WhatsApp chat buttons, verified badge |
| Card Dark | `#1a1a1a` | Admin Kanban column backgrounds |
| Gray 300 | `gray-300` | Disabled button background (kitchen closed state) |

### Custom Tailwind Utilities

Defined in `tailwind.config.ts` and `app/globals.css`:

- **`brutal-shadow`** — Hard offset shadow (`4px 4px 0px #111111`) with no blur
- **`brutal-shadow-orange`** — Large orange offset shadow (`8px 8px 0px 0px #FF5722`)
- **`brutal-press`** — Active state that shifts element down-right by 2px, simulating physical press
- **`border-[3px]`** — Thick, visible borders on every card and button (brutalist hallmark)
- **Dashed dividers** — `border-dashed border-[#111111]` for receipt-style section breaks
- **`receipt-divider`** — `border-top: 2px dashed #111111` utility class
- **`no-spinner`** — Removes number input spinners for phone/pincode fields
- **`scrollbar-hide`** — Hides scrollbars in the cart drawer

### Design Principles

1. **No rounded corners** — Everything is sharp and rectangular (`borderRadius: 0px` globally)
2. **Thick black borders** — 3px borders on every interactive element
3. **Hard shadows** — Solid black offset shadows, no softness
4. **Rotated stickers** — `-2deg` / `-3deg` rotation on badges for handmade feel
5. **High contrast** — White cards on dark backgrounds, orange accents for energy
6. **Monospace receipt aesthetic** — Dashed borders, tabular data layout in cart and order cards

### Restored UI Elements

- **Navbar**: Center links (HOME, MENU, CONTACT) in Oswald uppercase; brutalist white cart button with `shadow-[4px_4px_0px_#111111]`, shopping bag icon, hover-to-orange, active press animation, and dynamic item count badge
- **Footer**: Full dark footer (`bg-[#111111] text-[#F9F8F6] border-t-[6px] border-[#FF5722]`) with 3-column grid: brand bio with orange "GOOD BOY GRUB" heading, HQ/Kitchen contact list with orange Lucide icons (MapPin, MessageCircle, Mail, Clock), Info column with Terms/Privacy links and bordered social buttons (Instagram, WhatsApp). Bottom bar with copyright and bordered KITCHEN PORTAL button linking to `/admin`.

---

## 7. Delivery Fee Calculation Logic

Defined in `lib/delivery.ts`:

### Pincode-to-Distance Mapping

Each serviceable pincode in Thane is mapped to a distance from the kitchen hub (pincode 400601):

```typescript
const THANE_PINCODE_DISTANCES: PincodeDistance = {
  '400601': 0,    // Kitchen hub itself
  '400602': 2.5,
  '400603': 3.8,
  '400605': 4.2,
  // ...
};
```

### Fee Structure

```typescript
export function calculateDeliveryFee(distanceKm: number): number {
  if (distanceKm <= 4) return 0;           // FREE within 4 km
  return Math.round(40 + (distanceKm - 4) * 12);  // ₹40 base + ₹12/km beyond 4 km
}
```

| Distance | Delivery Fee |
|----------|-------------|
| 0–4 km | FREE |
| 4–8 km | ₹40–₹84 |
| 8–12 km | ₹88–₹132 |
| 12+ km | Calculated but generally not serviceable |

If a pincode isn't in the mapping, a fallback distance is estimated based on the pincode prefix.

---

## 8. Admin Dashboard Architecture

### Admin Login (Supabase `admin_users`)

The `/admin` login takes a **username/email + password**. The page is not linked from the storefront; it is reachable only by URL.

**Schema** (`supabase/migrations/20261021000000_create_admin_users.sql`):

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `username` | TEXT UNIQUE | username or email |
| `password_hash` | TEXT | bcrypt via `pgcrypto` `crypt(pw, gen_salt('bf'))` |
| `created_at` | TIMESTAMPTZ | default `now()` |

**Flow:** `adminLogin(username, password)` stores the credentials in `sessionStorage` and calls `/api/admin/orders`. Every admin API request sends `x-admin-username` / `x-admin-password` headers; the server's `requireAdmin()` (`lib/server/admin-client.ts`) calls the `verify_admin_login()` SQL function with the service-role client. A wrong pair returns 401 (UI shows "Incorrect username or password"); a database/setup error returns 500 with a separate message.

**Security notes:** the table has RLS enabled with no policies and revoked anon/authenticated grants, so the hash is never readable from the browser. The old `ADMIN_PASSCODE` env var is obsolete. For production, consider Supabase Auth or a session cookie instead of re-sending the password on each request.

### Rate Limiting Removed (Friction Reduction)

The old 5-minute localStorage cooldown (`canPlaceOrder()`, `recordOrderPlaced()`, `getOrderCooldownMs()` and the "WAIT X M XX S..." button state) was deleted from `lib/supabase.ts` and `components/storefront/checkout-modal.tsx`. Customers can now place orders back to back. Remaining protection against duplicates/abuse: the per-attempt `idempotencyKey` (double-clicks resolve to one order), strict phone validation, server-side re-pricing, and the admin's manual WhatsApp check before cooking.

### Admin-Initiated WhatsApp Workflow

The flow is flipped: the customer no longer sends a WhatsApp message. The order success ticket shows "Order Received! We will reach out to you on WhatsApp in a few minutes to confirm your order and payment details." and the green "Confirm on WhatsApp" button (and its pre-filled `wa.me` link) is gone. Orders still insert with `is_whatsapp_verified: false`, so the KDS shows UNVERIFIED. The admin messages the customer using the card's WhatsApp link, then toggles the badge to VERIFIED via `setOrderWhatsAppVerified()`.

### Storefront Banner

The "Only X of 10 Daily Slots Remaining" text was replaced with "Limited Stock Only — Order Before We Sell Out" so no slot number is displayed. The slot counter and +/- adjustment remain as an internal KDS tool.

### Metrics Bar (5 Cards)

The top of the KDS shows 5 metric cards in a responsive grid:

1. **Kitchen Switch** — Toggle `is_store_open` (Kill Switch)
2. **Daily Slots** — Shows today's order count vs. effective limit, with +/- adjustment buttons and reset
3. **Active Orders** — Count of orders in the pipeline (new + preparing + dispatched)
4. **Today's Revenue** — Sum of `total_amount` for non-cancelled orders created today
5. **All-Time Revenue** — Sum of `total_amount` for all non-cancelled orders ever

### Sound Notification

A toggleable bell chime plays when a new order arrives:

```typescript
if (
  soundEnabled &&
  prevOrderCountRef.current > 0 &&
  newCount > prevOrderCountRef.current
) {
  playBell();
}
prevOrderCountRef.current = newCount;
```

The `prevOrderCountRef` ensures the sound only fires on an actual increase in new orders, not on page load or status changes. The sound uses a minimal base64-encoded WAV audio file played via the Web Audio API.

### Sold-Out Toggle Bar

Below the metrics, a stock control bar lets the admin toggle each menu item between IN STOCK and SOLD OUT. This updates `sold_out_items` in `store_settings`, which syncs to the storefront via Realtime. Sold-out items show a grayscale image with a "Sold Out" overlay and disabled Add button.

### Kanban Board

Orders flow through 4 statuses:

```
New → Preparing → Dispatched → Delivered
```

Each column shows orders filtered by status. Order cards have:
- **WhatsApp verification badge** — Toggleable UNVERIFIED (orange) / VERIFIED (green) badge at the top of each card
- **Forward button** — Advance to next status
- **Back button** — Return to previous status
- **WhatsApp link** — Pre-filled message for customer confirmation
- **Scrap button** — Cancel order with confirmation (sets status to 'cancelled', frees the daily slot)

### Order History View

A separate tab shows all orders in a compact table layout with date, ticket number, customer info, WhatsApp verification status, item count, total, status badge, and action buttons (WhatsApp chat + permanent delete with confirmation).

### Slot Adjustment

The admin can manually adjust available daily slots using + and - buttons:
- **+ button** — Increases `slot_adjustment` by 1 (frees up a slot)
- **- button** — Decreases `slot_adjustment` by 1 (reduces available slots)
- The effective limit = `daily_slot_limit + slot_adjustment`
- Adjustments flow through to the storefront scarcity banner in real time

---

## 9. KDS Kill Switch & 11 AM–10 PM Time-Lock

The kitchen open/closed state is determined by two independent conditions that combine with AND logic:

```typescript
const isStoreOpen = storeSettings?.is_store_open ?? true;  // KDS Kill Switch
const isKitchenOpen = isStoreOpen && !timeClosed;           // Combined state
```

### Kill Switch (`is_store_open`)

The admin toggles this via the KDS "Kitchen" card. It updates `store_settings.is_store_open` in the database, which triggers a Realtime event that the storefront picks up instantly.

### Time-Lock (11 AM–10 PM IST)

```typescript
export function isKitchenClosedByTime(): boolean {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
  const hour = istTime.getHours();
  return hour < 11 || hour >= 22;
}
```

The storefront checks this every 60 seconds via `setInterval`, so the kitchen auto-locks at 10 PM and auto-unlocks at 11 AM without requiring a page refresh or admin action.

### Storefront Disabling

When `isKitchenOpen` is false (either cause), the storefront:

1. **Disables all "Add to Cart" buttons** with grayed-out brutalist styling:
   ```
   bg-gray-300 text-gray-600 cursor-not-allowed shadow-none
   ```
2. **Shows a bold orange notice** beneath each disabled button:
   ```
   "Kitchen opens at 11 AM (Timings: 11 AM – 10 PM)"
   ```
3. **Updates the scarcity banner** to show "Kitchen Closed — Opens at 11:00 AM (Timings: 11 AM – 10 PM)"
4. **Disables the cart checkout button** with the same timing subtext

### Sold-Out Items as a Third Disable Condition

In addition to the Kill Switch and time-lock, individual menu items can be marked as sold out from the KDS. This adds a third disable condition:

```typescript
const isSoldOut = soldOutItems.includes(item.id);
const isDisabled = !isKitchenOpen || slotsExhausted || isSoldOut;
```

Sold-out items show a grayscale image with a "Sold Out" overlay stamp, and a different subtext message: "This item is currently sold out."

### Realtime Sync Flow

```
Admin toggles Kill Switch → store_settings update → Realtime event
    → Storefront's subscribeToOrders callback fires → loadInitialData()
    → storeSettings updated → isKitchenOpen recalculated → buttons disabled/enabled
```

The entire flow takes milliseconds. No page refresh needed.

---

## 10. All-Time vs Daily Revenue Aggregation

Both revenue figures are calculated client-side from the fetched `orders` array:

```typescript
// Today's Revenue: non-cancelled orders created today
const todayRevenue = todayOrders.reduce((sum, o) => sum + o.total_amount, 0);

// All-Time Revenue: all non-cancelled orders ever
const allTimeRevenue = orders
  .filter((o) => o.status !== 'cancelled')
  .reduce((sum, o) => sum + o.total_amount, 0);
```

### Key Distinction

| Metric | Filter | Purpose |
|--------|--------|---------|
| Today's Revenue | `created_at` is today AND `status !== 'cancelled'` | Daily performance tracking |
| All-Time Revenue | `status !== 'cancelled'` (no date filter) | Cumulative business revenue |

Cancelled orders are excluded from both calculations because they represent orders that were scrapped (customer didn't confirm on WhatsApp, fake order, etc.) and should not count toward revenue.

Both figures update in real time as orders flow in or get cancelled, since the admin page re-fetches all orders on every Realtime event.

The Order History view also shows an inline all-time revenue summary for reference.

---

## 11. Anti-Fake Order Validation

The app stays 100% guest-based (no login/signup wall) but implements three layers of anti-fake order protection:

### Layer 1: Strict Indian Phone Validation

```typescript
const BLOCKED_PHONES = [
  '9999999999', '8888888888', '7777777777', '6666666666',
  '5555555555', '0000000000', '1111111111',
  '1234567890', '9876543210',
];

function isValidIndianPhone(phone: string): boolean {
  if (!/^[6-9]\d{9}$/.test(phone)) return false;       // Must start with 6-9, 10 digits
  if (BLOCKED_PHONES.includes(phone)) return false;     // Reject known dummy sequences
  const first = phone[0];
  if (phone.split('').every((d) => d === first)) return false; // Reject all-same-digit
  return true;
}
```

This rejects:
- Numbers not starting with 6, 7, 8, or 9 (invalid Indian mobile prefix)
- Numbers shorter or longer than 10 digits
- Known dummy sequences (1234567890, 9876543210, etc.)
- All-same-digit numbers (9999999999, 7777777777, etc.)

A clear validation error message is shown: "Enter a valid 10-digit Indian mobile number (starts with 6-9)"

### Layer 2: Order Rate Limiting (5-Minute Cooldown)

```typescript
export function canPlaceOrder(): { allowed: boolean; remainingMs: number } {
  const last = parseInt(localStorage.getItem('gbg_last_order_time') || '0', 10);
  if (!last) return { allowed: true, remainingMs: 0 };
  const elapsed = Date.now() - last;
  const cooldown = 5 * 60 * 1000; // 5 minutes
  if (elapsed < cooldown) {
    return { allowed: false, remainingMs: cooldown - elapsed };
  }
  return { allowed: true, remainingMs: 0 };
}
```

- Stores the timestamp of the last order in `localStorage`
- Blocks new orders for 5 minutes from the same device/browser
- The checkout modal shows a live countdown timer (`cooldownRemaining` state updated every second)
- The "Place Order" button is disabled and shows "Wait Xm Xs..." during cooldown

### Returning Customer Auto-Fill

When a customer successfully places an order, their details are saved to `localStorage`:

```typescript
saveCustomerDetails({
  customerName: form.customerName,
  phone: form.phone,
  address: form.address,
  pincode: form.pincode,
  addressType: form.addressType,
});
```

On the next checkout, the form is pre-filled:

```typescript
const saved = getSavedCustomerDetails();
if (saved) {
  setForm((prev) => ({
    ...prev,
    customerName: saved.customerName,
    phone: saved.phone,
    // ...
  }));
}
```

This reduces friction for legitimate returning customers while the rate limiter prevents spam.

### Layer 3: WhatsApp Verification Handshake

This is the most powerful anti-fake measure — it requires the customer to message the kitchen from their real WhatsApp number:

1. **Order is placed** with `is_whatsapp_verified: false`
2. **Order Success modal** prominently displays:
   - A verification warning: "Your order is placed but not yet verified"
   - A primary green button: "CONFIRM ORDER ON WHATSAPP (REQUIRED)"
   - The button opens a pre-filled `wa.me` link with order number, items, address, and total
3. **KDS verification badge** — Each order card in the Kanban shows a toggleable badge:
   - **UNVERIFIED** (orange) — Customer hasn't confirmed yet; kitchen should not cook
   - **VERIFIED** (green) — Customer has confirmed via WhatsApp; safe to cook
4. The kitchen staff manually toggles the badge after receiving the WhatsApp message and GPay screenshot

```typescript
export async function setOrderWhatsAppVerified(
  orderId: string,
  verified: boolean
): Promise<void> {
  // Updates is_whatsapp_verified column in orders table
}
```

This three-layer approach prevents fake orders without requiring any customer login:
- Phone validation catches obviously fake numbers
- Rate limiting prevents volume spam
- WhatsApp handshake ensures the customer has a real, reachable WhatsApp number — and gives the kitchen a chance to verify payment before cooking

---

## 12. API Routes

### `/api/notify-order` (`app/api/notify-order/route.ts`)

Called after a successful order placement to send an email notification to the kitchen.

- **Method:** POST
- **Body:** Order details (customer name, phone, items, total, address)
- **Email provider:** Resend API (if `RESEND_API_KEY` is set), otherwise logs to console
- **Runtime:** Node.js (not Edge) — uses `resend` npm package

This route is server-side only and has access to environment variables that are never exposed to the browser. The call is fire-and-forget (`fetch(...).catch(() => {})`) so it never blocks the order flow.

---

## 13. Key Patterns & Gotchas

### The `maybeSingle()` vs `single()` Distinction

- `maybeSingle()` — Returns `data: null` if no row found (no error). Used for `store_settings` lookup which may not exist yet.
- `single()` — Throws an error if no row found. Used after `.insert().select()` when we know a row was just created.

### Order Number Generation

Order numbers (`GBG-0001`, `GBG-0002`, ...) are generated client-side by querying the latest order and incrementing. This has a potential race condition if two orders are placed simultaneously. For production, move this to a database sequence or a Supabase Edge Function.

### IST Time Check

The kitchen hours check (11 AM – 10 PM IST) is done client-side by converting the browser's local time to IST. The storefront checks this every 60 seconds via `setInterval` to auto-close the kitchen at 10 PM without a page refresh.

### Cancelled Orders Don't Count Toward Slots

The `getRemainingSlots` function filters out cancelled orders:

```typescript
const todayOrders = orders.filter(
  (o) => new Date(o.created_at).toDateString() === today && o.status !== 'cancelled'
);
```

This means scrapping an order instantly frees up its slot for new customers.

### `sold_out_items` Array in store_settings

The sold-out items are stored as a JSONB array of menu item IDs in `store_settings`. The `toggleSoldOutItem` function reads the current array, adds or removes the item ID, and writes it back. The storefront reads this array and disables the corresponding menu cards.

### Storefront and Admin Share the Same Realtime Channel

Both pages subscribe to the same Supabase Realtime channel. When the admin scraps an order, adjusts slots, toggles sold-out items, or changes WhatsApp verification, the storefront updates within milliseconds — no page refresh needed.

### Settings Normalization

When fetching store settings, the `normalizeSettings` function ensures backward compatibility:

```typescript
function normalizeSettings(data: Record<string, unknown>): StoreSettings {
  const settings = data as unknown as StoreSettings;
  if (settings.slot_adjustment === undefined || settings.slot_adjustment === null) {
    settings.slot_adjustment = 0;
  }
  if (!settings.sold_out_items) {
    settings.sold_out_items = [];
  }
  return settings;
}
```

This handles cases where older database rows don't have the newer columns yet.

### Shadcn/UI Components

The `components/ui/` directory contains pre-generated shadcn/ui components (button, dialog, input, etc.) built on Radix UI primitives. The storefront and admin use custom brutalist styling rather than the default shadcn look, but the underlying primitives are available for future components.
