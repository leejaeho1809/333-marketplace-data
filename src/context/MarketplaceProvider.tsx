import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '@/utils/supabase'
import type { Brand, BrandEntry, BrandRow, Comment, HotBrandRow } from '@/types/marketplace'

const IMAGE_BUCKET = 'brand-images'
const USERNAME_KEY = 'brand333_username'

/* ---------------------------------------------------------------------- */
/* state                                                                   */
/* ---------------------------------------------------------------------- */

interface State {
  loaded: boolean
  brands: Brand[]
  candidateBrands: Brand[]
  store: Record<string, BrandEntry>
  imageCache: Record<string, string>
  hotBrands: HotBrandRow[]
  hotWeekRange: { start: string; end: string } | null
}

const initialState: State = {
  loaded: false,
  brands: [],
  candidateBrands: [],
  store: {},
  imageCache: {},
  hotBrands: [],
  hotWeekRange: null,
}

const EMPTY_ENTRY: BrandEntry = { status: null, deleteReason: null, comments: [], imageCleared: false, customImage: null }

type Action =
  | {
      type: 'loadAll'
      store: Record<string, BrandEntry>
      brands: Brand[]
      candidateBrands: Brand[]
      imageCache: Record<string, string>
      hotBrands: HotBrandRow[]
      hotWeekRange: { start: string; end: string } | null
    }
  | { type: 'setEntry'; id: string; entry: BrandEntry }
  | { type: 'removeEntry'; id: string }
  | { type: 'setBrandRow'; id: string; row: BrandRow | null }
  /* Optimistic local moves, ahead of the DB round trip / realtime echo. */
  | { type: 'addBrandLocal'; brand: Brand; candidate?: boolean }
  | { type: 'moveCandidateLocal'; id: string }
  | { type: 'removeBrandLocal'; id: string }
  | { type: 'setImage'; key: string; url: string }
  | { type: 'removeImage'; key: string }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loadAll':
      return {
        loaded: true,
        brands: action.brands,
        candidateBrands: action.candidateBrands,
        store: action.store,
        imageCache: action.imageCache,
        hotBrands: action.hotBrands,
        hotWeekRange: action.hotWeekRange,
      }
    case 'setEntry':
      return { ...state, store: { ...state.store, [action.id]: action.entry } }
    case 'removeEntry': {
      const next = { ...state.store }
      delete next[action.id]
      return { ...state, store: next }
    }
    case 'setBrandRow': {
      const brands = state.brands.filter((b) => b.id !== action.id)
      const candidateBrands = state.candidateBrands.filter((b) => b.id !== action.id)
      if (!action.row) return { ...state, brands, candidateBrands }
      if (action.row.is_candidate) {
        return { ...state, brands, candidateBrands: [...candidateBrands, action.row.data] }
      }
      return { ...state, brands: [...brands, action.row.data], candidateBrands }
    }
    case 'addBrandLocal':
      return action.candidate
        ? { ...state, candidateBrands: [...state.candidateBrands, action.brand] }
        : { ...state, brands: [...state.brands, action.brand] }
    case 'moveCandidateLocal': {
      const candidate = state.candidateBrands.find((c) => c.id === action.id)
      if (!candidate) return state
      return {
        ...state,
        candidateBrands: state.candidateBrands.filter((c) => c.id !== action.id),
        brands: [...state.brands, candidate],
      }
    }
    case 'removeBrandLocal':
      return {
        ...state,
        brands: state.brands.filter((b) => b.id !== action.id),
        candidateBrands: state.candidateBrands.filter((b) => b.id !== action.id),
      }
    case 'setImage':
      return { ...state, imageCache: { ...state.imageCache, [action.key]: action.url } }
    case 'removeImage': {
      const next = { ...state.imageCache }
      delete next[action.key]
      return { ...state, imageCache: next }
    }
    default:
      return state
  }
}

/* ---------------------------------------------------------------------- */
/* paginated fetch                                                        */
/* ---------------------------------------------------------------------- */

/* PostgREST silently caps an unranged `select('*')` at its configured
   max-rows (1000 on this project) — past that, rows are dropped with no
   error, so tables that can grow past 1000 (brand_images in particular,
   since every brand contributes up to 4 rows) must be paged through
   explicitly instead of trusting a single select to return everything. */
const FETCH_PAGE_SIZE = 1000

