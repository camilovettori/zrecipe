import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const shell = readFileSync('src/components/auth/AuthSplitShell.tsx', 'utf8')
const form = readFileSync('src/components/auth/RegisterForm.tsx', 'utf8')
const registerPage = readFileSync('src/app/(auth)/register/page.tsx', 'utf8')
const signupPage = readFileSync('src/app/(auth)/signup/page.tsx', 'utf8')
const authLayout = readFileSync('src/app/(auth)/layout.tsx', 'utf8')

test('register copy uses one consistent trial promise and CTA', () => {
  assert.match(shell, /Start costing recipes in under/)
  assert.match(shell, /headlineAccent: '2 minutes\.'/)
  assert.doesNotMatch(shell, /90 seconds|Cancel anytime|surprise charges/)
  assert.match(shell, /Create my kitchen — free/)
  assert.match(form, /Create my kitchen — free/)
  assert.match(registerPage, /Under two minutes\. One kitchen\. No credit card\./)
})

test('terms consent gives feedback without making CTAs look disabled', () => {
  assert.match(form, /Please accept the Terms of Service and Privacy Policy to continue\./)
  assert.match(form, /disabled=\{isSubmitting\}/)
  assert.doesNotMatch(form, /disabled=\{isSubmitting \|\| !acceptedTerms\}/)
  assert.doesNotMatch(form, /disabled=\{!acceptedTerms\}/)
})

test('register mobile and keyboard accessibility safeguards stay in place', () => {
  assert.match(form, /grid-cols-1 gap-3 sm:grid-cols-2/)
  assert.doesNotMatch(form, /tabIndex=\{-1\}/)
  assert.match(form, /aria-describedby=\{termsError/)
})

test('signup permanently redirects and auth pages are noindex', () => {
  assert.match(signupPage, /permanentRedirect\('\/register'\)/)
  assert.match(authLayout, /index: false/)
  assert.match(authLayout, /follow: false/)
})
