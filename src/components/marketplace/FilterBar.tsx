import { CATEGORIES } from '@/types/marketplace'
import type { ViewMode } from '@/types/marketplace'

function vibrate() {
  if (navigator.vibrate) navigator.vibrate(15)
}

export function CategoryFilterBar({ filter, onChange }: { filter: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORIES.map((c) => (
        <button
          key={c}
          type="button"
          className={
            'border px-3.5 py-[7px] text-[11.5px] tracking-[0.02em] font-mono ' +
            (filter === c ? 'border-blue text-blue' : 'border-line text-stone')
          }
          onClick={() => {
            vibrate()
            onChange(c)
          }}
        >
          {c}
        </button>
      ))}
    </div>
  )
}

export function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        aria-label="Grid view"
        onClick={() => onChange('grid')}
        className={
          'flex items-center justify-center border px-[11px] py-2 ' +
          (view === 'grid' ? 'border-ink text-ink' : 'border-line text-stone')
        }
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <rect x="0.5" y="0.5" width="6" height="6" stroke="currentColor" />
          <rect x="8.5" y="0.5" width="6" height="6" stroke="currentColor" />
          <rect x="0.5" y="8.5" width="6" height="6" stroke="currentColor" />
          <rect x="8.5" y="8.5" width="6" height="6" stroke="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="List view"
        onClick={() => onChange('list')}
        className={
          'flex items-center justify-center border px-[11px] py-2 ' +
          (view === 'list' ? 'border-ink text-ink' : 'border-line text-stone')
        }
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <line x1="0.5" y1="2" x2="14.5" y2="2" stroke="currentColor" />
          <line x1="0.5" y1="7.5" x2="14.5" y2="7.5" stroke="currentColor" />
          <line x1="0.5" y1="13" x2="14.5" y2="13" stroke="currentColor" />
        </svg>
      </button>
    </div>
  )
}

/** Country chips: built from whatever countries are actually in the data
 * right now (not a fixed list), labeled with the Korean name already stored
 * on each brand (countryCode is just the grouping/filter key). Multi-select
 * — unlike the category row, clicking a country toggles it in the selection
 * instead of replacing it. */
export function CountryFilterBar({
  brands,
  selected,
  onToggle,
  onClear,
}: {
  brands: { country: string; countryCode?: string | null }[]
  selected: string[]
  onToggle: (code: string) => void
  onClear: () => void
}) {
  const seen = new Set<string>()
  const countries: { code: string; name: string }[] = []
  for (const b of brands) {
    if (b.countryCode && !seen.has(b.countryCode)) {
      seen.add(b.countryCode)
      countries.push({ code: b.countryCode, name: b.country || b.countryCode })
    }
  }
  countries.sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={
          'border px-3.5 py-[7px] text-[11.5px] tracking-[0.02em] font-mono ' +
          (selected.length === 0 ? 'border-blue text-blue' : 'border-line text-stone')
        }
        onClick={() => {
          vibrate()
          onClear()
        }}
      >
        전체
      </button>
      {countries.map((c) => (
        <button
          key={c.code}
          type="button"
          className={
            'border px-3.5 py-[7px] text-[11.5px] tracking-[0.02em] font-mono ' +
            (selected.includes(c.code) ? 'border-blue text-blue' : 'border-line text-stone')
          }
          onClick={() => {
            vibrate()
            onToggle(c.code)
          }}
        >
          {c.name}
        </button>
      ))}
    </div>
  )
}
