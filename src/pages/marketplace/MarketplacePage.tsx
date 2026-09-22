import { useState, type FormEvent } from 'react'
import { supabase } from '@/utils/supabase'
import { MarketplaceProvider, useMarketplace } from '@/context/MarketplaceProvider'
import { useScrollLock } from '@/hooks/useScrollLock'
import { Header } from '@/components/marketplace/Header'
import { CategoryFilterBar, CountryFilterBar, ViewToggle } from '@/components/marketplace/FilterBar'
import { DiscoverDeck } from '@/components/marketplace/DiscoverDeck'
import { CandidatesTab } from '@/components/marketplace/CandidatesTab'
import { DetailModal } from '@/components/marketplace/DetailModal'
import { AddEditBrandModal } from '@/components/marketplace/AddEditBrandModal'
import { Toast } from '@/components/marketplace/Toast'
import type { TabId, ViewMode } from '@/types/marketplace'

const ACCESS_STORAGE_KEY = 'sauna333_access_granted'

function MarketplaceContent() {
  const { brands } = useMarketplace()

  const [tab, setTab] = useState<TabId>('discover')
  const [filter, setFilter] = useState('ALL')
  const [countryFilters, setCountryFilters] = useState<string[]>([])
  const [view, setView] = useState<ViewMode>('grid')
  const [showDeleted, setShowDeleted] = useState(false)

  const [detailBrandId, setDetailBrandId] = useState<string | null>(null)
  const [addModal, setAddModal] = useState<{ open: boolean; editId: string | null }>({ open: false, editId: null })

  const { lock, unlock } = useScrollLock()

  function openDetail(id: string) {
    setDetailBrandId(id)
  }
  function closeDetail() {
    setDetailBrandId(null)
  }
  function openAddModal() {
    setAddModal({ open: true, editId: null })
  }
  function openEditModal(id: string) {
    setDetailBrandId(null) /* only one modal is ever open at a time */
    setAddModal({ open: true, editId: id })
  }
  function closeAddModal() {
    setAddModal({ open: false, editId: null })
  }

  return (
    <div>
      <Toast />
      <Header tab={tab} onTabChange={setTab} />

      <div className="mx-auto max-w-[1180px] px-10 max-[560px]:px-5">
        {tab !== 'candidates' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-[22px]">
              <CategoryFilterBar filter={filter} onChange={setFilter} />
              <ViewToggle view={view} onChange={setView} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pt-3.5 pb-[22px]">
              <CountryFilterBar
                brands={brands}
                selected={countryFilters}
                onToggle={(code) =>
                  setCountryFilters((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
                }
                onClear={() => setCountryFilters([])}
              />
            </div>
          </>
        )}

        {tab === 'candidates' ? (
          <CandidatesTab onOpenBrand={openDetail} onOpenAddModal={openAddModal} />
        ) : (
          <DiscoverDeck
            tab={tab}
            filter={filter}
            countryFilters={countryFilters}
            view={view}
            showDeleted={showDeleted}
            onToggleShowDeleted={() => setShowDeleted((v) => !v)}
            onOpenBrand={openDetail}
          />
        )}
      </div>

      <DetailModal brandId={detailBrandId} onClose={closeDetail} onEdit={openEditModal} lock={lock} unlock={unlock} />
      <AddEditBrandModal open={addModal.open} editId={addModal.editId} onClose={closeAddModal} lock={lock} unlock={unlock} />
    </div>
  )
}

/**
 * Shared password gate shown before the page content. The password lives in
 * Supabase (plaintext, by design — this is a short-lived internal tool, not a
 * real auth system) and is checked via an RPC that only ever returns true/false,
 * so the stored value itself never has to travel over the wire to verify it.
 * Once entered correctly, the browser remembers it (localStorage) so it isn't
 * asked again on this device.
 */
function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!password) return
    setChecking(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('check_access_password', {
      input: password,
    })
    setChecking(false)
    if (rpcError) {
      setError('확인 중 문제가 생겼어요. 인터넷 연결을 확인해주세요.')
      return
    }
    if (!data) {
      setError('비밀번호가 올바르지 않아요.')
      return
    }
    try {
      localStorage.setItem(ACCESS_STORAGE_KEY, 'true')
    } catch {
      /* ignore — worst case it just asks again next visit */
    }
    onUnlock()
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-bg px-6 font-sans">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-xl text-blue">333°</div>
          <div className="mt-2 font-mono text-xs tracking-wide text-stone">
            WELLNESS MARKETPLACE — BRAND RESEARCH DECK
          </div>
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="w-full border border-line bg-white px-4 py-3 text-sm text-ink outline-none focus:border-blue"
        />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={checking || !password}
          className="mt-4 w-full bg-ink py-3 text-sm font-medium text-white transition-opacity disabled:opacity-40"
        >
          {checking ? '확인 중...' : '입장'}
        </button>
      </form>
    </div>
  )
}

function MarketplacePage() {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return localStorage.getItem(ACCESS_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />
  }

  return (
    <MarketplaceProvider>
      <MarketplaceContent />
    </MarketplaceProvider>
  )
}

export default MarketplacePage
