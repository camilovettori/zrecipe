import { createServerClient } from '@supabase/ssr'
import { type NextRequest } from 'next/server'

export function createRequestSupabaseClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {
          // API routes only need to read the session.
        },
      },
    }
  )
}
