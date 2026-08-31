import 'server-only'

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'crypto'

export const SQUARE_SCOPES = [
  'MERCHANT_PROFILE_READ',
  'ORDERS_READ',
  'PAYMENTS_READ',
  'ITEMS_READ',
] as const

type SquareEnvironment = 'production' | 'sandbox'

type SquareConnectionRecord = {
  id: string
  tenant_id: string
  access_token_ciphertext: string
  refresh_token_ciphertext: string
  token_expires_at: string | null
}

type SquareTokenResponse = {
  access_token: string
  refresh_token: string
  expires_at?: string | null
  merchant_id?: string
  token_type?: string
}

function configuredEnvironment(): SquareEnvironment {
  const value = process.env.SQUARE_ENVIRONMENT
  if (value === 'production' || value === 'sandbox') return value
  throw new Error("SQUARE_ENVIRONMENT must be exactly 'sandbox' or 'production' — no default.")
}

export function getSquareBaseUrl() {
  return configuredEnvironment() === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com'
}

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

function encryptionKey() {
  const value = required('SQUARE_TOKEN_ENCRYPTION_KEY')
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error('SQUARE_TOKEN_ENCRYPTION_KEY must be a 64-character hexadecimal value.')
  }
  return Buffer.from(value, 'hex')
}

export function encryptSquareSecret(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decryptSquareSecret(payload: string) {
  const [version, ivValue, tagValue, encryptedValue] = payload.split('.')
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
    throw new Error('Stored Square credentials have an invalid format.')
  }

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

function stateSecret() {
  return process.env.SQUARE_OAUTH_STATE_SECRET || required('SQUARE_TOKEN_ENCRYPTION_KEY')
}

export function createOAuthState(payload: { tenantId: string; userId: string }) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 10 * 60 * 1000 })).toString('base64url')
  const signature = createHmac('sha256', stateSecret()).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function verifyOAuthState(state: string) {
  const [body, signature] = state.split('.')
  if (!body || !signature) throw new Error('Invalid OAuth state.')

  const expected = createHmac('sha256', stateSecret()).update(body).digest('base64url')
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error('Invalid OAuth state.')
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
    tenantId?: string
    userId?: string
    exp?: number
  }
  if (!payload.tenantId || !payload.userId || !payload.exp || payload.exp < Date.now()) {
    throw new Error('This Square connection request has expired. Please try again.')
  }
  return { tenantId: payload.tenantId, userId: payload.userId }
}

export function getSquareRedirectUrl() {
  const explicit = process.env.SQUARE_OAUTH_REDIRECT_URL
  if (explicit) return explicit
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (!appUrl) throw new Error('SQUARE_OAUTH_REDIRECT_URL or NEXT_PUBLIC_APP_URL must be configured.')
  return `${appUrl.replace(/\/$/, '')}/api/integrations/square/callback`
}

export function getSquareAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: required('SQUARE_APPLICATION_ID'),
    scope: SQUARE_SCOPES.join(' '),
    session: 'false',
    state,
    redirect_uri: getSquareRedirectUrl(),
  })
  return `${getSquareBaseUrl()}/oauth2/authorize?${params.toString()}`
}

