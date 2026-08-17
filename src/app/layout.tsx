import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from 'next/font/google'
import "./globals.css";
import { Toaster } from '@/components/shared/Toaster'
import { SITE_URL } from '@/lib/site-url'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-dm-sans',
})

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-playfair',
})

const siteTitle = 'ZRecipe | Food Costing Software for Bakeries & Restaurants'
const siteDescription =
  'AI-powered food costing software for bakeries, cafes, restaurants, and food businesses. Import invoices, track ingredient prices, calculate recipe margins, and print kitchen cards.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: siteTitle,
    template: '%s | ZRecipe',
  },
  description: siteDescription,
  keywords: [
    'food costing software',
    'recipe costing software',
    'bakery costing software',
    'restaurant food costing software',
    'invoice import food costing',
    'allergen label software',
    'kitchen card software',
    'bakery recipe costing',
    'food cost calculator',
    'recipe margin calculator',
    'food costing software Ireland',
    'bakery software Ireland',
    'restaurant costing software Ireland',
  ],
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: SITE_URL,
    siteName: 'ZRecipe',
    locale: 'en_IE',
    type: 'website',
    images: [
      {
        url: '/images/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'ZRecipe food costing software dashboard preview',
        type: 'image/jpeg',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: '/images/og-image.jpg',
        alt: 'ZRecipe food costing software dashboard preview',
      },
    ],
  },
  alternates: {
    canonical: SITE_URL,
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/images/favicon2.png',
    shortcut: '/images/favicon2.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${playfairDisplay.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
