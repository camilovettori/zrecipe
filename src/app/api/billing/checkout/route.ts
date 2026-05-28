import { NextRequest, NextResponse } from 'next/server'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { getTenantContext } from '@/lib/tenant'
import { createCheckoutSession } from '@/lib/stripe/client'

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

  const origin = request.nextUrl.origin
  const session = await createCheckoutSession({
    tenantId: context.tenantId,
    customerEmail: user.email,
    customerId: context.tenant.stripeCustomerId,
    successUrl: `${origin}/settings?tab=billing&notice=checkout_success`,
    cancelUrl: `${origin}/settings?tab=billing&notice=checkout_canceled`,
  })

  return NextResponse.json({ url: session.url })
}
