import test from 'node:test'
import assert from 'node:assert/strict'
import Module from 'node:module'

// 'server-only' throws unconditionally outside a bundler that resolves its
// "react-server" export condition (Next.js does this at build time; the
// plain Node test runner does not). Stub it so importing server.ts — which
// needs the marker for the real app, not for this test — doesn't throw here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const originalLoad = (Module as any)._load
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(Module as any)._load = function (request: string, ...rest: unknown[]) {
  if (request === 'server-only') return {}
  return originalLoad.call(this, request, ...rest)
}

// encryptSquareSecret/decryptSquareSecret read SQUARE_TOKEN_ENCRYPTION_KEY
// lazily per call (not at module import time), so setting it here is safe.
process.env.SQUARE_TOKEN_ENCRYPTION_KEY = '642432fa7b0b81b3c02087c70f4c3783efb303e77749d4652028d8d6a3a774a2'

// Top-level await isn't supported by this project's CJS test transform, so
// the module is loaded once here as a promise and awaited inside each test.
const serverModule = import('../src/lib/square/server')

test('encrypt -> decrypt round-trip returns the original plaintext', async () => {
  const { encryptSquareSecret, decryptSquareSecret } = await serverModule
  const original = 'square-access-token-EXAMPLE-1234567890'
  const ciphertext = encryptSquareSecret(original)
  assert.equal(decryptSquareSecret(ciphertext), original)
})

test('two encryptions of the same plaintext produce different ciphertext (IV is not reused)', async () => {
  const { encryptSquareSecret, decryptSquareSecret } = await serverModule
  const original = 'square-refresh-token-EXAMPLE'
  const first = encryptSquareSecret(original)
  const second = encryptSquareSecret(original)
  assert.notEqual(first, second)

  // v1.<iv>.<tag>.<ciphertext> — the IV segment specifically must differ.
  const [, ivA] = first.split('.')
  const [, ivB] = second.split('.')
  assert.notEqual(ivA, ivB)

  // Both still decrypt correctly regardless of the differing IV/ciphertext.
  assert.equal(decryptSquareSecret(first), original)
  assert.equal(decryptSquareSecret(second), original)
})

test('decrypt throws when a single ciphertext byte is tampered with (auth tag is verified)', async () => {
  const { encryptSquareSecret, decryptSquareSecret } = await serverModule
  const ciphertext = encryptSquareSecret('square-access-token-EXAMPLE')
  const [version, iv, tag, encrypted] = ciphertext.split('.')

  // Flip one character in the encrypted payload segment.
  const tamperedChar = encrypted[0] === 'A' ? 'B' : 'A'
  const tampered = [version, iv, tag, tamperedChar + encrypted.slice(1)].join('.')

  assert.throws(() => decryptSquareSecret(tampered))
})

test('decrypt throws when the auth tag itself is tampered with', async () => {
  const { encryptSquareSecret, decryptSquareSecret } = await serverModule
  const ciphertext = encryptSquareSecret('square-access-token-EXAMPLE')
  const [version, iv, tag, encrypted] = ciphertext.split('.')

  const tamperedChar = tag[0] === 'A' ? 'B' : 'A'
  const tampered = [version, iv, tamperedChar + tag.slice(1), encrypted].join('.')

  assert.throws(() => decryptSquareSecret(tampered))
})
