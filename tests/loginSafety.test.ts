import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getSafeInternalRedirect } from '../src/lib/auth/safe-redirect'

const loginForm = readFileSync('src/components/auth/LoginForm.tsx', 'utf8')

test('safe login redirect preserves valid internal destinations', () => {
  assert.equal(getSafeInternalRedirect('/recipes/123?tab=cost#margin'), '/recipes/123?tab=cost#margin')
  assert.equal(getSafeInternalRedirect('/settings/billing'), '/settings/billing')
})

test('safe login redirect rejects external and protocol-relative destinations', () => {
  for (const unsafe of [
    'https://example.com',
    '//example.com',
    '/\\example.com',
    '\\example.com',
    'javascript:alert(1)',
  ]) {
    assert.equal(getSafeInternalRedirect(unsafe), '/dashboard')
  }
})

test('safe login redirect prevents auth loops and empty destinations', () => {
  for (const unsafe of [null, '', '/', '/login', '/register', '/signup', '/auth/callback?next=/dashboard']) {
    assert.equal(getSafeInternalRedirect(unsafe), '/dashboard')
  }
})

test('login form normalizes email, hides technical errors and links directly to register', () => {
  assert.match(loginForm, /data\.email\.trim\(\)\.toLowerCase\(\)/)
  assert.doesNotMatch(loginForm, /setServerError\(error\.message\)/)
  assert.match(loginForm, /Email or password is incorrect\. Please try again\./)
  assert.match(loginForm, /href="\/register"/)
  assert.doesNotMatch(loginForm, /tabIndex=\{-1\}/)
})
