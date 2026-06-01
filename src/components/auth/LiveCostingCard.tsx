import { TrendingUp } from 'lucide-react'

const INGREDIENTS = [
  { emoji: '🧈', name: 'Butter AOP', cost: 0.18, pct: 43, barColor: '#F59E0B' },
  { emoji: '👥', name: 'Labor',      cost: 0.12, pct: 29, barColor: '#5DCAA5' },
  { emoji: '🌾', name: 'Flour T55',  cost: 0.08, pct: 19, barColor: '#60A5FA' },
  { emoji: '···', name: 'Other',     cost: 0.04, pct: 9,  barColor: '#2DD4BF' },
]

export default function LiveCostingCard() {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        // Solid opaque dark bg so the croissant model (behind content) doesn't show through
        background: 'rgba(8, 20, 15, 0.96)',
        border: '1px solid rgba(255,255,255,0.10)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="h-[7px] w-[7px] rounded-full bg-[#5DCAA5]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5DCAA5]">
            Live Costing ↗
          </span>
        </div>
        {/* Food cost pill — matches reference */}
        <span
          className="rounded-md px-2 py-0.5 text-[11px] font-bold text-[#5DCAA5]"
          style={{ background: 'rgba(93,202,165,0.12)', border: '1px solid rgba(93,202,165,0.2)' }}
        >
          Food cost €0.42
        </span>
      </div>
      <p className="mt-1.5 text-[13px] font-bold text-white">Croissant au Beurre</p>

      {/* Ingredient bars */}
      <div className="mt-2.5 space-y-1.5">
        {INGREDIENTS.map((ing) => (
          <div key={ing.name} className="flex items-center gap-2">
            <span className="w-3.5 shrink-0 text-[11px] leading-none">{ing.emoji}</span>
            <span className="w-[62px] shrink-0 text-[11px]" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {ing.name}
            </span>
            <div className="flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)', height: '6px' }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${ing.pct}%`, background: ing.barColor }}
              />
            </div>
            <span className="w-[34px] shrink-0 text-right text-[11px] tabular-nums" style={{ color: 'rgba(255,255,255,0.55)' }}>
              €{ing.cost.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        className="mt-3 flex items-center justify-between border-t pt-2.5"
        style={{ borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-1 text-[11px] text-amber-400">
          <TrendingUp className="h-3 w-3 shrink-0" />
          <span>Butter AOP up 8% this month</span>
        </div>
        <div className="text-right">
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Margin</p>
          <p className="text-[13px] font-bold text-[#5DCAA5]">87%</p>
        </div>
      </div>
    </div>
  )
}
