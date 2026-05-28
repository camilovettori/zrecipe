'use client'

import { createClient } from '@/lib/supabase/client'
import { getTenantContext, type TenantContext } from '@/lib/tenant'

const WORKSPACE_SETUP_PATH = '/workspace/setup'

export class TenantResolutionError extends Error {
  code: 'NO_TENANT' | 'NO_SESSION' | 'LOOKUP_FAILED'

  constructor(message: string, code: 'NO_TENANT' | 'NO_SESSION' | 'LOOKUP_FAILED') {
    super(message)
    this.name = 'TenantResolutionError'
    this.code = code
  }
}

function redirectTo(path: string) {
  if (typeof window !== 'undefined') {
    window.location.assign(path)
  }
}

export function isTenantResolutionError(error: unknown): error is TenantResolutionError {
  return error instanceof TenantResolutionError
}

export async function resolveTenantContext(): Promise<TenantContext> {
  const supabase = createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    const error = new TenantResolutionError('No authenticated user.', 'NO_SESSION')
    redirectTo('/login')
    throw error
  }

  const context = await getTenantContext(supabase, user.id)
  if (!context) {
    const error = new TenantResolutionError(
      'No tenant found for the current user.',
      'NO_TENANT'
    )
    redirectTo(`${WORKSPACE_SETUP_PATH}?reason=no-tenant`)
    throw error
  }

  return context
}

export async function resolveTenantId() {
  const context = await resolveTenantContext()
  return context.tenantId
}
