import { useEffect, useRef } from 'react'
import { supabase } from '@/utils/supabase'
import bodyHtml from './body.html?raw'
import appScript from './app.js?raw'
import './marketplace.css'

/**
 * Ported from the original static HTML page (Firebase/Firestore-backed).
 * The markup and app logic are kept as-is on purpose — only the sync layer
 * at the bottom of app.js was rewritten to talk to Supabase instead of
 * Firestore, with the DB layer swapped and Realtime added so every open tab
 * sees the same edits live. See src/pages/marketplace/app.js for the details.
 */
function MarketplacePage() {
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

export default MarketplacePage
