'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { YIELD_FACTORS } from '@/lib/data/yield-factors'

const CATEGORY_ORDER = ['produce', 'meat', 'fish', 'dairy', 'dry'] as const
const CATEGORY_LABELS: Record<string, string> = {
  produce: 'Fruits & Vegetables',
  meat: 'Meat & Poultry',
  fish: 'Fish & Seafood',
  dairy: 'Dairy & Eggs',
  dry: 'Dry & Pantry',
}

interface Props {
  open: boolean
  onClose: () => void
}

export function YieldFactorModal({ open, onClose }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-[90vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b border-slate-100 p-5">
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-900">
                Yield Factor Reference
              </Dialog.Title>
              <p className="mt-0.5 text-xs text-slate-500">
                Standard values compiled from USDA culinary data. Applied automatically when adding ingredients — always overridable per line.
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-4 shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-5">
            <div className="space-y-6">
              {CATEGORY_ORDER.map((cat) => {
                const items = YIELD_FACTORS.filter((yf) => yf.category === cat)
                if (!items.length) return null
                return (
                  <div key={cat}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {CATEGORY_LABELS[cat]}
                    </h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-slate-400">
                          <th className="pb-1 text-left font-medium">Ingredient</th>
                          <th className="w-16 pb-1 text-right font-medium">Yield</th>
                          <th className="pb-1 pl-4 text-left font-medium">What's removed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {items.map((yf) => (
                          <tr key={yf.ingredient} className="hover:bg-slate-50/50">
                            <td className="py-1.5 capitalize text-slate-700">{yf.ingredient}</td>
                            <td className={`py-1.5 text-right font-mono font-medium ${
                              yf.yieldPercent < 60
                                ? 'text-red-500'
                                : yf.yieldPercent < 80
                                  ? 'text-amber-600'
                                  : yf.yieldPercent < 95
                                    ? 'text-slate-700'
                                    : 'text-slate-400'
                            }`}>
                              {yf.yieldPercent}%
                            </td>
                            <td className="py-1.5 pl-4 text-slate-400">{yf.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
