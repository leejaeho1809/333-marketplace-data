import { useEffect, useState, type DragEvent, type ReactNode } from 'react'
import { useMarketplace } from '@/context/MarketplaceProvider'
import { extractImageFromDrop } from '@/lib/imageDrop'
import type { Brand } from '@/types/marketplace'

/** Shared by the DISCOVER/SELECTED grid and the ADD BRAND candidates grid,
 * so both show items with the exact same card layout, image, and
 * click-to-open-modal behavior — only the footer content differs (status
 * badge vs. the candidate move/delete buttons). */
export function BrandCard({
  brand,
  view,
  footer,
  onClick,
  rankBadge,
}: {
  brand: Brand
  view: 'grid' | 'list'
  footer: ReactNode
  onClick: () => void
  rankBadge?: ReactNode
}) {
  const { getEntry, getImgSrc, setHeroImage, clearImage } = useMarketplace()
  const [dragOver, setDragOver] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const entry = getEntry(brand.id)
  const imgSrc = getImgSrc(brand, entry)

  /* The image is kept at opacity:0 until it has actually finished loading
     (see the `loaded` state below) — swapping straight to opacity:100
     lets the ink-black fallback initial show through mid-decode for a
     frame, since a still-loading <img> doesn't yet paint as fully opaque. */
  useEffect(() => {
    setLoaded(false)
  }, [imgSrc])

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }
  function handleDragLeave() {
    setDragOver(false)
  }
  function handleDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    extractImageFromDrop(e, (result) => {
      if (!result) {
        alert('이미지를 인식하지 못했어요. 이미지를 컴퓨터에 저장한 뒤 다시 드래그해보시거나, 다른 이미지로 시도해주세요.')
        return
      }
      setHeroImage(brand.id, result)
    })
  }

  const isList = view === 'list'

  return (
    <div
      className={
        isList
          ? 'flex cursor-pointer flex-row items-center gap-6 border-t border-line py-[18px] last:border-b'
          : 'cursor-pointer'
      }
      onClick={onClick}
    >
      <div
        className={
          'group relative overflow-hidden bg-ink ' +
          (isList ? 'flex aspect-auto w-[110px] shrink-0 items-end p-2.5' : 'flex aspect-4/5 w-full items-end p-5') +
          (dragOver ? ' outline-2 outline-dashed outline-blue -outline-offset-6' : '')
        }
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {rankBadge}
        <div className={'absolute inset-0 flex items-end ' + (isList ? 'p-2.5' : 'p-5')}>
          {!isList && (
            <div className="absolute top-4 left-5 text-[10px] tracking-[0.04em] text-white/55 font-mono">
              {brand.country}
            </div>
          )}
          <div>
            <div className={'font-brand text-white/92 font-normal ' + (isList ? 'text-[32px]' : 'text-[64px]')}>
              {brand.name.charAt(0)}
            </div>
          </div>
        </div>
        {imgSrc && (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img
            className={
              'absolute inset-0 z-[1] h-full w-full object-cover transition-opacity duration-300 ' +
              (loaded ? 'opacity-100' : 'opacity-0')
            }
            src={imgSrc}
            alt={brand.name}
            onLoad={() => setLoaded(true)}
            onError={(e) => (e.currentTarget as HTMLImageElement).remove()}
          />
        )}
        {imgSrc && (
          <button
            type="button"
            className="absolute top-2 right-2 z-3 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ink/60 text-sm leading-none text-white opacity-0 transition-opacity hover:bg-delete group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              clearImage(brand.id)
            }}
            title="이미지 삭제"
          >
            ×
          </button>
        )}
        <div
          className={
            'pointer-events-none absolute inset-0 z-2 flex items-center justify-center bg-ink/55 p-4 text-center text-xs text-white transition-opacity ' +
            (dragOver ? 'opacity-100' : 'opacity-0')
          }
        >
          이미지를 드래그해서 {imgSrc ? '변경' : '추가'}하세요
        </div>
      </div>

      <div className={isList ? 'min-w-0 flex-1' : 'pt-4'}>
        <div className="text-[19px] font-semibold">{brand.name}</div>
        <div className="mt-1 text-[11.5px] tracking-[0.02em] text-blue font-mono">
          {brand.country} · {brand.category.join(' · ')}
        </div>
        {!isList && <div className="mt-2.5 text-[13.5px] leading-[1.65] text-stone">{brand.philosophy}</div>}
        {brand.bestSellers && brand.bestSellers.length > 0 && (
          <div className="mt-2 text-[11.5px] font-medium text-blue">Best: {brand.bestSellers[0].name}</div>
        )}
        <div className={'flex items-center justify-between ' + (isList ? 'mt-2' : 'mt-3.5')}>{footer}</div>
      </div>
    </div>
  )
}
