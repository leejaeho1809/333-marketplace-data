import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useMarketplace, loadUsername } from '@/context/MarketplaceProvider'
import { extractImageFromDrop } from '@/lib/imageDrop'
import { DELETE_REASONS } from '@/types/marketplace'
import type { Brand } from '@/types/marketplace'

const STAGE_LABELS: Record<string, string> = {
  EARLY_SIGNAL: 'EARLY SIGNAL',
  EMERGING: 'EMERGING',
  BREAKOUT: 'BREAKOUT',
  MAINSTREAMING: 'MAINSTREAMING',
}

function WhyNowSection({ brand }: { brand: Brand }) {
  if (!brand.momentumStage) return null
  const stageClass =
    brand.momentumStage === 'EARLY_SIGNAL'
      ? 'border-stone text-stone'
      : brand.momentumStage === 'EMERGING'
        ? 'border-blue text-blue'
        : brand.momentumStage === 'BREAKOUT'
          ? 'border-ink bg-ink text-bg'
          : 'border-stone-light text-stone-light'
  return (
    <div className="mt-8 border-t border-line pt-6">
      <div className="mb-3.5 text-[11px] tracking-[0.04em] text-stone uppercase">Why Now</div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={'border px-3 py-1.5 text-[10.5px] tracking-[0.03em] uppercase font-mono ' + stageClass}>
          {STAGE_LABELS[brand.momentumStage] || brand.momentumStage}
        </span>
        {brand.reSurfaced && (
          <span className="border border-cream bg-cream px-3 py-1.5 text-[10.5px] tracking-[0.03em] text-[#9a8f4f] uppercase font-mono">
            RE-SURFACED
          </span>
        )}
      </div>
      {brand.whyNow && <div className="mt-3.5 text-[13.5px] leading-[1.75]">{brand.whyNow}</div>}
      {brand.reSurfaced && brand.reSurfacedReason && (
        <div className="mt-2 text-[12.5px] leading-[1.65] text-[#9a8f4f]">{brand.reSurfacedReason}</div>
      )}
      {brand.trendSignals && brand.trendSignals.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5">
          {brand.trendSignals.map((s, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-line pb-2.5 last:border-b-0 last:pb-0">
              <span className="shrink-0 text-[10.5px] text-blue font-mono">{s.platform || ''}</span>
              <span className="shrink-0 text-[10.5px] text-stone-light font-mono">{s.date || ''}</span>
              <span className="min-w-[180px] flex-1 text-[12.5px] leading-[1.55] text-stone">{s.evidence || ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function DetailModal({
  brandId,
  onClose,
  onEdit,
  lock,
  unlock,
}: {
  brandId: string | null
  onClose: () => void
  onEdit: (id: string) => void
  lock: () => void
  unlock: () => void
}) {
  const {
    findBrandById,
    getEntry,
    addComment,
    deleteComment,
    setStatus,
    setDeleteReason,
    getImgSrc,
    getBsImg,
    setHeroImage,
    clearImage,
    setBsImage,
    clearBsImage,
    removeCustomBrand,
  } = useMarketplace()

  const scrollRef = useRef<HTMLDivElement>(null)
  const prevIdRef = useRef<string | null>(null)
  const [commentAuthor, setCommentAuthor] = useState('')
  const [commentText, setCommentText] = useState('')
  const [heroDragOver, setHeroDragOver] = useState(false)
  const [heroLoaded, setHeroLoaded] = useState(false)
  const [bsDragOverIdx, setBsDragOverIdx] = useState<number | null>(null)

  useEffect(() => {
    if (brandId) lock()
    else unlock()
  }, [brandId, lock, unlock])

  /* Reset scroll position and the comment draft only when the modal is
     switching to a different brand (or opening fresh) — an in-place refresh
     of the same brand (a realtime update, or this file's own writes) must
     never yank the viewer back to the top or wipe what they're mid-typing. */
  useEffect(() => {
    if (brandId && brandId !== prevIdRef.current) {
      scrollRef.current?.scrollTo(0, 0)
      setCommentAuthor(loadUsername())
      setCommentText('')
    }
    prevIdRef.current = brandId
  }, [brandId])

  const brand = brandId ? findBrandById(brandId) : undefined

  useEffect(() => {
    if (brandId && !brand) onClose() /* brand removed (e.g. by someone else) while this modal was open */
  }, [brandId, brand, onClose])

  const entry = brandId ? getEntry(brandId) : undefined
  const modalImgSrc = brand && entry ? getImgSrc(brand, entry) : null

  /* Same "hold at opacity:0 until actually loaded" rule as BrandCard's hero
     — swapping straight to opacity:100 lets the fallback initial show
     through for a frame while a freshly-set image is still decoding. */
  useEffect(() => {
    setHeroLoaded(false)
  }, [modalImgSrc])

  const sortedBestSellers = useMemo(() => {
    if (!brand?.bestSellers || !brandId) return []
    return brand.bestSellers
      .map((item, idx) => ({ item, idx }))
      .sort((a, c) => (getBsImg(brandId, c.idx) ? 1 : 0) - (getBsImg(brandId, a.idx) ? 1 : 0))
  }, [brand, brandId, getBsImg])

  if (!brandId || !brand || !entry) return null

  const id = brandId

  function handleHeroDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setHeroDragOver(false)
    extractImageFromDrop(e, (result) => {
      if (!result) {
        alert('이미지를 인식하지 못했어요. 이미지를 컴퓨터에 저장한 뒤 다시 드래그해보시거나, 다른 이미지로 시도해주세요.')
        return
      }
      setHeroImage(id, result)
    })
  }

  function handleBsDrop(e: DragEvent, idx: number) {
    e.preventDefault()
    e.stopPropagation()
    setBsDragOverIdx(null)
    extractImageFromDrop(e, (result) => {
      if (!result) {
        alert('이미지를 인식하지 못했어요. 다른 이미지로 시도해보세요.')
        return
      }
      setBsImage(id, idx, result)
    })
  }

  function submitComment() {
    addComment(id, commentAuthor, commentText)
    setCommentText('')
  }

  const sortedComments = entry!.comments.slice().sort((a, b) => b.ts - a.ts)

  return (
    <div
      className="fixed inset-0 z-100 flex items-start justify-center overflow-y-auto bg-ink/55 px-5 py-10 [overscroll-behavior:contain]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      ref={scrollRef}
    >
      <div className="mt-5 w-full max-w-[760px] bg-bg">
        <button
          type="button"
          onClick={onClose}
          className="ml-auto block cursor-pointer border-none bg-transparent px-5 pt-4 text-[22px] text-stone"
        >
          ×
        </button>

        <div
          className="group relative flex aspect-16/7 items-center justify-center bg-ink"
          onDragOver={(e) => {
            e.preventDefault()
            setHeroDragOver(true)
          }}
          onDragLeave={() => setHeroDragOver(false)}
          onDrop={handleHeroDrop}
        >
          <div className="font-brand text-[80px] font-normal text-white/92">{brand.name.charAt(0)}</div>
          {modalImgSrc && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img
              className={
                'absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ' +
                (heroLoaded ? 'opacity-100' : 'opacity-0')
              }
              src={modalImgSrc}
              alt={brand.name}
              onLoad={() => setHeroLoaded(true)}
              onError={(e) => (e.currentTarget as HTMLImageElement).remove()}
            />
          )}
          {modalImgSrc && (
            <button
              type="button"
              onClick={() => clearImage(brandId)}
              title="이미지 삭제"
              className="absolute top-2 right-2 z-3 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ink/60 text-sm leading-none text-white opacity-0 transition-opacity hover:bg-delete group-hover:opacity-100"
            >
              ×
            </button>
          )}
          <div
            className={
              'pointer-events-none absolute inset-0 flex items-center justify-center bg-ink/55 p-4 text-center text-xs text-white transition-opacity ' +
              (heroDragOver ? 'opacity-100' : 'opacity-0')
            }
          >
            이미지를 드래그해서 {modalImgSrc ? '변경' : '추가'}하세요
          </div>
        </div>

        <div className="px-9 pt-8 pb-10">
          <div className="text-[26px] font-semibold">{brand.name}</div>
          <div className="mt-1.5 text-[12.5px] text-stone font-mono">
            {brand.country} · {brand.category.join(' · ')}
          </div>
          <div className="mt-5 max-w-[560px] text-base leading-[1.7]">{brand.philosophy}</div>

          <WhyNowSection brand={brand} />

          <div className="mt-8 border-t border-line pt-6">
            <div className="mb-3.5 text-[11px] tracking-[0.04em] text-stone uppercase">Representative Products</div>
            <div className="flex flex-wrap gap-2.5">
              {brand.products.map((p, i) => (
                <div key={i} className="border border-line px-3 py-1.5 text-[12.5px]">
                  {p}
                </div>
              ))}
            </div>
          </div>

          {brand.bestSellers && brand.bestSellers.length > 0 && (
            <div className="mt-8 border-t border-line pt-6">
              <div className="mb-3.5 text-[11px] tracking-[0.04em] text-stone uppercase">Best Sellers</div>
              <div className="flex flex-col gap-5">
                {sortedBestSellers.map(({ item, idx }) => {
                  const bsImg = getBsImg(brandId, idx)
                  return (
                    <div key={idx} className="flex items-center gap-4.5">
                      <div
                        className="group relative flex h-[84px] w-[84px] shrink-0 cursor-pointer items-center justify-center overflow-hidden bg-ink"
                        onDragOver={(e) => {
                          e.preventDefault()
                          setBsDragOverIdx(idx)
                        }}
                        onDragLeave={() => setBsDragOverIdx((cur) => (cur === idx ? null : cur))}
                        onDrop={(e) => handleBsDrop(e, idx)}
                        style={
                          bsDragOverIdx === idx
                            ? { outline: '2px dashed var(--color-blue)', outlineOffset: '-4px' }
                            : undefined
                        }
                      >
                        {bsImg ? (
                          <>
                            {/* eslint-disable-next-line jsx-a11y/alt-text */}
                            <img className="absolute inset-0 h-full w-full object-cover" src={bsImg} alt={item.name} />
                            <button
                              type="button"
                              className="absolute top-1 right-1 z-2 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ink/75 text-[13px] leading-none text-white opacity-0 transition-opacity hover:bg-delete group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation()
                                clearBsImage(brandId, idx)
                              }}
                              title="이미지 삭제"
                            >
                              ×
                            </button>
                          </>
                        ) : (
                          <div className="font-brand text-[28px] text-white/85">{brand.name.charAt(0)}</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14.5px] font-semibold">{item.name}</div>
                        <div className="mt-1 text-[12.5px] text-stone">
                          {item.priceKRW ? (
                            <>
                              {item.priceLocal} <span className="text-blue">({item.priceKRW})</span>
                            </>
                          ) : (
                            item.priceLocal
                          )}
                        </div>
                      </div>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener"
                          className="shrink-0 border border-blue px-2.5 py-1.5 text-[11.5px] text-blue no-underline hover:bg-blue hover:text-white"
                        >
                          보기 ↗
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mt-8 border-t border-line pt-6">
            <div className="mb-3.5 text-[11px] tracking-[0.04em] text-stone uppercase">Potential at 333°</div>
            <div className="flex flex-wrap gap-2">
              {brand.potential.length > 0 ? (
                brand.potential.map((p, i) => (
                  <div key={i} className="border border-line px-3 py-1.5 text-xs text-stone">
                    {p}
                  </div>
                ))
              ) : (
                <div className="border border-stone-light px-3 py-1.5 text-xs text-stone-light font-mono">평가 대기</div>
              )}
            </div>
          </div>

          <div className="mt-8 border-t border-line pt-6">
            <div className="mb-3.5 text-[11px] tracking-[0.04em] text-stone uppercase">Official Links</div>
            <div className="mt-1.5 flex gap-4">
              <a href={brand.website} target="_blank" rel="noopener" className="text-[13px] text-blue no-underline hover:underline">
                Website ↗
              </a>
              {brand.instagram ? (
                <a href={brand.instagram} target="_blank" rel="noopener" className="text-[13px] text-blue no-underline hover:underline">
                  Instagram ↗
                </a>
              ) : (
                <span className="text-xs text-stone-light font-mono">Instagram 확인 필요</span>
              )}
            </div>
            <div className="mt-2.5 text-[12.5px] text-stone font-mono">출처: {brand.sourceNote}</div>
          </div>

          <div className="mt-8 border-t border-line pt-6">
            <div className="mb-3.5 text-[11px] tracking-[0.04em] text-stone uppercase">Comments</div>
            <div className="flex flex-col gap-3">
              {sortedComments.length === 0 ? (
                <div className="text-[13px] text-stone-light">아직 댓글이 없어요.</div>
              ) : (
                sortedComments.map((c) => {
                  const d = new Date(c.ts)
                  const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                  return (
                    <div key={c.ts} className="border-t border-line pt-2.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[12.5px] font-semibold">{c.author}</span>
                        <span className="flex items-baseline gap-2">
                          <span className="text-[11px] text-stone-light">{dateStr}</span>
                          <button
                            type="button"
                            className="-m-0.5 cursor-pointer border-none bg-transparent p-0.5 text-sm leading-none text-stone-light hover:text-delete"
                            onClick={() => deleteComment(brandId, c.ts)}
                            title="댓글 삭제"
                          >
                            ×
                          </button>
                        </span>
                      </div>
                      <div className="mt-1 text-[13.5px] leading-[1.6] whitespace-pre-wrap">{c.text}</div>
                    </div>
                  )
                })
              )}
            </div>
            <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
              <input
                type="text"
                placeholder="이름"
                value={commentAuthor}
                onChange={(e) => setCommentAuthor(e.target.value)}
                className="border border-line bg-bg px-3 py-2.5 text-[13px]"
              />
              <textarea
                placeholder="댓글을 남겨보세요"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="min-h-[60px] resize-y border border-line bg-bg px-3 py-2.5 text-[13px]"
              />
              <button
                type="button"
                onClick={submitComment}
                className="self-start border border-ink bg-ink px-4.5 py-2.5 text-[12.5px] font-medium text-white hover:opacity-85"
              >
                댓글 추가
              </button>
            </div>
          </div>

          <div className="mt-8 border-t border-line pt-6">
            <div className="mb-3.5 text-[11px] tracking-[0.04em] text-stone uppercase">Decision</div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => setStatus(brandId, 'saved')}
                className={
                  'border border-ink px-5 py-2.5 text-[13px] font-medium ' +
                  (entry.status === 'saved' ? 'bg-blue border-blue text-white' : 'text-ink')
                }
              >
                SAVE
              </button>
              <button
                type="button"
                onClick={() => setStatus(brandId, 'consider')}
                className={
                  'border border-ink px-5 py-2.5 text-[13px] font-medium ' +
                  (entry.status === 'consider' ? 'bg-ink text-bg' : 'text-ink')
                }
              >
                CONSIDER
              </button>
              <button
                type="button"
                onClick={() => setStatus(brandId, 'deleted')}
                className={
                  'border border-ink px-5 py-2.5 text-[13px] font-medium ' +
                  (entry.status === 'deleted' ? 'bg-delete border-delete text-white' : 'text-ink')
                }
              >
                DELETE
              </button>
            </div>
            {entry.status === 'deleted' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {DELETE_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setDeleteReason(brandId, r)}
                    className={
                      'border px-3 py-1.5 text-xs ' +
                      (entry.deleteReason === r ? 'border-delete text-delete' : 'border-line text-stone')
                    }
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => onEdit(brandId)}
              className="mt-3.5 block border border-line px-4 py-2.5 text-xs text-ink hover:border-blue hover:text-blue"
            >
              브랜드 정보 수정
            </button>
            {brand.custom && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('이 브랜드를 목록에서 완전히 삭제할까요?')) removeCustomBrand(brandId)
                }}
                className="mt-3.5 block cursor-pointer border-none bg-transparent p-0 text-[11.5px] text-stone-light underline hover:text-delete"
              >
                목록에서 완전히 삭제
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