async function fetchAllRows<T = Record<string, unknown>>(table: string) {
  const rows: T[] = []
  let from = 0
  while (true) {
    const res = await supabase
      .from(table)
      .select('*')
      .range(from, from + FETCH_PAGE_SIZE - 1)
    if (res.error) return { data: rows, error: res.error }
    const page = (res.data as T[] | null) || []
    rows.push(...page)
    if (page.length < FETCH_PAGE_SIZE) break
    from += FETCH_PAGE_SIZE
  }
  return { data: rows, error: null }
}

/* ---------------------------------------------------------------------- */
/* entry row <-> BrandEntry                                               */
/* ---------------------------------------------------------------------- */

function entryRowToJs(row: {
  status: string | null
  delete_reason: string | null
  comments: Comment[] | null
  image_cleared: boolean | null
  custom_image: string | null
}): BrandEntry {
  return {
    status: (row.status as BrandEntry['status']) || null,
    deleteReason: row.delete_reason || null,
    comments: row.comments || [],
    imageCleared: !!row.image_cleared,
    customImage: row.custom_image || null,
  }
}

function entryJsToRow(id: string, e: BrandEntry) {
  return {
    id,
    status: e.status || null,
    delete_reason: e.deleteReason || null,
    comments: e.comments || [],
    image_cleared: !!e.imageCleared,
    custom_image: e.customImage || null,
  }
}

function imagePublicUrl(key: string, updatedAt?: string | number | null) {
  const url = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(key).data.publicUrl
  const v = updatedAt ? new Date(updatedAt).getTime() : Date.now()
  return url + (url.indexOf('?') === -1 ? '?' : '&') + 'v=' + v
}

export function loadUsername(): string {
  try {
    return localStorage.getItem(USERNAME_KEY) || ''
  } catch {
    return ''
  }
}
function saveUsername(name: string) {
  try {
    localStorage.setItem(USERNAME_KEY, name)
  } catch {
    /* ignore */
  }
}

/* ---------------------------------------------------------------------- */
/* context                                                                 */
/* ---------------------------------------------------------------------- */

interface MarketplaceContextValue {
  loaded: boolean
  brands: Brand[]
  candidateBrands: Brand[]
  imageCache: Record<string, string>
  hotBrands: HotBrandRow[]
  hotWeekRange: { start: string; end: string } | null
  toast: string | null
  showToast: (msg: string) => void

  getEntry: (id: string) => BrandEntry
  findBrandById: (id: string) => Brand | undefined

  addComment: (id: string, author: string, text: string) => void
  deleteComment: (id: string, ts: number) => void
  setStatus: (id: string, status: 'saved' | 'consider' | 'deleted') => void
  setDeleteReason: (id: string, reason: string) => void

  getImgSrc: (b: Brand, entry: BrandEntry) => string | null
  hasReliableImage: (b: Brand, entry: BrandEntry) => boolean
  getBsImg: (brandId: string, idx: number) => string | null
  setHeroImage: (id: string, dataUrl: string) => void
  clearImage: (id: string) => void
  setBsImage: (id: string, idx: number, dataUrl: string) => void
  clearBsImage: (id: string, idx: number) => void

  saveNewBrand: (brand: Brand, initialStatus?: 'saved' | null) => void
  saveEditedBrand: (brand: Brand) => void
  moveCandidateToDiscover: (id: string) => void
  deleteCandidate: (id: string) => void
  removeCustomBrand: (id: string) => void
}

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null)

