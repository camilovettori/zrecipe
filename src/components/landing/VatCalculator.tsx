'use client'

import { useMemo, useState } from 'react'
import { Calculator, Check, Clipboard, RotateCcw } from 'lucide-react'
import { calculateVat, type VatCalculationMode } from '@/lib/vat-calculator'
import { cn } from '@/lib/utils'

const VAT_RATES = [
  { value: 23, label: 'Standard' },
  { value: 13.5, label: 'Reduced' },
  { value: 9, label: 'Second reduced' },
  { value: 4.8, label: 'Livestock' },
  { value: 0, label: 'Zero rate' },
] as const

const euro = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function parseAmount(value: string) {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export default function VatCalculator() {
  const [mode, setMode] = useState<VatCalculationMode>('add')
  const [amount, setAmount] = useState('100')
  const [selectedRate, setSelectedRate] = useState<number | 'custom'>(23)
  const [customRate, setCustomRate] = useState('20')
  const [copied, setCopied] = useState(false)

  const rate = selectedRate === 'custom'
    ? Math.min(100, parseAmount(customRate))
    : selectedRate
  const result = useMemo(
    () => calculateVat(parseAmount(amount), rate, mode),
    [amount, mode, rate]
  )

  const reset = () => {
    setMode('add')
    setAmount('100')
    setSelectedRate(23)
    setCustomRate('20')
    setCopied(false)
  }

  const copyResult = async () => {
    const text = [
      `Irish VAT calculation (${rate}% VAT)`,
      `Net: ${euro.format(result.net)}`,
      `VAT: ${euro.format(result.vat)}`,
      `Gross: ${euro.format(result.gross)}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-emerald-900/10 bg-white shadow-[0_24px_70px_rgba(14,59,46,0.12)]">
      <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
        <div className="p-5 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <Calculator className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Irish VAT Calculator</p>
              <p className="text-xs text-slate-500">Instant add and remove VAT calculation</p>
            </div>
          </div>

          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="VAT calculation type">
            {(['add', 'remove'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item)}
                aria-pressed={mode === item}
                className={cn(
                  'rounded-lg px-4 py-2.5 text-sm font-semibold transition',
                  mode === item
                    ? 'bg-white text-emerald-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                )}
              >
                {item === 'add' ? 'Add VAT' : 'Remove VAT'}
              </button>
            ))}
          </div>

          <div className="mt-6">
            <label htmlFor="vat-amount" className="mb-2 block text-sm font-medium text-slate-700">
              {mode === 'add' ? 'Net amount excluding VAT' : 'Gross amount including VAT'}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-lg font-semibold text-slate-400">€</span>
              <input
                id="vat-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="h-14 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xl font-semibold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                placeholder="0.00"
              />
            </div>
          </div>

          <fieldset className="mt-6">
            <legend className="mb-2 text-sm font-medium text-slate-700">VAT rate</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {VAT_RATES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSelectedRate(item.value)}
                  aria-label={`${item.value}% ${item.label} VAT rate`}
                  aria-pressed={selectedRate === item.value}
                  className={cn(
                    'rounded-xl border px-2 py-2.5 text-sm font-semibold transition',
                    selectedRate === item.value
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
                  )}
                >
                  {item.value}%
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelectedRate('custom')}
                aria-pressed={selectedRate === 'custom'}
                className={cn(
                  'rounded-xl border px-2 py-2.5 text-sm font-semibold transition',
                  selectedRate === 'custom'
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
                )}
              >
                Custom
              </button>
            </div>
            {selectedRate === 'custom' && (
              <div className="mt-3 max-w-44">
                <label htmlFor="custom-vat-rate" className="sr-only">Custom VAT rate</label>
                <div className="relative">
                  <input
                    id="custom-vat-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    inputMode="decimal"
                    value={customRate}
                    onChange={(event) => setCustomRate(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 pr-9 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">%</span>
                </div>
              </div>
            )}
          </fieldset>

          <p className="mt-5 text-xs leading-5 text-slate-500">
            {mode === 'add'
              ? `Formula: net amount × ${rate}% = VAT amount.`
              : `Formula: gross amount ÷ ${(1 + rate / 100).toFixed(3)} = net amount.`}
          </p>
        </div>

        <div className="flex flex-col bg-brand-green p-5 text-white sm:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Calculation result</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              {mode === 'add' ? 'Price with VAT added' : 'VAT included in the price'}
            </h3>
          </div>

          <dl className="mt-8 space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-4">
              <dt className="text-sm text-emerald-100">Net excl. VAT</dt>
              <dd className="text-lg font-semibold tabular-nums">{euro.format(result.net)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-4">
              <dt className="text-sm text-amber-100">VAT at {rate}%</dt>
              <dd className="text-lg font-semibold tabular-nums text-amber-200">{euro.format(result.vat)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-5 text-brand-green shadow-sm">
              <dt className="text-sm font-semibold">Gross incl. VAT</dt>
              <dd className="text-2xl font-bold tabular-nums">{euro.format(result.gross)}</dd>
            </div>
          </dl>

          <div className="mt-auto flex flex-col gap-2 pt-8 sm:flex-row">
            <button
              type="button"
              onClick={copyResult}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
            >
              {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy result'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-white/10"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
