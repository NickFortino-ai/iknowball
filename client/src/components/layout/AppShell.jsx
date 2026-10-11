import { useEffect, useRef } from 'react'
import Navbar from './Navbar'
import BottomTabBar from './BottomTabBar'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

export default function AppShell({ children }) {
  const { isOnline } = useOnlineStatus()
  const shellRef = useRef(null)

  // Pin the shell to a measured pixel height instead of trusting `dvh` alone.
  //
  // Coming back to the app after a few minutes in the background, the layout
  // would render about two thirds of the screen tall with the tab bar floating
  // mid-screen and black underneath — WKWebView resolving 100dvh against a
  // stale viewport and never recomputing, since no resize event fires on
  // resume.
  //
  // `h-dvh` stays on the element as the pre-hydration value so first paint is
  // still correct; this only ever overrides it with a freshly measured one.
  //
  // MEASURING ONCE ON RESUME ISN'T ENOUGH, which is how this came back. At
  // the instant visibilitychange fires, innerHeight is frequently still the
  // stale value — the webview corrects it a frame or several later, and
  // nothing announces that. So every trigger re-measures on a short ladder
  // and the last reading wins.
  useEffect(() => {
    // innerHeight, NOT visualViewport.height: the latter shrinks while the
    // keyboard is up, which would pin the shell to the shortened height and
    // leave it there after the keyboard closes — the very bug being fixed.
    const apply = () => {
      if (shellRef.current) shellRef.current.style.height = `${window.innerHeight}px`
    }
    // Re-reads for ~1s because the correct height can arrive well after the
    // event that should have carried it. Cheap: assigning the same px value
    // is a no-op for layout.
    const timers = []
    const applySoon = () => {
      apply()
      for (const ms of [60, 180, 400, 900]) timers.push(setTimeout(apply, ms))
    }
    const onVisible = () => { if (document.visibilityState === 'visible') applySoon() }
    // A cheap last line of defence: if the pinned height has drifted from the
    // real one, the next touch puts it right. Costs a comparison per touch
    // and only writes when they actually disagree.
    const onTouch = () => {
      if (shellRef.current && shellRef.current.style.height !== `${window.innerHeight}px`) apply()
    }

    applySoon()
    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', applySoon)
    window.addEventListener('pageshow', applySoon)
    window.addEventListener('focus', applySoon)
    document.addEventListener('visibilitychange', onVisible)
    document.addEventListener('touchstart', onTouch, { passive: true })
    // Fires in cases a window resize does not, notably on iOS. Used only as a
    // TRIGGER — the value still comes from innerHeight.
    window.visualViewport?.addEventListener('resize', apply)

    return () => {
      for (const t of timers) clearTimeout(t)
      window.removeEventListener('resize', apply)
      window.removeEventListener('orientationchange', applySoon)
      window.removeEventListener('pageshow', applySoon)
      window.removeEventListener('focus', applySoon)
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('touchstart', onTouch)
      window.visualViewport?.removeEventListener('resize', apply)
    }
  }, [])

  return (
    <div ref={shellRef} className="h-dvh flex flex-col bg-bg-primary text-text-primary font-body overflow-auto">
      <Navbar />
      {!isOnline && (
        <div className="text-incorrect text-center text-sm font-medium py-2 border-b border-incorrect flex-shrink-0">
          You're offline. Check your connection.
        </div>
      )}
      <main className="flex-1 overflow-y-auto overscroll-contain">{children}</main>
      <BottomTabBar />
    </div>
  )
}