async function squareFetch(path: string, init: RequestInit) {
  const response = await fetch(`${getSquareBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Square-Version': process.env.SQUARE_API_VERSION || '2026-08-19',
      ...init.headers,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    const detail = data?.errors?.map((error: { detail?: string }) => error.detail).filter(Boolean).join(' ') || response.statusText
    throw new Error(`Square API error: ${detail}`)
  }

  return response.json() as Promise<Record<string, unknown>>
}

export async function exchangeAuthorizationCode(code: string) {
  return squareFetch('/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: required('SQUARE_APPLICATION_ID'),
      client_secret: required('SQUARE_APPLICATION_SECRET'),
      code,
      grant_type: 'authorization_code',
      redirect_uri: getSquareRedirectUrl(),
    }),
  }) as Promise<SquareTokenResponse>
}

async function refreshToken(refreshToken: string) {
  return squareFetch('/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: required('SQUARE_APPLICATION_ID'),
      client_secret: required('SQUARE_APPLICATION_SECRET'),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  }) as Promise<SquareTokenResponse>
}

export async function getValidSquareAccessToken(
  connection: SquareConnectionRecord,
  persist: (tokens: { accessToken: string; refreshToken: string; expiresAt: string | null }) => Promise<void>
) {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0
  const hasTime = Number.isFinite(expiresAt) && expiresAt > 0
  if (!hasTime || expiresAt > Date.now() + 5 * 60 * 1000) {
    return decryptSquareSecret(connection.access_token_ciphertext)
  }

  const refreshed = await refreshToken(decryptSquareSecret(connection.refresh_token_ciphertext))
  if (!refreshed.access_token || !refreshed.refresh_token) {
    throw new Error('Square did not return refreshed access credentials.')
  }
  await persist({
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt: refreshed.expires_at ?? null,
  })
  return refreshed.access_token
}

export async function squareApi<T extends Record<string, unknown>>(
  accessToken: string,
  path: string,
  init: RequestInit = {}
) {
  return squareFetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...init.headers,
    },
  }) as Promise<T>
}

export type { SquareConnectionRecord }

// ── Sync row shaping ────────────────────────────────────────────────────────
// Pure Square-API-response -> DB-row mappers, factored out of the sync route
// so they're unit-testable without a live DB or Square API (see
// tests/squareSyncIdempotency.test.ts).

export type SquareMoney = { amount?: number | bigint | string | null; currency?: string | null }

export type SquareLineItemForSync = {
  uid?: string
  catalog_object_id?: string
  catalog_version?: number | bigint | string | null
  name?: string
  quantity?: string | number
  base_price_money?: SquareMoney
  gross_sales_money?: SquareMoney
  total_money?: SquareMoney
  variation_name?: string
  catalog_object?: { sku?: string }
}

export type SquareOrderForSync = {
  id: string
  location_id?: string
  state?: string
  source?: { name?: string }
  created_at?: string
  updated_at?: string
  closed_at?: string
  total_money?: SquareMoney
  total_tax_money?: SquareMoney
  total_discount_money?: SquareMoney
  line_items?: SquareLineItemForSync[]
}

export function squareMoneyToCents(money?: SquareMoney) {
  return Number(money?.amount ?? 0)
}

export function buildSquareOrderRow(order: SquareOrderForSync, tenantId: string, connectionId: string) {
  return {
    tenant_id: tenantId,
    connection_id: connectionId,
    square_order_id: order.id,
    location_id: order.location_id ?? null,
    state: order.state ?? 'UNKNOWN',
    source_name: order.source?.name ?? null,
    created_at_square: order.created_at ?? new Date().toISOString(),
    updated_at_square: order.updated_at ?? null,
    closed_at_square: order.closed_at ?? null,
    currency: order.total_money?.currency ?? 'EUR',
    gross_amount_cents: Math.max(0, squareMoneyToCents(order.total_money) + squareMoneyToCents(order.total_discount_money)),
    discount_amount_cents: squareMoneyToCents(order.total_discount_money),
    tax_amount_cents: squareMoneyToCents(order.total_tax_money),
    net_amount_cents: Math.max(0, squareMoneyToCents(order.total_money) - squareMoneyToCents(order.total_tax_money)),
    total_amount_cents: squareMoneyToCents(order.total_money),
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export function buildSquareLineItemRows(order: SquareOrderForSync, tenantId: string) {
  return (order.line_items ?? []).map((line, index) => ({
    tenant_id: tenantId,
    square_order_id: order.id,
    square_line_item_uid: line.uid ?? `${order.id}-${index}`,
    catalog_object_id: line.catalog_object_id ?? null,
    catalog_version: line.catalog_version != null ? Number(line.catalog_version) : null,
    sku: line.catalog_object?.sku ?? null,
    name: line.name || line.variation_name || 'Square item',
    quantity: Number(line.quantity ?? 0),
    gross_amount_cents: squareMoneyToCents(line.gross_sales_money ?? line.base_price_money),
    total_amount_cents: squareMoneyToCents(line.total_money),
    currency: line.total_money?.currency ?? order.total_money?.currency ?? 'EUR',
    updated_at: new Date().toISOString(),
  }))
}
