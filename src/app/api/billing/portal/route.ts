import { NextRequest, NextResponse } from 'next/server'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { getTenantContext } from '@/lib/tenant'
import { createCustomerPortalSession } from '@/lib/stripe/client'

export async function POST(request: NextRequest) {
  const supabase = createRequestSupabaseClient(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const context = await getTenantContext(supabase, user.id)
  if (!context) {
    return NextResponse.json({ message: 'Tenant not found' }, { status: 404 })
  }

  if (!context.tenant.stripeCustomerId) {
    return NextResponse.json({ message: 'No Stripe customer is linked to this tenant' }, { status: 400 })
  }

  const origin = request.nextUrl.origin
  const session = await createCustomerPortalSession({
    customerId: context.tenant.stripeCustomerId,
    returnUrl: `${origin}/settings?tab=billing`,
  })

  return NextResponse.json({ url: session.url })
}
