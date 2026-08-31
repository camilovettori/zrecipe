import test from 'node:test'
import assert from 'node:assert/strict'
import Module from 'node:module'

// See tests/squareTokenRoundTrip.test.ts for why 'server-only' needs stubbing
// under the plain Node test runner.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const originalLoad = (Module as any)._load
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(Module as any)._load = function (request: string, ...rest: unknown[]) {
  if (request === 'server-only') return {}
  return originalLoad.call(this, request, ...rest)
}

process.env.SQUARE_TOKEN_ENCRYPTION_KEY = '642432fa7b0b81b3c02087c70f4c3783efb303e77749d4652028d8d6a3a774a2'
process.env.SQUARE_OAUTH_STATE_SECRET = 'a-different-state-secret-than-the-encryption-key'

const serverModule = import('../src/lib/square/server')

test('create -> verify round-trip returns the same tenantId/userId', async () => {
  const { createOAuthState, verifyOAuthState } = await serverModule
  const state = createOAuthState({ tenantId: 'tenant-a', userId: 'user-a' })
  const payload = verifyOAuthState(state)
  assert.deepEqual(payload, { tenantId: 'tenant-a', userId: 'user-a' })
})

test('a state with a flipped signature byte is rejected', async () => {
  const { createOAuthState, verifyOAuthState } = await serverModule
  const state = createOAuthState({ tenantId: 'tenant-a', userId: 'user-a' })
  const [body, signature] = state.split('.')
  const tamperedChar = signature[0] === 'A' ? 'B' : 'A'
  const tampered = `${body}.${tamperedChar}${signature.slice(1)}`

  assert.throws(() => verifyOAuthState(tampered), /Invalid OAuth state/)
})

test('an expired state is rejected', async () => {
  const { verifyOAuthState } = await serverModule
  const { createHmac } = await import('node:crypto')

  // Build a state payload with exp already in the past, signed the same way
  // createOAuthState does, using the same secret-resolution fallback.
  const body = Buffer.from(
    JSON.stringify({ tenantId: 'tenant-a', userId: 'user-a', exp: Date.now() - 1000 })
  ).toString('base64url')
  const signature = createHmac('sha256', process.env.SQUARE_OAUTH_STATE_SECRET!)
    .update(body)
    .digest('base64url')

  assert.throws(() => verifyOAuthState(`${body}.${signature}`), /expired/)
})

test('a state signed with a different secret is rejected', async () => {
  const { verifyOAuthState } = await serverModule
  const { createHmac } = await import('node:crypto')

  const body = Buffer.from(
    JSON.stringify({ tenantId: 'tenant-a', userId: 'user-a', exp: Date.now() + 60_000 })
  ).toString('base64url')
  const signature = createHmac('sha256', 'a-completely-wrong-secret')
    .update(body)
    .digest('base64url')

  assert.throws(() => verifyOAuthState(`${body}.${signature}`), /Invalid OAuth state/)
})
