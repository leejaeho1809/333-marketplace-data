import { useMemo } from 'react'
import { useMarketplace } from '@/context/MarketplaceProvider'
import { BrandCard } from '@/components/marketplace/BrandCard'
import type { Brand, BrandStatus, TabId, ViewMode } from '@/types/marketplace'

function statusLabel(st: BrandStatus) {
  if (st === 'saved') return 'SAVED'
  if (st === 'consider') return 'CONSIDER'
  if (st === 'deleted') return 'DELETED'
  return ''
}

function StatusBadge({ status }: { status: BrandStatus }) {
  if (!status) return <div />
  const classes =
    status === 'saved'
      ? 'border-blue text-blue'
      : status === 'consider'
        ? 'border-cream text-[#9a8f4f]'
        : 'border-stone-light text-stone-light line-through'
  return (
    <div className={'border px-2 py-1 text-[10.5px] tracking-[0.03em] ' + classes}>{statusLabel(status)}</div>
  )
}

/** DISCOVER/SELECTED tab body: the brand grid, its empty state, the
 * show/hide-deleted toggle, and the "Discover Similar Brands" stub block
 * that sits below it on both tabs. */
export function DiscoverDeck({
  tab,
  filter,
  countryFilters,
  view,
  showDeleted,
  onToggleShowDeleted,
  onOpenBrand,
}: {
  tab: TabId
  filter: string
  countryFilters: string[]
  view: ViewMode
  showDeleted: boolean
  onToggleShowDeleted: () => void
  onOpenBrand: (id: string) => void
}) {
  const { brands, getEntry, hasReliableImage } = useMarketplace()

  const list = useMemo(() => {
    const filtered = brands.filter((b: Brand) => {
      const entry = getEntry(b.id)
      if (tab === 'selected' && entry.status !== 'saved') return false
      if (filter !== 'ALL' && !b.category.includes(filter)) return false
      if (countryFilters.length && !countryFilters.includes(b.countryCode || '')) return false
      if (entry.status === 'deleted' && !showDeleted) return false
      return true
    })
    return filtered.slice().sort((x, y) => {
      const ex = getEntry(x.id)
      const ey = getEntry(y.id)
      const scoreX = (ex.status === 'deleted' ? 0 : 2) + (hasReliableImage(x, ex) ? 1 : 0)
      const scoreY = (ey.status === 'deleted' ? 0 : 2) + (hasReliableImage(y, ey) ? 1 : 0)
      return scoreY - scoreX
    })
  }, [brands, tab, filter, countryFilters, showDeleted, getEntry, hasReliableImage])

  const deletedCount = useMemo(
    () => brands.filter((b) => getEntry(b.id).status === 'deleted').length,
    [brands, getEntry],
  )

  const isEmpty = tab === 'selected' && list.length === 0

  return (
    <div className="py-12 pb-20">
      <div
        className={
          view === 'list'
            ? 'flex flex-col'
            : 'grid grid-cols-3 gap-x-7 gap-y-8 max-[860px]:grid-cols-2 max-[560px]:grid-cols-1'
        }
      >
        {list.map((b) => (
          <BrandCard
            key={b.id}
            brand={b}
            view={view}
            footer={<StatusBadge status={getEntry(b.id).status} />}
            onClick={() => onOpenBrand(b.id)}
          />
        ))}
      </div>

      {isEmpty && (
        <div className="py-20 text-center text-sm text-stone">아직 SAVE한 브랜드가 없어요.</div>
      )}

      {deletedCount > 0 && (
        <button
          type="button"
          onClick={onToggleShowDeleted}
          className="mx-auto mt-8 block cursor-pointer border-none bg-transparent p-0 text-[12.5px] text-stone-light underline hover:text-stone"
        >
          {showDeleted ? `삭제된 항목 숨기기 (${deletedCount})` : `삭제된 항목 보기 (${deletedCount})`}
        </button>
      )}

      <div className="mt-16 border-t border-line pt-12">
        <h3 className="text-base font-semibold">Discover Similar Brands</h3>
        <div className="mt-3.5 max-w-[640px] bg-cream px-[18px] py-4 text-[13px] leading-[1.7]">
          SAVE한 브랜드의 공통 특성과 DELETE 이유를 학습해 유사 브랜드를 추천하는 기능입니다. 실시간 브랜드
          데이터베이스 / 검색 API 연동이 필요하며, 현재는 연결되어 있지 않습니다.
        </div>
      </div>
    </div>
  )
}
