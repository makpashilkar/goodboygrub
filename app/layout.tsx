import './globals.css';
import type { Metadata } from 'next';
import { Oswald, Space_Grotesk } from 'next/font/google';

const oswald = Oswald({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-oswald',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Good Boy Grub — Artisanal Shredded Chicken Submarines | Thane',
  description:
    'Small-batch, air-fried shredded chicken submarines served fresh daily from our Thane hub. Order online for fast local delivery.',
  openGraph: {
    title: 'Good Boy Grub — Artisanal Shredded Chicken Submarines',
    description: 'Small-batch air-fried shredded chicken submarines from Thane, Maharashtra.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${oswald.variable} ${spaceGrotesk.variable}`}>
      <body className="font-body bg-[#F9F8F6] text-[#111111]">{children}</body>
    </html>
  );
}
