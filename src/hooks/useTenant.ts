'use client'

import type { TenantContext } from '@/lib/tenant'
import { useAppStore } from '@/stores/app'

export class TenantResolutionError extends Error {
  code: 'NO_TENANT' | 'NO_SESSION' | 'LOOKUP_FAILED'

  constructor(message: string, code: 'NO_TENANT' | 'NO_SESSION' | 'LOOKUP_FAILED') {
    super(message)
    this.name = 'TenantResolutionError'
    this.code = code
  }
}

export function isTenantResolutionError(error: unknown): error is TenantResolutionError {
  return error instanceof TenantResolutionError
}

function redirectTo(path: string) {
  if (typeof window !== 'undefined') {
    window.location.assign(path)
  }
}

// Module-level full-context cache — populated alongside the Zustand tenantId.
// Zustand is the source-of-truth signal ("do we have a tenant?"); this cache
// holds the richer object so resolveTenantContext() doesn't re-fetch.
let _contextCache: TenantContext | null = null

// In-flight promise — deduplicates concurrent calls that all arrive before
// the first fetch resolves (e.g. multiple hooks mounting at the same time).
let _inflight: Promise<TenantContext> | null = null

export async function resolveTenantContext(): Promise<TenantContext> {
  // ── 1. Zustand store (synchronous, survives route transitions) ────────────
  // useAppStore.getState() is valid outside React components.
  const { tenantId } = useAppStore.getState()
  if (tenantId && _contextCache) {
    return _contextCache
  }

  // ── 2. In-flight deduplication (concurrent callers share one fetch) ───────
  if (_inflight) return _inflight

  // ── 3. Fetch from the service-role API endpoint ───────────────────────────
  _inflight = (async (): Promise<TenantContext> => {
    const res = await fetch('/api/auth/tenant', { credentials: 'same-origin' })

    if (res.status === 401) {
      redirectTo('/login')
      throw new TenantResolutionError('No authenticated user.', 'NO_SESSION')
    }

    if (res.status === 404) {
      redirectTo('/workspace/setup?reason=no-tenant')
      throw new TenantResolutionError('No tenant found for the current user.', 'NO_TENANT')
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new TenantResolutionError(
        (body as { error?: string }).error ?? 'Tenant lookup failed.',
        'LOOKUP_FAILED'
      )
    }

    const data = (await res.json()) as { tenantId: string; role: string; tenant: TenantContext['tenant'] }

    const context: TenantContext = {
      tenantId: data.tenantId,
      role: data.role as TenantContext['role'],
      tenant: data.tenant,
    }

    // Populate caches so subsequent calls are instant
    _contextCache = context
    useAppStore.getState().setTenantId(data.tenantId)

    return context
  })().finally(() => {
    _inflight = null
  })

  return _inflight
}

export async function resolveTenantId(): Promise<string> {
  // Fast path: if Zustand already has the ID, skip the full context resolution
  const { tenantId } = useAppStore.getState()
  if (tenantId) return tenantId

  const context = await resolveTenantContext()
  return context.tenantId
}

/** Call on logout to flush all caches for the next user. */
export function clearTenantCache() {
  _contextCache = null
  _inflight = null
  useAppStore.getState().setTenantId(null)
}
