import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import robots from '../src/app/robots'
import sitemap from '../src/app/sitemap'
import { SITE_URL } from '../src/lib/site-url'

test('the canonical origin is the non-www production domain', () => {
  assert.equal(SITE_URL, 'https://zrecipe.ie')
})

test('sitemap emits only non-www canonical URLs', async () => {
  const entries = await sitemap()
  assert.ok(entries.length > 0)
  for (const entry of entries) {
    assert.match(entry.url, /^https:\/\/zrecipe\.ie(?:\/|$)/)
    assert.doesNotMatch(entry.url, /www\./)
  }
})

test('robots points to the non-www sitemap', () => {
  assert.equal(robots().sitemap, 'https://zrecipe.ie/sitemap.xml')
})

test('www redirect is host-scoped to prevent redirect loops', () => {
  const config = readFileSync('next.config.mjs', 'utf8')
  assert.match(config, /type:\s*'host',\s*value:\s*'www\.zrecipe\.ie'/)
  assert.match(config, /destination:\s*'https:\/\/zrecipe\.ie\/:path\*'/)
  assert.match(config, /permanent:\s*true/)
})
