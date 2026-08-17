import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site-url'

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
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
