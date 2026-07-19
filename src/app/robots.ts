import type { MetadataRoute } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

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
