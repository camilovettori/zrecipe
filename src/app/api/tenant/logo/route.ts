import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRequestSupabaseClient } from '@/lib/supabase/request'
import { getEffectiveSubscriptionStatus, hasBrandingRights } from '@/lib/tenant'

export const runtime = 'nodejs'
export const maxDuration = 30

async function resolveTenantForRequest(request: NextRequest) {
  const supabase = createRequestSupabaseClient(request)
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { error: 'Unauthorized' as const, status: 401 as const }

  const admin = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: member } = await (admin.from('tenant_users') as any)
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!member) return { error: 'Tenant not found' as const, status: 404 as const }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant } = await (admin.from('tenants') as any)
    .select('id, subscription_status, plan_tier, is_comped, created_at')
    .eq('id', member.tenant_id)
    .maybeSingle()

  if (!tenant) return { error: 'Tenant not found' as const, status: 404 as const }

  const status = getEffectiveSubscriptionStatus(
    tenant.subscription_status,
    tenant.created_at ?? new Date().toISOString()
  )
  if (!hasBrandingRights(status, tenant.is_comped, tenant.plan_tier)) {
    return { error: 'Upgrade to Pro to customize branding' as const, status: 403 as const }
  }

  return { admin, tenantId: member.tenant_id as string }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveTenantForRequest(request)
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    const { admin, tenantId } = resolved

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file || !file.size) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const path = `logos/${tenantId}/${Date.now()}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    const { error: uploadError } = await admin.storage
      .from('recipe-images')
      .upload(path, buffer, { contentType: file.type, upsert: true })

    if (uploadError) {
      console.error('[tenant/logo POST]', uploadError)
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: urlData } = admin.storage.from('recipe-images').getPublicUrl(path)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (admin.from('tenants') as any)
      .update({ custom_logo_url: urlData.publicUrl })
      .eq('id', tenantId)

    if (updateError) {
      console.error('[tenant/logo POST update]', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ url: urlData.publicUrl })
  } catch (err) {
    console.error('[tenant/logo POST] unhandled:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const resolved = await resolveTenantForRequest(request)
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    const { admin, tenantId } = resolved

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (admin.from('tenants') as any)
      .update({ custom_logo_url: null })
      .eq('id', tenantId)

    if (updateError) {
      console.error('[tenant/logo DELETE]', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[tenant/logo DELETE] unhandled:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Remove failed' },
      { status: 500 }
    )
  }
}
