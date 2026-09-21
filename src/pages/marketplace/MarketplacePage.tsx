import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '@/utils/supabase'
import bodyHtml from './body.html?raw'
import appScript from './app.js?raw'
import './marketplace.css'

const ACCESS_STORAGE_KEY = 'sauna333_access_granted'

/**
 * Ported from the original static HTML page (Firebase/Firestore-backed).
 * The markup and app logic are kept as-is on purpose — only the sync layer
 * at the bottom of app.js was rewritten to talk to Supabase instead of
 * Firestore, with the DB layer swapped and Realtime added so every open tab
 * sees the same edits live. See src/pages/marketplace/app.js for the details.
 */
function MarketplaceContent() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // app.js is loaded as raw text and injected as a real <script> tag so its
    // top-level `var`/`function` declarations become globals, exactly like the
    // original inline <script> did — the markup's inline onclick="..." handlers
    // (both static and the ones render() builds dynamically) depend on that.
    ;(window as unknown as { __supabase: typeof supabase }).__supabase = supabase

    const script = document.createElement('script')
    script.textContent = appScript
    document.body.appendChild(script)

    return () => {
      const cleanup = (window as unknown as { __marketplaceCleanup?: () => void })
        .__marketplaceCleanup
      cleanup?.()
      script.remove()
    }
  }, [])

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
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
    <div
      className="flex min-h-svh items-center justify-center bg-[#F7F7F7] px-6"
      style={{ fontFamily: "'IBM Plex Sans KR', sans-serif" }}
    >
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-xl text-[#79ABD5]">333°</div>
          <div className="mt-2 font-mono text-xs tracking-wide text-[#7C898D]">
            WELLNESS MARKETPLACE — BRAND RESEARCH DECK
          </div>
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="w-full border border-[#D8D9D4] bg-white px-4 py-3 text-sm text-[#050707] outline-none focus:border-[#79ABD5]"
        />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={checking || !password}
          className="mt-4 w-full bg-[#050707] py-3 text-sm font-medium text-white transition-opacity disabled:opacity-40"
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

  return <MarketplaceContent />
}

export default MarketplacePage
