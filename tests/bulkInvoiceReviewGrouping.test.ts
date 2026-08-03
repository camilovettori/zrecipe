// Regression tests for BUG A/B in BulkInvoiceReview.tsx:
// - buildInitialGroups() must scope grouping by supplier, not just by
//   normalized description, or two suppliers' items with the same
//   description get merged and their prices mixed.
// - Each occurrence must carry its own packageSize/packageUnit, not just
//   inherit the group's, or mixed pack sizes across occurrences get lost.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildInitialGroups, type BulkInvoiceDraft } from '../src/components/invoices/BulkInvoiceReview'
import type { InvoiceFormState } from '@/lib/invoices'

function makeMeta(supplierId: string | null, supplierName: string): InvoiceFormState {
  return {
    supplierName,
    supplierId,
    supplierMatch: null,
    invoiceNumber: '',
    invoiceDate: '2026-08-01',
    currency: 'EUR',
    notes: '',
    totalAmount: 0,
    subtotalAmount: null,
    vatAmount: null,
    vatRate: null,
    fileUrl: null,
    fileType: null,
    items: [],
  }
}

function makeDraft(
  id: string,
  supplierId: string | null,
  supplierName: string,
  items: BulkInvoiceDraft['items']
): BulkInvoiceDraft {
  return {
    id,
    fileName: `${id}.pdf`,
    file: null,
    fileKind: 'pdf',
    meta: makeMeta(supplierId, supplierName),
    items,
  }
}

test('BUG A: items with the same description from different suppliers stay in separate groups', () => {
  const drafts = [
    makeDraft('draft-1', 'supplier-a', 'Supplier A', [
      { description: 'Butter', quantity: 1, unit: 'kg', unitPrice: 5, total: 5 },
    ]),
    makeDraft('draft-2', 'supplier-b', 'Supplier B', [
      { description: 'Butter', quantity: 1, unit: 'kg', unitPrice: 9, total: 9 },
    ]),
  ]

  const groups = buildInitialGroups(drafts, [])

  assert.equal(groups.length, 2, 'expected two separate groups, one per supplier')
  const [groupA, groupB] = groups
  assert.equal(groupA.occurrences.length, 1)
  assert.equal(groupB.occurrences.length, 1)
  assert.notEqual(groupA.occurrences[0].price, groupB.occurrences[0].price === groupA.occurrences[0].price)
  assert.equal(groupA.supplierId, 'supplier-a')
  assert.equal(groupB.supplierId, 'supplier-b')
})

test('items with the same description from the SAME supplier still consolidate into one group', () => {
  const drafts = [
    makeDraft('draft-1', 'supplier-a', 'Supplier A', [
      { description: 'Butter', quantity: 1, unit: 'kg', unitPrice: 5, total: 5 },
    ]),
    makeDraft('draft-2', 'supplier-a', 'Supplier A', [
      { description: 'Butter', quantity: 2, unit: 'kg', unitPrice: 5.5, total: 11 },
    ]),
  ]

  const groups = buildInitialGroups(drafts, [])

  assert.equal(groups.length, 1, 'same supplier + same description should still merge into one group')
  assert.equal(groups[0].occurrences.length, 2)
})

test('BUG B: each occurrence keeps its own packageSize/packageUnit, not the group default', () => {
  const drafts = [
    makeDraft('draft-1', 'supplier-a', 'Supplier A', [
      { description: 'Flour', quantity: 1, unit: 'kg', unitPrice: 2, total: 2, packageSize: 1, packageUnit: 'kg' },
    ]),
    makeDraft('draft-2', 'supplier-a', 'Supplier A', [
      { description: 'Flour', quantity: 1, unit: 'kg', unitPrice: 18, total: 18, packageSize: 25, packageUnit: 'kg' },
    ]),
  ]

  const groups = buildInitialGroups(drafts, [])

  assert.equal(groups.length, 1)
  const [first, second] = groups[0].occurrences
  assert.equal(first.packageSize, 1)
  assert.equal(second.packageSize, 25, 'second occurrence must keep its own 25kg pack size, not the group default of 1kg')
})
