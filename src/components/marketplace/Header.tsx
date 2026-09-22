import type { TabId } from '@/types/marketplace'

const TABS: { id: TabId; label: string }[] = [
  { id: 'discover', label: 'DISCOVER' },
  { id: 'selected', label: 'SELECTED' },
  { id: 'candidates', label: 'ADD BRAND' },
]

export function Header({ tab, onTabChange }: { tab: TabId; onTabChange: (tab: TabId) => void }) {
  return (
    <header className="border-b border-line py-[22px]">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-10 max-[560px]:px-5">
        <div className="flex items-baseline gap-3.5">
          <span className="font-brand text-xl text-blue transition-opacity hover:opacity-70">333°</span>
          <div className="text-xs tracking-[0.03em] text-stone font-mono">
            WELLNESS MARKETPLACE — BRAND RESEARCH DECK
          </div>
        </div>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(15)
                onTabChange(t.id)
              }}
              className={
                'border px-[18px] py-[9px] text-[13px] font-medium ' +
                (tab === t.id ? 'border-ink font-semibold text-ink' : 'border-line text-stone')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
