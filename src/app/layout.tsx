import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from 'next/font/google'
import "./globals.css";
import { Toaster } from '@/components/shared/Toaster'

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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zrecipe.ie'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ZRecipe — Recipe Costing for Food Businesses',
    template: '%s | ZRecipe',
  },
  description:
    'Recipe costing software for bakeries, cafés, and restaurants. AI invoice import, real margins, EU allergen labels.',
  keywords: [
    'recipe costing',
    'food cost software',
    'recipe cost calculator',
    'allergen labelling software',
    'EU allergen compliance',
    'invoice import AI',
    'kitchen management software',
    'restaurant costing',
    'bakery costing software',
  ],
  openGraph: {
    title: 'ZRecipe — Recipe Costing for Food Businesses',
    description:
      'Recipe costing software for bakeries, cafés, and restaurants. AI invoice import, real margins, EU allergen labels.',
    url: siteUrl,
    siteName: 'ZRecipe',
    locale: 'en_IE',
    type: 'website',
    images: [
      {
        url: '/images/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'ZRecipe — Recipe Costing for Independent Food Businesses',
        type: 'image/jpeg',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ZRecipe — Recipe Costing for Food Businesses',
    description:
      'Recipe costing software for bakeries, cafés, and restaurants. AI invoice import, real margins, EU allergen labels.',
    images: ['/images/og-image.jpg'],
  },
  alternates: {
    canonical: '/',
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
