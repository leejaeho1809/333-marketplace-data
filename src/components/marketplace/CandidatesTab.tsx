import { useMemo } from 'react'
import { useMarketplace } from '@/context/MarketplaceProvider'
import { BrandCard } from '@/components/marketplace/BrandCard'
import type { Brand } from '@/types/marketplace'

function formatHotDate(d: string | undefined | null) {
  if (!d) return ''
  const parts = String(d).split('-')
  return parts[1] + '.' + parts[2]
}

function CandidateActions({ brand }: { brand: Brand }) {
  const { moveCandidateToDiscover, deleteCandidate } = useMarketplace()
  return (
    <div className="flex w-full gap-2">
      <button
        type="button"
        className="flex-1 border border-blue px-2.5 py-2 text-[11.5px] font-medium text-blue hover:bg-blue hover:text-white"
        onClick={(e) => {
          e.stopPropagation()
          moveCandidateToDiscover(brand.id)
        }}
      >
        DISCOVER로 이동
      </button>
      <button
        type="button"
        className="border border-line px-2.5 py-2 text-[11.5px] font-medium text-stone hover:border-delete hover:text-delete"
        onClick={(e) => {
          e.stopPropagation()
          deleteCandidate(brand.id)
        }}
      >
        삭제
      </button>
    </div>
  )
}

/** ADD BRAND tab: candidates found by an external research agent, plus the
 * weekly hot-brand ranking panel above them (hidden when no ranking has been
 * computed yet). Cards reuse BrandCard — same layout as DISCOVER — only the
 * footer differs (move/delete buttons instead of a status badge). */
export function CandidatesTab({
  onOpenBrand,
  onOpenAddModal,
}: {
  onOpenBrand: (id: string) => void
  onOpenAddModal: () => void
}) {
  const { candidateBrands, getEntry, hotBrands, hotWeekRange, findBrandById } = useMarketplace()

  const hotVisible = useMemo(
    () =>
      hotBrands
        .map((h) => ({ h, b: findBrandById(h.brand_id) }))
        .filter((x): x is { h: (typeof hotBrands)[number]; b: Brand } => !!x.b && getEntry(x.b.id).status !== 'deleted'),
    [hotBrands, findBrandById, getEntry],
  )
  const hotShownIds = useMemo(() => new Set(hotVisible.map((x) => x.b.id)), [hotVisible])

  const visibleCandidates = useMemo(
    () => candidateBrands.filter((b) => getEntry(b.id).status !== 'deleted' && !hotShownIds.has(b.id)),
    [candidateBrands, getEntry, hotShownIds],
  )

  const isEmpty = visibleCandidates.length === 0
  const showRestLabel = !isEmpty && hotShownIds.size > 0

  return (
    <div className="py-12 pb-20">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-5">
        <div className="max-w-[640px] bg-cream px-[18px] py-4 text-[13px] leading-[1.7]">
          다른 에이전트가 웹 리서치로 찾아낸 브랜드 후보 목록이에요. 마음에 들면 DISCOVER로 옮기고, 직접 아는
          브랜드는 바로 추가하세요.
        </div>
        <button
          type="button"
          onClick={onOpenAddModal}
          className="shrink-0 border border-ink bg-ink px-6 py-3 text-[13px] font-medium text-bg hover:opacity-85"
        >
          + Add Brand
        </button>
      </div>

      {hotVisible.length > 0 && (
        <div className="mb-10 border-b border-line pb-9">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-[15px] font-semibold">🔥 이번 주 핫 브랜드</span>
            <span className="text-[11px] text-stone font-mono">
              {hotWeekRange ? `${formatHotDate(hotWeekRange.start)} – ${formatHotDate(hotWeekRange.end)}` : ''}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-x-7 gap-y-8 max-[860px]:grid-cols-2 max-[560px]:grid-cols-1">
            {hotVisible.map(({ h, b }) => (
              <div key={b.id} className="relative">
                <BrandCard
                  brand={b}
                  view="grid"
                  footer={<CandidateActions brand={b} />}
                  onClick={() => onOpenBrand(b.id)}
                  rankBadge={
                    <div
                      className="hot-rank-badge absolute top-2.5 left-2.5 z-5 flex h-[38px] w-[38px] cursor-default items-center justify-center rounded-full border-2 border-bg bg-blue text-lg font-bold text-white shadow-[0_1px_4px_rgba(5,7,7,0.35)] font-mono"
                      data-tooltip={`총 언급 ${h.mention_count}회`}
                    >
                      {h.rank}
                    </div>
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-6 text-[11px] leading-[1.5] text-stone-light">
            인스타그램·틱톡 언급량 기준 집계 (참고용 — 일반 단어와 겹치는 브랜드명은 오탐 가능)
          </div>
        </div>
      )}

      {showRestLabel && (
        <div className="mb-5 text-[11px] tracking-[0.04em] text-stone uppercase font-mono">전체 후보</div>
      )}

      {isEmpty ? (
        <div className="py-20 text-center text-sm text-stone">아직 등록된 후보 브랜드가 없어요.</div>
      ) : (
        <div className="grid grid-cols-3 gap-x-7 gap-y-8 max-[860px]:grid-cols-2 max-[560px]:grid-cols-1">
          {visibleCandidates.map((b) => (
            <BrandCard
              key={b.id}
              brand={b}
              view="grid"
              footer={<CandidateActions brand={b} />}
              onClick={() => onOpenBrand(b.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
