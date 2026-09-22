import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useMarketplace } from '@/context/MarketplaceProvider'
import { extractImageFromDrop } from '@/lib/imageDrop'
import { CURRENCIES, CURRENCY_LABELS, computeKrw, formatLocalPrice, parsePriceLocal, type CurrencyCode } from '@/lib/currency'
import { CATEGORIES } from '@/types/marketplace'
import type { Brand, BestSeller } from '@/types/marketplace'

interface BsRow {
  name: string
  amount: string
  currency: CurrencyCode
  url: string
}

const EMPTY_ROW: BsRow = { name: '', amount: '', currency: 'KRW', url: '' }

function blankForm() {
  return {
    name: '',
    country: '',
    cats: [] as string[],
    phil: '',
    products: '',
    website: '',
    instagram: '',
    bs: [{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }] as BsRow[],
  }
}

export function AddEditBrandModal({
  open,
  editId,
  onClose,
  lock,
  unlock,
}: {
  open: boolean
  editId: string | null
  onClose: () => void
  lock: () => void
  unlock: () => void
}) {
  const { findBrandById, getEntry, getImgSrc, saveNewBrand, saveEditedBrand, setHeroImage, showToast } = useMarketplace()

  const [form, setForm] = useState(blankForm())
  const [error, setError] = useState('')
  const [existingImgSrc, setExistingImgSrc] = useState<string | null>(null)
  const [previewOverride, setPreviewOverride] = useState<string | null>(null)
  const [previewCleared, setPreviewCleared] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const existingBsRef = useRef<BestSeller[]>([])

  useEffect(() => {
    if (!open) return
    lock()
    setError('')
    setPreviewOverride(null)
    setPreviewCleared(false)

    if (editId) {
      const b = findBrandById(editId)
      if (b) {
        setForm({
          name: b.name,
          country: b.country,
          cats: b.category.slice(),
          phil: b.philosophy,
          products: b.products.join(', '),
          website: b.website && b.website !== '#' ? b.website : '',
          instagram: b.instagram || '',
          bs: [0, 1, 2].map((i): BsRow => {
            const item = b.bestSellers?.[i]
            const parsed = item ? parsePriceLocal(item.priceLocal) : null
            return {
              name: item ? item.name : '',
              url: item?.url || '',
              amount: parsed ? parsed.amount : '',
              currency: parsed ? parsed.currency : 'KRW',
            }
          }),
        })
        existingBsRef.current = b.bestSellers || []
        const entry = getEntry(editId)
        setExistingImgSrc(getImgSrc(b, entry))
        return
      }
    }
    setForm(blankForm())
    existingBsRef.current = []
    setExistingImgSrc(null)
  }, [open, editId, findBrandById, getEntry, getImgSrc, lock])

  useEffect(() => {
    if (!open) unlock()
  }, [open, unlock])

  if (!open) return null

  const editing = !!editId

  function updateBsRow(i: number, patch: Partial<BsRow>) {
    setForm((f) => ({ ...f, bs: f.bs.map((row, idx) => (idx === i ? { ...row, ...patch } : row)) }))
  }

  function toggleCat(c: string) {
    setForm((f) => ({
      ...f,
      cats: f.cats.includes(c) ? f.cats.filter((x) => x !== c) : [...f.cats, c],
    }))
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    extractImageFromDrop(e, (result) => {
      if (!result) {
        alert('이미지를 인식하지 못했어요. 다른 이미지로 시도해보세요.')
        return
      }
      setPreviewOverride(result)
      setPreviewCleared(false)
    })
  }

  function buildBestSellers(): BestSeller[] {
    const out: BestSeller[] = []
    form.bs.forEach((row, i) => {
      const bn = row.name.trim()
      if (!bn) return
      const bAmt = row.amount.trim()
      const bu = row.url.trim()
      if (bAmt) {
        out.push({
          name: bn,
          priceLocal: formatLocalPrice(bAmt, row.currency),
          priceKRW: computeKrw(bAmt, row.currency),
          url: bu || null,
        })
      } else {
        const prev = existingBsRef.current[i]
        out.push({
          name: bn,
          priceLocal: prev ? prev.priceLocal : '가격 확인 필요',
          priceKRW: prev ? prev.priceKRW : null,
          url: bu || (prev ? prev.url : null),
        })
      }
    })
    return out
  }

  function handleDiscard() {
    onClose()
  }

  function handleSubmit(mode: 'saved' | 'list') {
    const name = form.name.trim()
    if (!name) {
      setError('브랜드명은 필수예요.')
      return
    }
    const country = form.country.trim()
    const phil = form.phil.trim()
    const website = form.website.trim()
    const instagram = form.instagram.trim()
    const productsArr = form.products
      .trim()
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    const category = form.cats.length ? form.cats.slice() : ['LIFESTYLE']
    const bestSellers = buildBestSellers()

    if (editId) {
      const existing = findBrandById(editId)
      const updatedBrand: Brand = {
        ...(existing as Brand),
        id: editId,
        name,
        country: country || '미상',
        category,
        philosophy: phil || '(소개 문구 미입력)',
        products: productsArr,
        website: website || '#',
        instagram: instagram || null,
        bestSellers,
      }
      saveEditedBrand(updatedBrand)
      if (previewOverride) setHeroImage(editId, previewOverride)
      onClose()
      showToast('저장됐어요')
      return
    }

    const id =
      'custom-' +
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') +
      '-' +
      Date.now()

    const brand: Brand = {
      id,
      name,
      country: country || '미상',
      category,
      philosophy: phil || '(소개 문구 미입력)',
      website: website || '#',
      instagram: instagram || null,
      products: productsArr,
      bestSellers,
      scores: null,
      whyFits: null,
      potential: [],
      imageLabel: name.toUpperCase(),
      sourceNote: '직접 입력한 브랜드',
      custom: true,
    }

    saveNewBrand(brand, mode === 'saved' ? 'saved' : null)
    if (previewOverride) setHeroImage(id, previewOverride)
    onClose()
    showToast('추가됐어요')
  }

  const previewSrc = previewCleared ? null : previewOverride || existingImgSrc

  return (
    <div
      className="fixed inset-0 z-100 flex items-start justify-center overflow-y-auto bg-ink/55 px-5 py-10 [overscroll-behavior:contain]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="mt-5 w-full max-w-[520px] bg-bg">
        <button
          type="button"
          onClick={onClose}
          className="ml-auto block cursor-pointer border-none bg-transparent px-5 pt-4 text-[22px] text-stone"
        >
          ×
        </button>
        <div className="px-9 pt-2 pb-10">
          <div className="text-[26px] font-semibold">{editing ? '브랜드 정보 수정' : '브랜드 추가'}</div>

          <div
            className="group relative mt-5 flex aspect-16/8 cursor-pointer items-center justify-center overflow-hidden bg-ink"
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={dragOver ? { outline: '2px dashed var(--color-blue)', outlineOffset: '-6px' } : undefined}
          >
            {previewSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <img className="absolute inset-0 h-full w-full object-cover" src={previewSrc} />
            ) : (
              <div className="text-center text-xs leading-[1.6] text-white/60">
                이미지를 여기로 드래그
                <br />
                <span className="text-[10.5px] text-white/35">(선택 사항)</span>
              </div>
            )}
            {previewSrc && (
              <button
                type="button"
                className="absolute top-2 right-2 z-3 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ink/60 text-sm leading-none text-white opacity-100 hover:bg-delete"
                onClick={(e) => {
                  e.stopPropagation()
                  setPreviewOverride(null)
                  setPreviewCleared(true)
                }}
                title="이미지 삭제"
              >
                ×
              </button>
            )}
          </div>

          <div className="mt-4.5 flex flex-col gap-2.5">
            <input
              type="text"
              placeholder="브랜드명 *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="border border-line bg-bg px-3.5 py-2.5 text-[13.5px] placeholder:text-stone-light"
            />
            <input
              type="text"
              placeholder="국가 (예: Japan / Tokyo)"
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              className="border border-line bg-bg px-3.5 py-2.5 text-[13.5px] placeholder:text-stone-light"
            />
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.filter((c) => c !== 'ALL').map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCat(c)}
                  className={
                    'border px-2.5 py-1.5 text-[10.5px] font-mono ' +
                    (form.cats.includes(c) ? 'border-blue text-blue' : 'border-line text-stone')
                  }
                >
                  {c}
                </button>
              ))}
            </div>
            <textarea
              placeholder="한 줄 철학 / 소개"
              rows={2}
              value={form.phil}
              onChange={(e) => setForm((f) => ({ ...f, phil: e.target.value }))}
              className="resize-y border border-line bg-bg px-3.5 py-2.5 text-[13.5px] placeholder:text-stone-light"
            />
            <input
              type="text"
              placeholder="대표 제품 (쉼표로 구분)"
              value={form.products}
              onChange={(e) => setForm((f) => ({ ...f, products: e.target.value }))}
              className="border border-line bg-bg px-3.5 py-2.5 text-[13.5px] placeholder:text-stone-light"
            />
            <input
              type="text"
              placeholder="공식 웹사이트 URL"
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              className="border border-line bg-bg px-3.5 py-2.5 text-[13.5px] placeholder:text-stone-light"
            />
            <input
              type="text"
              placeholder="Instagram URL (선택)"
              value={form.instagram}
              onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))}
              className="border border-line bg-bg px-3.5 py-2.5 text-[13.5px] placeholder:text-stone-light"
            />

            <div className="mt-2 text-[11px] tracking-[0.03em] text-stone uppercase">Best Sellers (선택, 최대 3개)</div>
            {form.bs.map((row, i) => {
              const krw = row.amount ? computeKrw(row.amount, row.currency) : null
              const preview = row.amount && krw ? `${formatLocalPrice(row.amount, row.currency)}  →  ${krw}` : ''
              return (
                <div key={i} className="flex flex-col gap-1">
                  <div className="grid grid-cols-[1fr_0.7fr_0.8fr_1fr] gap-2">
                    <input
                      type="text"
                      placeholder="제품명"
                      value={row.name}
                      onChange={(e) => updateBsRow(i, { name: e.target.value })}
                      className="border border-line bg-bg px-2.5 py-2 text-[12.5px]"
                    />
                    <input
                      type="number"
                      placeholder="금액"
                      value={row.amount}
                      onChange={(e) => updateBsRow(i, { amount: e.target.value })}
                      className="border border-line bg-bg px-2.5 py-2 text-[12.5px]"
                    />
                    <select
                      value={row.currency}
                      onChange={(e) => updateBsRow(i, { currency: e.target.value as CurrencyCode })}
                      className="border border-line bg-bg px-2.5 py-2 text-[12.5px]"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {CURRENCY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="상세페이지 URL"
                      value={row.url}
                      onChange={(e) => updateBsRow(i, { url: e.target.value })}
                      className="border border-line bg-bg px-2.5 py-2 text-[12.5px]"
                    />
                  </div>
                  <div className="-mt-1 min-h-[14px] text-[11px] text-blue">{preview}</div>
                </div>
              )
            })}

            <div className="min-h-[16px] text-xs text-delete">{error}</div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => handleSubmit('saved')}
              className="border border-ink bg-transparent px-5 py-2.5 text-[13px] font-medium text-ink"
            >
              저장
            </button>
            {!editing && (
              <button
                type="button"
                onClick={() => handleSubmit('list')}
                className="border border-ink bg-transparent px-5 py-2.5 text-[13px] font-medium text-ink"
              >
                리스트업
              </button>
            )}
            <button
              type="button"
              onClick={handleDiscard}
              className="border border-ink bg-transparent px-5 py-2.5 text-[13px] font-medium text-ink"
            >
              {editing ? '취소' : '삭제'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