export function useMarketplace() {
  const ctx = useContext(MarketplaceContext)
  if (!ctx) throw new Error('useMarketplace must be used within MarketplaceProvider')
  return ctx
}

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1800)
  }

  /* Plain functions, all closing directly over `state` — recreated on every
     render like the rest of this component body, so they're never stale.
     (Deliberately not wrapped in useCallback/useRef: this provider already
     re-renders on every state change, so memoizing them would need `state`
     in the dependency array to stay correct anyway, which defeats the
     purpose — and reading a ref's `.current` during another component's
     render, which several of these are, is the one pattern actually worth
     avoiding.) */

  const getEntry = (id: string): BrandEntry => state.store[id] || EMPTY_ENTRY
  const findBrandById = (id: string): Brand | undefined =>
    state.brands.find((b) => b.id === id) || state.candidateBrands.find((b) => b.id === id)

  function writeEntry(id: string, entry: BrandEntry) {
    dispatch({ type: 'setEntry', id, entry })
    supabase
      .from('brand_entries')
      .upsert(entryJsToRow(id, entry))
      .then((res) => {
        if (res.error) {
          console.error('failed to save entry', res.error)
          alert('저장에 실패했어요 (인터넷 연결을 확인해주세요).')
        }
      })
  }

  function addComment(id: string, authorInput: string, text: string) {
    const author = authorInput.trim() || '익명'
    const trimmed = text.trim()
    if (!trimmed) return
    const entry = getEntry(id)
    writeEntry(id, { ...entry, comments: [...entry.comments, { author, text: trimmed, ts: Date.now() }] })
    saveUsername(author)
  }

  function deleteComment(id: string, ts: number) {
    if (!confirm('이 댓글을 삭제할까요?')) return
    const entry = getEntry(id)
    writeEntry(id, { ...entry, comments: entry.comments.filter((c) => c.ts !== ts) })
  }

  function setStatus(id: string, status: 'saved' | 'consider' | 'deleted') {
    const entry = getEntry(id)
    const nextStatus = entry.status === status ? null : status
    if (navigator.vibrate) navigator.vibrate(status === 'deleted' ? [20, 30, 20] : 15)
    writeEntry(id, {
      ...entry,
      status: nextStatus,
      deleteReason: nextStatus !== 'deleted' ? null : entry.deleteReason,
    })
  }

  function setDeleteReason(id: string, reason: string) {
    const entry = getEntry(id)
    writeEntry(id, { ...entry, deleteReason: entry.deleteReason === reason ? null : reason })
  }

  /* ---- images ---- */

  function getImgSrc(b: Brand, entry: BrandEntry) {
    if (entry.imageCleared) return null
    return state.imageCache['hero:' + b.id] || null
  }
  function hasReliableImage(b: Brand, entry: BrandEntry) {
    if (entry.imageCleared) return false
    return !!state.imageCache['hero:' + b.id]
  }
  function getBsImg(brandId: string, idx: number) {
    return state.imageCache['bs:' + brandId + ':' + idx] || null
  }

  function uploadImage(key: string, dataUrlOrHttpUrl: string, onDone?: () => void) {
    dispatch({ type: 'setImage', key, url: dataUrlOrHttpUrl }) /* optimistic preview */
    fetch(dataUrlOrHttpUrl)
      .then((res) => res.blob())
      .then((blob) =>
        supabase.storage
          .from(IMAGE_BUCKET)
          .upload(key, blob, { upsert: true, contentType: blob.type || 'image/jpeg' }),
      )
      .then((res) => {
        if (res.error) throw res.error
        return supabase.from('brand_images').upsert({ id: key })
      })
      .then((res) => {
        if (res && 'error' in res && res.error) throw res.error
        dispatch({ type: 'setImage', key, url: imagePublicUrl(key, Date.now()) })
        onDone?.()
      })
      .catch(() => {
        alert('이미지 저장에 실패했어요. 다른 이미지로 시도해보시거나, 브라우저 저장 공간을 확인해주세요.')
      })
  }

  function removeImage(key: string, onDone?: () => void) {
    dispatch({ type: 'removeImage', key })
    Promise.all([
      supabase.storage.from(IMAGE_BUCKET).remove([key]),
      supabase.from('brand_images').delete().eq('id', key),
    ])
      .then(() => onDone?.())
      .catch(() => {
        /* best-effort, matches original idbDelete().catch(function(){}) */
      })
  }

  function setHeroImage(id: string, dataUrl: string) {
    uploadImage('hero:' + id, dataUrl)
    const entry = getEntry(id)
    if (entry.imageCleared) writeEntry(id, { ...entry, imageCleared: false })
  }

  function clearImage(id: string) {
    const entry = getEntry(id)
    writeEntry(id, { ...entry, imageCleared: true })
    removeImage('hero:' + id)
  }

  function setBsImage(id: string, idx: number, dataUrl: string) {
    uploadImage('bs:' + id + ':' + idx, dataUrl)
  }

  function clearBsImage(id: string, idx: number) {
    removeImage('bs:' + id + ':' + idx)
  }

  /* ---- brand CRUD ---- */

  function upsertBrandRemote(brand: Brand, onError?: () => void) {
    supabase.rpc('upsert_brand', { brand }).then((res) => {
      if (res.error) {
        console.error('failed to save brand', res.error)
        onError?.()
      }
    })
  }

  function saveNewBrand(brand: Brand, initialStatus?: 'saved' | null) {
    dispatch({ type: 'addBrandLocal', brand })
    upsertBrandRemote(brand, () => alert('저장에 실패했어요 (인터넷 연결을 확인해주세요).'))
    if (initialStatus) writeEntry(brand.id, { ...EMPTY_ENTRY, status: initialStatus })
  }

  /** Edits either a DISCOVER/SELECTED brand or an ADD BRAND candidate — same
   * RPC either way; which local list gets updated depends on where the id
   * currently lives, so editing a candidate never implicitly promotes it to
   * DISCOVER. */
  function saveEditedBrand(brand: Brand) {
    const isCandidate = state.candidateBrands.some((c) => c.id === brand.id)
    dispatch({ type: 'setBrandRow', id: brand.id, row: { id: brand.id, is_candidate: isCandidate, data: brand } })
    upsertBrandRemote(brand, () => alert('저장에 실패했어요 (인터넷 연결을 확인해주세요).'))
  }

  function moveCandidateToDiscover(id: string) {
    const candidate = state.candidateBrands.find((c) => c.id === id)
    if (!candidate) return
    dispatch({ type: 'moveCandidateLocal', id })
    supabase
      .from('brands')
      .update({ is_candidate: false })
      .eq('id', id)
      .then((res) => {
        if (res.error) {
          console.error('failed to move candidate to discover', res.error)
          alert('이동에 실패했어요 (인터넷 연결을 확인해주세요).')
        }
      })
    showToast(candidate.name + '을(를) DISCOVER로 옮겼어요')
  }

  /** Soft delete only — marks it via brand_entries.status like DISCOVER's
   * DELETE button does, instead of removing the brands row. The data (and
   * its images) stays recoverable in Supabase; it just stops rendering in
   * the ADD BRAND tab. */
  function deleteCandidate(id: string) {
    const candidate = state.candidateBrands.find((c) => c.id === id)
    if (!candidate) return
    if (!confirm(candidate.name + ' 후보를 목록에서 삭제할까요?')) return
    const entry = getEntry(id)
    writeEntry(id, { ...entry, status: 'deleted' })
    showToast(candidate.name + ' 후보를 삭제했어요')
  }

  function removeCustomBrand(id: string) {
    dispatch({ type: 'removeBrandLocal', id })
    dispatch({ type: 'removeEntry', id })
    supabase
      .from('brands')
      .delete()
      .eq('id', id)
      .then((res) => {
        if (res.error) console.error('failed to delete brand', res.error)
      })
    supabase
      .from('brand_entries')
      .delete()
      .eq('id', id)
      .then((res) => {
        if (res.error) console.error('failed to delete brand entry', res.error)
      })
  }

  /* ---- initial load + realtime sync ---- */

  useEffect(() => {
    let cancelled = false

    function refetchBrand(id: string | null) {
      if (!id) return
      supabase
        .from('brands_view')
        .select('*')
        .eq('id', id)
        .then((res) => {
          if (cancelled) return
          if (res.error) {
            console.error('refetch brand failed', res.error)
            return
          }
          const row = (res.data as BrandRow[] | null)?.[0] || null
          dispatch({ type: 'setBrandRow', id, row })
        })
    }

    function loadAll() {
      Promise.all([
        fetchAllRows<{
          id: string
          status: string | null
          delete_reason: string | null
          comments: Comment[] | null
          image_cleared: boolean | null
          custom_image: string | null
        }>('brand_entries'),
        fetchAllRows<BrandRow>('brands_view'),
        fetchAllRows<{ id: string; updated_at: string }>('brand_images'),
        supabase
          .from('brand_weekly_hot')
          .select('*')
          .order('week_start', { ascending: false })
          .order('rank', { ascending: true })
          .limit(300),
      ]).then(([entriesRes, brandsRes, imagesRes, hotRes]) => {
        if (cancelled) return
        for (const r of [entriesRes, brandsRes, imagesRes, hotRes]) {
          if (r.error) {
            console.error('initial load error', r.error)
            return
          }
        }

        const store: Record<string, BrandEntry> = {}
        for (const row of entriesRes.data || []) {
          store[row.id] = entryRowToJs(row)
        }

        const brands: Brand[] = []
        const candidateBrands: Brand[] = []
        for (const row of (brandsRes.data || []) as BrandRow[]) {
          if (row.is_candidate) candidateBrands.push(row.data)
          else brands.push(row.data)
        }

        const imageCache: Record<string, string> = {}
        for (const row of imagesRes.data || []) {
          imageCache[row.id] = imagePublicUrl(row.id, row.updated_at)
        }

        /* Already sorted week_start desc, rank asc — take the leading run
           belonging to the latest week_start, capped at 5 for display. */
        const hotRows = (hotRes.data || []) as HotBrandRow[]
        const latestWeekStart = hotRows.length ? hotRows[0].week_start : null
        const hotBrands = latestWeekStart
          ? hotRows.filter((r) => r.week_start === latestWeekStart).slice(0, 5)
          : []
        const hotWeekRange = latestWeekStart
          ? { start: latestWeekStart, end: hotRows[0].week_end }
          : null

        dispatch({ type: 'loadAll', store, brands, candidateBrands, imageCache, hotBrands, hotWeekRange })
      })
    }

    loadAll()

    type PgChange<T extends Record<string, unknown>> = RealtimePostgresChangesPayload<T>

    const channel = supabase
      .channel('marketplace-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'brand_entries' },
        (payload: PgChange<{ id: string }>) => {
          if (cancelled) return
          const id = payload.eventType === 'DELETE' ? payload.old.id : payload.new.id
          if (!id) return
          if (payload.eventType === 'DELETE') {
            dispatch({ type: 'removeEntry', id })
          } else {
            dispatch({
              type: 'setEntry',
              id,
              entry: entryRowToJs(
                payload.new as unknown as Parameters<typeof entryRowToJs>[0],
              ),
            })
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'brands' },
        (payload: PgChange<{ id: string }>) => {
          if (cancelled) return
          refetchBrand(payload.eventType === 'DELETE' ? (payload.old.id ?? null) : (payload.new.id ?? null))
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'brand_categories' },
        (payload: PgChange<{ brand_id: string }>) => {
          if (cancelled) return
          refetchBrand(
            payload.eventType === 'DELETE' ? (payload.old.brand_id ?? null) : (payload.new.brand_id ?? null),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'brand_products' },
        (payload: PgChange<{ brand_id: string }>) => {
          if (cancelled) return
          refetchBrand(
            payload.eventType === 'DELETE' ? (payload.old.brand_id ?? null) : (payload.new.brand_id ?? null),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'brand_best_sellers' },
        (payload: PgChange<{ brand_id: string }>) => {
          if (cancelled) return
          refetchBrand(
            payload.eventType === 'DELETE' ? (payload.old.brand_id ?? null) : (payload.new.brand_id ?? null),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'brand_potential' },
        (payload: PgChange<{ brand_id: string }>) => {
          if (cancelled) return
          refetchBrand(
            payload.eventType === 'DELETE' ? (payload.old.brand_id ?? null) : (payload.new.brand_id ?? null),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'brand_images' },
        (payload: PgChange<{ id: string; updated_at?: string }>) => {
          if (cancelled) return
          const key = payload.eventType === 'DELETE' ? payload.old.id : payload.new.id
          if (!key) return
          if (payload.eventType === 'DELETE') {
            dispatch({ type: 'removeImage', key })
          } else {
            dispatch({ type: 'setImage', key, url: imagePublicUrl(key, payload.new.updated_at) })
          }
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  const value: MarketplaceContextValue = {
    loaded: state.loaded,
    brands: state.brands,
    candidateBrands: state.candidateBrands,
    imageCache: state.imageCache,
    hotBrands: state.hotBrands,
    hotWeekRange: state.hotWeekRange,
    toast,
    showToast,
    getEntry,
    findBrandById,
    addComment,
    deleteComment,
    setStatus,
    setDeleteReason,
    getImgSrc,
    hasReliableImage,
    getBsImg,
    setHeroImage,
    clearImage,
    setBsImage,
    clearBsImage,
    saveNewBrand,
    saveEditedBrand,
    moveCandidateToDiscover,
    deleteCandidate,
    removeCustomBrand,
  }

  return <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>
}
