import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from '@/components/shared/Toaster'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zrecipe.ie'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ZRecipe — Recipe Costing for Independent Food Businesses',
    template: '%s | ZRecipe',
  },
  description:
    'ZRecipe turns supplier invoices into accurate recipe costs, real margins, and EU-compliant allergen labels — built for bakeries, cafés, and restaurants across Ireland and the EU.',
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
    title: 'ZRecipe — Recipe Costing for Independent Food Businesses',
    description:
      'Turn supplier invoices into accurate recipe costs, real margins, and EU-compliant allergen labels.',
    url: siteUrl,
    siteName: 'ZRecipe',
    locale: 'en_IE',
    type: 'website',
    images: [
      {
        url: '/images/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ZRecipe — Recipe Costing for Independent Food Businesses',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ZRecipe — Recipe Costing for Independent Food Businesses',
    description:
      'Turn supplier invoices into accurate recipe costs, real margins, and EU-compliant allergen labels.',
    images: ['/images/og-image.png'],
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
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
