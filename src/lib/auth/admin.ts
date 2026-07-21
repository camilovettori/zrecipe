import 'server-only'

import { createClient } from '@/lib/supabase/server'

export const SUPER_ADMIN_EMAIL = 'camilovettori@gmail.com'

/** Throws if the current request isn't from the super admin. For use in
 *  server actions and route handlers — pages should keep their existing
 *  redirect('/') pattern instead, since a thrown error isn't a redirect. */
export async function requireSuperAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    throw new Error('Unauthorized')
  }
  return user
}
