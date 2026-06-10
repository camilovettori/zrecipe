import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import TenantsClient, { TenantRow } from './TenantsClient'

const SUPER_ADMIN_EMAIL = 'camilovettori@gmail.com'

export default async function AdminTenants() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== SUPER_ADMIN_EMAIL) redirect('/')

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = adminClient as any

  const { data: rawTenants }  = await admin.from('tenants').select('*').order('name')
  const { data: recipes }     = await admin.from('recipes').select('tenant_id')
  const { data: ingredients } = await admin.from('ingredients').select('tenant_id')
  const { data: tenantUsers } = await admin.from('tenant_users').select('tenant_id, user_id, role')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let authUsers: any[] = []
  try {
    const { data: userData } = await adminClient.auth.admin.listUsers()
    authUsers = userData?.users ?? []
  } catch { /* auth admin may be unavailable */ }

  // AI usage counts per tenant (last 30 days) — table may not exist yet
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aiUsageRows: { tenant_id: string }[] = []
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const { data: aiData } = await admin.from('ai_usage_logs')
      .select('tenant_id')
      .gte('created_at', thirtyDaysAgo)
    aiUsageRows = aiData ?? []
  } catch { /* table may not exist */ }

  const tenants: any[] = rawTenants ?? [] // eslint-disable-line @typescript-eslint/no-explicit-any
  const now = Date.now()
  const sevenDaysMs = 7 * 86_400_000

  const tenantRows: TenantRow[] = tenants.map((t) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ownerTu   = (tenantUsers ?? []).find((tu: any) => tu.tenant_id === t.id && tu.role === 'owner')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ownerUser = ownerTu ? authUsers.find((u: any) => u.id === ownerTu.user_id) : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recipeCount     = (recipes ?? []).filter((r: any) => r.tenant_id === t.id).length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ingredientCount = (ingredients ?? []).filter((i: any) => i.tenant_id === t.id).length
    const aiCallCount     = aiUsageRows.filter((a) => a.tenant_id === t.id).length

    const updatedAt = new Date(t.updated_at).getTime()
    const createdAt = new Date(t.created_at).getTime()
    const isNewSubscriber =
      t.subscription_status === 'active' &&
      !!t.stripe_subscription_id &&
      now - updatedAt <= sevenDaysMs &&
      updatedAt > createdAt + 60_000

    return {
      id:                     t.id,
      name:                   t.name,
      business_type:          t.business_type,
      subscription_status:    t.subscription_status,
      stripe_subscription_id: t.stripe_subscription_id,
      created_at:             t.created_at,
      updated_at:             t.updated_at,
      recipe_count:           recipeCount,
      ingredient_count:       ingredientCount,
      ai_call_count:          aiCallCount,
      owner_email:            ownerUser?.email ?? null,
      is_new_subscriber:      isNewSubscriber,
      is_comped:              (t.is_comped ?? false) as boolean,
    }
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Tenants</h1>
        <p className="mt-1 text-sm text-slate-500">{tenants.length} registered businesses</p>
      </div>
      <TenantsClient tenants={tenantRows} />
    </div>
  )
}
