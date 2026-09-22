import { useCallback, useRef } from 'react'

/**
 * Pins <body> at its current scroll offset while a modal is open, so
 * wheel/touch scrolling always stays inside the modal instead of sometimes
 * reaching the page underneath. Plain `overflow:hidden` on body isn't
 * reliable enough on its own (iOS Safari still rubber-bands the page), so
 * this also pins body in place at its current scroll offset and restores it
 * on unlock.
 *
 * `lock`/`unlock` are a simple on/off flag, not a counter: both the detail
 * modal and the add/edit modal share one instance of this hook, and a modal
 * re-rendering in place (e.g. after SAVE) can end up calling `lock()` again
 * while it's already locked. A counter needs exactly one unlock per lock and
 * can easily never get there, leaving the page stuck unscrollable after
 * close — a flag just asks "is a modal open right now", which is what every
 * call site actually means.
 */
export function useScrollLock() {
  const lockedRef = useRef(false)
  const scrollYRef = useRef(0)

  const lock = useCallback(() => {
    if (lockedRef.current) return
    lockedRef.current = true
    scrollYRef.current = window.scrollY
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollYRef.current}px`
    document.body.style.width = '100%'
  }, [])

  const unlock = useCallback(() => {
    if (!lockedRef.current) return
    lockedRef.current = false
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.width = ''
    window.scrollTo(0, scrollYRef.current)
  }, [])

  return { lock, unlock }
}
