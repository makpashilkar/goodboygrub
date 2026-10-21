# Good Boy Grub

**Artisanal Shredded Chicken Submarines — Thane, Maharashtra**

A production-ready, full-stack Next.js web application for a small-batch shredded chicken submarine sandwich shop. Built with the "Modern Deli Brutalism" design system.

## Brand Overview

Good Boy Grub serves three shredded chicken submarine sandwiches at ₹299 each, made in limited daily batches of 10. Orders are placed online with guest checkout (no account required), payment is confirmed via WhatsApp with GPay/UPI screenshots, and delivery is free within 4 km of the Thane kitchen hub.

## Features

### Customer Storefront (`/`)
- **Modern Deli Brutalism UI** — Oswald headings (uppercase, tight tracking), Space Grotesk body text, 3px black borders, hard offset shadows, rotated stickers
- **Restored navbar** with center links (HOME, MENU, CONTACT) and brutalist white cart button with shopping bag icon and dynamic item count badge
- **Dark brutalist footer** — 3-column layout with brand bio, HQ/Kitchen contact info (orange Lucide icons), and Info links with social buttons
- Urgency banner: "LIMITED STOCK ONLY — ORDER BEFORE WE SELL OUT" (no hardcoded 10-slot count shown to customers; admins can still adjust/exhaust slots from the KDS)
- 3-item menu catalog with photos, badges, and ₹299 pricing
- "How It Works" 3-step process section
- Cart slide-out drawer with receipt styling and extra cheese toggle (+₹30)
- Guest checkout modal with dynamic delivery fee calculation
- Order success screen with ticket number and an "Order Received" notice (the admin follows up on WhatsApp)
- **KDS Kill Switch + 11 AM–10 PM auto-lock** — When the kitchen is closed (via admin toggle OR outside operating hours), all "Add to Cart" buttons are disabled with grayed-out styling and a bold orange notice: "Kitchen opens at 11 AM (Timings: 11 AM – 10 PM)"

### Kitchen Admin / KDS (`/admin`)
- Username + password login backed by the Supabase `admin_users` table (no public link on the storefront; reach it directly at `/admin`)
- **Master kitchen Kill Switch** — Toggle store open/closed; syncs to storefront in real time
- **Daily slots counter** with manual +/- adjustment and reset
- **5-metric dashboard bar**: Kitchen Switch, Daily Slots, Active Orders, Today's Revenue, **All-Time Revenue**
- **All-Time Sales Revenue** — Dynamically sums `total_amount` across all non-cancelled orders
- **Today's Revenue** — Sums non-cancelled orders created today
- **Sound notification** — Toggleable audio bell chime when a new order arrives
- **Per-item Sold Out toggle** — Mark individual menu items as sold out from the KDS; storefront updates instantly with grayscale image and "Sold Out" overlay
- **Kanban board** (New → Preparing → Dispatched → Delivered) with WhatsApp chat links and scrap functionality
- **WhatsApp verification badge** — Each order card shows a toggleable UNVERIFIED / VERIFIED badge; new orders start UNVERIFIED until the admin has reached out to the customer on WhatsApp and confirmed
- **Order history view** with permanent delete for test/fake orders

### Anti-Spam Guest Checkout (No Login Required)
- **Strict Indian phone validation** — Regex `^[6-9]\d{9}$` plus rejection of repetitive dummy sequences (9999999999, 9876543210, etc.)
- **No order cooldown** — customers can place multiple orders back to back with no wait time
- **Returning customer auto-fill** — Name, Phone, Address, and Pincode are saved and pre-filled on subsequent visits
- **Admin-initiated WhatsApp confirmation** — Orders are saved with `is_whatsapp_verified: false` and the success screen simply says "Order Received! We will reach out to you on WhatsApp in a few minutes to confirm your order and payment details." The customer does not message us; the admin contacts them and then marks the order VERIFIED in the KDS

### Realtime
All changes (new orders, status updates, store open/close, slot adjustments, sold-out toggles, WhatsApp verification) sync instantly across the storefront and admin panel via Supabase Realtime subscriptions. The localStorage fallback uses custom DOM events for the same effect.

## Architecture

```
good-boy-grub/
├── app/
│   ├── layout.tsx              # Global styles, fonts (Oswald + Space Grotesk), metadata
│   ├── page.tsx                # Customer storefront (hero, menu, cart, checkout, footer)
│   ├── admin/
│   │   └── page.tsx            # Kitchen admin dashboard (KDS) with Kanban + history
│   └── api/
│       └── notify-order/
│           └── route.ts        # Serverless email notification (Resend or console fallback)
├── components/
│   └── storefront/
│       ├── cart-drawer.tsx     # Slide-out receipt-style cart with cheese toggle
│       ├── checkout-modal.tsx  # Guest checkout with phone validation, rate limit, auto-fill
│       └── order-success.tsx   # Order confirmation + WhatsApp verification handshake
├── lib/
│   ├── types.ts                # TypeScript interfaces (OrderRow, StoreSettings, etc.)
│   ├── menu.ts                 # Menu items, constants (prices, passcode, WhatsApp number)
│   ├── delivery.ts             # Pincode-to-distance mapping + delivery fee calculation
│   └── supabase.ts             # Supabase client + localStorage fallback + data layer
├── supabase/
│   ├── schema.sql              # Complete copy-paste-ready SQL schema
│   └── migrations/             # Applied migration files
└── README.md / learning.md     # Documentation
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 13 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS + custom brutalist utilities |
| Fonts | Oswald (headings) + Space Grotesk (body) via next/font |
| Icons | Lucide React |
| Database | Supabase PostgreSQL with Realtime |
| Email | Resend API (with console fallback) |
| Deployment | Vercel / Netlify |

## Local Setup

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Type check
npm run typecheck
```

