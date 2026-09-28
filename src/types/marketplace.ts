/** Shared marketplace data shapes. These mirror the nested JSON object that
 * `brands_view` assembles server-side (see supabase functions/views) and that
 * the `upsert_brand` RPC accepts back — the relational storage (brands +
 * brand_categories/products/best_sellers/potential child tables) is entirely
 * hidden behind that contract, so the client only ever works with one plain
 * object per brand. */

export type BrandStatus = 'saved' | 'consider' | 'deleted' | null
export type ContactStatus = 'needed' | 'in_progress' | null

export interface BestSeller {
  name: string
  priceLocal: string
  priceKRW: string | null
  url: string | null
}

export interface TrendSignal {
  platform?: string
  date?: string
  evidence?: string
}

export interface Scores {
  wellness: number
  space: number
  visual: number
  community: number
  retail: number
  collab: number
}

/** One brand — whether a DISCOVER/SELECTED entry or an ADD BRAND candidate.
 * Which bucket it's in is a separate `is_candidate` flag on the DB row, not a
 * field on this object (see `BrandRow`). */
export interface Brand {
  id: string
  name: string
  country: string
  countryCode?: string | null
  category: string[]
  philosophy: string
  products: string[]
  website: string
  instagram?: string | null
  bestSellers?: BestSeller[]
  scores?: Scores | null
  whyFits?: string | null
  potential: string[]
  imageLabel?: string
  sourceNote?: string
  custom?: boolean
  /* Trend-research pipeline fields — only set for brands sourced through the
     country-scoped trend pipeline; absent (undefined/null) for everything
     from the regular brand-DNA pipeline, in which case the "Why Now" section
     is omitted entirely rather than rendered empty. */
  momentumStage?: 'EARLY_SIGNAL' | 'EMERGING' | 'BREAKOUT' | 'MAINSTREAMING' | null
  whyNow?: string | null
  reSurfaced?: boolean
  reSurfacedReason?: string | null
  trendSignals?: TrendSignal[]
}

/** One row of `brands_view` — the DB-side wrapper around a Brand. */
export interface BrandRow {
  id: string
  is_candidate: boolean
  data: Brand
}

export interface Comment {
  author: string
  text: string
  ts: number
}

/** In-memory shape of a `brand_entries` row (per-brand viewer state: decision
 * status, delete reason, comments, whether the hero image was explicitly
 * cleared). Every brand has one, created on first access. */
export interface BrandEntry {
  status: BrandStatus
  deleteReason: string | null
  comments: Comment[]
  imageCleared: boolean
  /* Unused by the UI today (a leftover per-entry image field from before
     Storage-backed images existed) — kept on the type and round-tripped
     as-is so saving an entry never silently wipes it on an old row. */
  customImage?: string | null
  /* Outreach status, independent of the SAVE/CONSIDER/DELETE decision above —
     a brand can be "컨택 필요"/"컨택중" regardless of where it sits in that
     workflow. Mutually exclusive with itself only (picking one clears the
     other), not with `status`. */
  contactStatus: ContactStatus
}

export interface HotBrandRow {
  brand_id: string
  rank: number
  mention_count: number
  week_start: string
  week_end: string
}

export type ViewMode = 'grid' | 'list'
export type TabId = 'discover' | 'selected' | 'candidates'

export const CATEGORIES = [
  'ALL',
  'BODY',
  'RECOVERY',
  'HYDRATION',
  'SAUNA',
  'FITNESS',
  'SLEEP',
  'LONGEVITY',
  'SUPPLEMENT',
  'LIFESTYLE',
] as const

export const DELETE_REASONS = [
  'Price',
  'Visual mismatch',
  'Product mismatch',
  'Difficult to import',
  'Too common',
  'Weak brand identity',
  'Not suitable for offline experience',
  'Other',
] as const
