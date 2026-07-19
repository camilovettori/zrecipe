import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { createCustomerPortalSession } from '@/lib/stripe/client'

export async function POST(request: NextRequest) {
  // Verify session
  const supabase = createRequestSupabaseClient(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  // Use admin client so RLS cannot block the tenant lookup
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: member } = await (admin.from('tenant_users') as any)
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ message: 'Tenant not found' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant } = await (admin.from('tenants') as any)
    .select('id, stripe_customer_id')
    .eq('id', member.tenant_id)
    .limit(1)
    .maybeSingle()

  if (!tenant?.stripe_customer_id) {
    return NextResponse.json(
      { message: 'No Stripe customer is linked to this tenant' },
      { status: 400 }
    )
  }

  const origin = request.nextUrl.origin
  const session = await createCustomerPortalSession({
    customerId: tenant.stripe_customer_id,
    returnUrl:  `${origin}/settings/billing`,
  })

  return NextResponse.json({ url: session.url })
}
