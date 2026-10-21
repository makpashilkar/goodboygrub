import type { MenuItem } from './types';

export const MENU_ITEMS: MenuItem[] = [
  {
    id: 'smoky-bbq-pull',
    name: 'The Smoky BBQ Pull',
    shortName: 'Smoky BBQ',
    description:
      'Slow-cooked shredded chicken tossed in rich, smoky BBQ sauce. Pulled by hand, piled high on a fresh sub roll.',
    price: 299,
    badge: 'BESTSELLER',
    badgeColor: 'bg-[#FF5722] text-white',
  },
  {
    id: 'peri-peri-firecracker',
    name: 'The Peri-Peri Firecracker',
    shortName: 'Peri-Peri',
    description:
      'Tender shredded chicken with a citrusy peri-peri kick and sliced jalapeños. For those who like it hot.',
    price: 299,
    badge: 'SPICY',
    badgeColor: 'bg-[#111111] text-[#FF5722]',
  },
  {
    id: 'creamy-garlic-herb',
    name: 'The Creamy Garlic & Herb',
    shortName: 'Garlic & Herb',
    description:
      'Shredded chicken in roasted garlic & herb mayo with cracked black pepper. Smooth, rich, and deeply savoury.',
    price: 299,
    badge: 'CREAMY',
    badgeColor: 'bg-[#111111] text-white',
  },
];

export const CHEESE_ADDON_PRICE = 30;
export const DAILY_SLOT_LIMIT = 10;
export const STORE_OPEN_HOUR = 11;
export const STORE_CLOSE_HOUR = 23;
export const WHATSAPP_NUMBER = '918779858628';
export const KITCHEN_HUB_PINCODE = '400601';