## Environment Variables

The Supabase credentials are pre-populated automatically. If you want to enable email notifications, add the Resend API key:

```env
# Supabase (pre-populated — do not change)
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Resend (optional — for order email notifications)
RESEND_API_KEY=your-resend-api-key
```

If `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are not set, the app automatically falls back to `localStorage` with mock orders for local development.

## Supabase Database Setup

### Option A: Automatic (Already Configured)
The Supabase project is pre-provisioned and credentials are pre-populated in `.env`. The migration files in `supabase/migrations/` have already been applied. No action needed.

### Option B: Manual Setup (New Project)
1. Go to your Supabase project dashboard
2. Navigate to the **SQL Editor**
3. Copy the entire contents of `supabase/schema.sql`
4. Paste it into the SQL Editor and click **Run**
5. This will create the `orders` and `store_settings` tables, enable RLS with public CRUD policies, enable Realtime publication, and create indexes

### Database Schema

**`orders` table:**
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `order_number` | TEXT (unique) | Format: GBG-0001 |
| `created_at` | TIMESTAMPTZ | Order timestamp |
| `customer_name` | TEXT | Customer's full name |
| `phone` | TEXT | 10-digit Indian mobile |
| `address` | TEXT | Full street address |
| `pincode` | TEXT | 6-digit Thane pincode |
| `address_type` | TEXT | Home / Work / Other |
| `special_instructions` | TEXT | Nullable cooking/delivery notes |
| `items` | JSONB | Array of cart items with cheese choices |
| `subtotal` | NUMERIC(10,2) | Item subtotal |
| `delivery_fee` | NUMERIC(10,2) | Calculated by distance |
| `total_amount` | NUMERIC(10,2) | subtotal + delivery_fee |
| `distance_km` | NUMERIC(5,2) | Distance from kitchen hub |
| `status` | TEXT | new / preparing / dispatched / delivered / cancelled |
| `payment_method` | TEXT | Default: gpay_whatsapp |
| `is_whatsapp_verified` | BOOLEAN | false on creation; admin toggles to true after reaching out on WhatsApp |

**`store_settings` table:**
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | Always 'primary' |
| `is_store_open` | BOOLEAN | Kill switch state |
| `daily_slot_limit` | INT | Default 10 |
| `slot_adjustment` | INT | Manual +/- offset for available slots |
| `sold_out_items` | JSONB | Array of menu item IDs marked as sold out |
| `updated_at` | TIMESTAMPTZ | Last modification timestamp |

**`admin_users` table:**
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `username` | TEXT (unique) | Username or email used on the `/admin` login |
| `password_hash` | TEXT | bcrypt hash (`crypt(password, gen_salt('bf'))`) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

### Row Level Security
Orders and settings are accessed through server API routes using the service-role key. The `admin_users` table has RLS enabled with **no** policies, so it is unreadable from the browser; credentials are checked server-side through the `verify_admin_login()` SQL function (bcrypt via `pgcrypto`, executable only by `service_role`).

## Deployment

### Vercel (Recommended)
1. Push your code to a Git repository
2. Import the project at [vercel.com/new](https://vercel.com/new)
3. Framework preset: Next.js
4. Region: Mumbai (bom1) for lowest latency to Thane customers
5. Add `RESEND_API_KEY` to environment variables (optional)
6. Deploy

### Netlify
1. Connect your Git repository at [netlify.com](https://netlify.com)
2. Build command: `npx next build`
3. Publish directory: `.next`
4. The `netlify.toml` file is pre-configured with the Next.js plugin

## Configuration

### Admin Login
Admin credentials live in the Supabase `admin_users` table (see `supabase/migrations/20261021000000_create_admin_users.sql`). Edit the seeded username/password in that SQL **before** running it. The old `ADMIN_PASSCODE` env var is no longer used.

### WhatsApp Number
The WhatsApp number for order confirmation is configured in `lib/menu.ts` as `WHATSAPP_NUMBER = '919876543210'`. Update this to the actual shop number.

### Kitchen Hours
Operating hours are 11:00 AM to 10:00 PM IST, enforced client-side via `isKitchenClosedByTime()` in `lib/supabase.ts`. The storefront checks every 60 seconds and auto-locks the kitchen outside these hours.
