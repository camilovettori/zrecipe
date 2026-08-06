// Regression guard for the Henderson PDF garbled-extraction bug: naive
// y-position text reconstruction in extractPdfContent interleaves columns on
// multi-column invoice layouts. Fix: rasterize up to 5 PDF pages client-side
// (extending the existing single-page-image rendering) and send them all to
// Claude vision as the primary extraction path, with the reconstructed text
// kept only as supplementary/fallback input — see route.ts's
// extractPdfWithVision and invoices-client.ts's extractPdfContent.
// There's no jsdom/canvas test infra in this repo, so this checks the actual
// source text of each file rather than exercising rendering/network calls.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
const clientSrc = readFileSync(join(repoRoot, 'src/lib/invoices-client.ts'), 'utf8')
const routeSrc = readFileSync(join(repoRoot, 'src/app/api/invoices/extract/route.ts'), 'utf8')
const importPageSrc = readFileSync(
  join(repoRoot, 'src/app/(dashboard)/invoices/import/page.tsx'),
  'utf8'
)

test('extractPdfContent no longer renders only page 1 to an image', () => {
  assert.doesNotMatch(
    clientSrc,
    /if\s*\(\s*pageIndex\s*===\s*1\s*\)\s*\{/,
    'found a page-1-only gate around canvas rendering — extractPdfContent must rasterize ' +
      'multiple pages (up to a cap), not just the first page'
  )
})

test('extractPdfContent caps rendered pages at 5 and returns pageImages', () => {
  assert.match(
    clientSrc,
    /\bpageImages\b/,
    'expected extractPdfContent to build and return a pageImages array'
  )
  assert.match(
    clientSrc,
    /MAX_VISION_PAGES\s*=\s*5\b/,
    'expected an explicit cap of 5 pages somewhere in the rendering loop'
  )
})

test('route.ts defines extractPdfWithVision and prefers it over the single-header-image path', () => {
  assert.match(
    routeSrc,
    /async function extractPdfWithVision\s*\(/,
    'expected a new extractPdfWithVision(pageImages, text) function in route.ts'
  )
  assert.match(
    routeSrc,
    /pageImages/,
    'expected the POST handler to read a pageImages field from the request body'
  )
  const pdfBranchMatch = routeSrc.match(
    /\/\/ ── PDF \/ text \/ image path[\s\S]*?\n\s*\}\s*\n\s*\/\/ Auth/
  )
  assert.ok(pdfBranchMatch, 'expected to find the PDF/text/image branch above the Auth section')
  assert.match(
    pdfBranchMatch![0],
    /extractPdfWithVision/,
    'expected extractPdfWithVision to be wired into the pdf branch\'s runExtraction selection'
  )
})

test('single-file PDF import sends pageImages to the extract endpoint', () => {
  assert.match(
    importPageSrc,
    /pageImages/,
    'expected import/page.tsx to destructure pageImages from extractPdfContent and send it in the POST body'
  )
})
