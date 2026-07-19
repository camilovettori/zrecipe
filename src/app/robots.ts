import type { MetadataRoute } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://zrecipe.ie'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/login', '/register'],
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
        '/api',
        '/adminziffera',
        '/workspace',
        '/suspended',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
