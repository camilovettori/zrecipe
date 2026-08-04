import type { MetadataRoute } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.zrecipe.ie'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard',
        '/recipes',
        '/ingredients',
        '/invoices',
        '/labels',
        '/suppliers',
        '/reports',
        '/ai-ideas',
        '/settings',
        '/support',
        '/api',
        '/adminziffera',
        '/login',
        '/register',
        '/signup',
        '/forgot-password',
        '/reset-password',
        '/auth',
        '/workspace',
        '/suspended',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
