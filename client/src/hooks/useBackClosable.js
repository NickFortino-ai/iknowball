import { useEffect, useRef } from 'react'

/**
 * Make a full-screen overlay close on the system back gesture.
 *
 * On Android the hardware/gesture Back is the most-used navigation control
 * there is, and on iOS it's the edge swipe. An overlay held in component
 * state is invisible to both — pressing Back leaves the PAGE instead of
 * closing the thing on top of it, which reads as the app throwing you out.
 *
 * So: push a history entry when the overlay opens, and treat popping it as
 * a close. Closing from the UI instead consumes that entry with a back(),
 * or Back would need two presses to do anything.
 */
export function useBackClosable(isOpen, onClose) {
  // Held in a ref and deliberately NOT a dependency. Callers pass an inline
  // arrow (`() => setOpen(false)`), which is a new identity every render —
  // as a dependency it would tear down and re-run this effect on each render,
  // pushing a history entry every time.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return

    const openedAt = Date.now()
    window.history.pushState({ ikbOverlay: true }, '')
    const onPop = () => onCloseRef.current?.()
    window.addEventListener('popstate', onPop)

    return () => {
      window.removeEventListener('popstate', onPop)

      // StrictMode runs effects, tears them down, and runs them again on
      // mount in development. Consuming the entry during that throwaway
      // cleanup fires a popstate at the re-run effect and slams the overlay
      // shut the instant it opens. Anything torn down this fast is that, not
      // a real close — at the cost of one stray history entry in dev.
      if (Date.now() - openedAt < 100) return

      // Only when we're still sitting on the entry we pushed. After a real
      // Back the current entry is the one underneath, and calling back()
      // again would navigate away from the page entirely.
      if (window.history.state?.ikbOverlay) window.history.back()
    }
  }, [isOpen])
}
