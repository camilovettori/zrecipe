import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from '@/components/shared/Toaster'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'ZRecipe',
    template: '%s | ZRecipe',
  },
  description: 'Recipe cost management for food businesses',
  openGraph: {
    title: 'ZRecipe — Recipe Cost Management for Food Business',
    description: 'Cost recipes, track suppliers, and manage invoices with confidence.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ZRecipe — Recipe Cost Management for Food Business',
    description: 'Cost recipes, track suppliers, and manage invoices with confidence.',
  },
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
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
