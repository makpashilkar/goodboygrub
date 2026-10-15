export interface MenuItem {
  id: string;
  name: string;
  shortName: string;
  description: string;
  price: number;
  badge?: string;
  badgeColor?: string;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  addCheese: boolean;
}

export interface OrderRow {
  id: string;
  order_number: string | null;
  created_at: string;
  customer_name: string;
  phone: string;
  address: string;
  pincode: string;
  address_type: string;
  special_instructions: string | null;
  items: CartItem[];
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  distance_km: number;
  status: 'new' | 'preparing' | 'dispatched' | 'delivered' | 'cancelled';
  payment_method: string;
  is_whatsapp_verified: boolean;
}

export interface StoreSettings {
  id: string;
  is_store_open: boolean;
  daily_slot_limit: number;
  slot_adjustment: number;
  sold_out_items: string[];
  updated_at: string;
}

export interface CheckoutForm {
  customerName: string;
  phone: string;
  addressType: 'Home' | 'Work' | 'Other';
  address: string;
  pincode: string;
  specialInstructions: string;
}
