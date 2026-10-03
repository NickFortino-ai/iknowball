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
  useEffect(() => {
    const apply = () => {
      // innerHeight, NOT visualViewport.height: the latter shrinks while the
      // keyboard is up, which would pin the shell to the shortened height and
      // leave it there after the keyboard closes — the very bug being fixed.
      if (shellRef.current) shellRef.current.style.height = `${window.innerHeight}px`
    }
    const onVisible = () => { if (document.visibilityState === 'visible') apply() }

    apply()
    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)
    window.addEventListener('pageshow', apply)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('resize', apply)
      window.removeEventListener('orientationchange', apply)
      window.removeEventListener('pageshow', apply)
      document.removeEventListener('visibilitychange', onVisible)
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
