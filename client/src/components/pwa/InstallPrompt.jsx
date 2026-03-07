import { useState, useEffect } from 'react'

const DISMISSED_KEY = 'ikb_pwa_dismissed'

function shouldShow() {
  // Skip in Capacitor native app
  if (window.Capacitor?.isNativePlatform()) return false
  // Skip if already in standalone/PWA mode
  if (window.matchMedia('(display-mode: standalone)').matches) return false
  if (navigator.standalone === true) return false
  // Skip if not mobile
  if (!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return false
  // Skip if previously dismissed
  if (localStorage.getItem(DISMISSED_KEY)) return false
  return true
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export default function InstallPrompt() {
  const [visible, setVisible] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (!shouldShow()) return

    // Android: listen for the native install prompt
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    setVisible(true)
    // Trigger slide-up animation after mount
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setMounted(true))
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const dismiss = () => {
    setMounted(false)
    setTimeout(() => {
      localStorage.setItem(DISMISSED_KEY, '1')
      setVisible(false)
    }, 300)
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
    }
    setDeferredPrompt(null)
  }

  if (!visible) return null

  const ios = isIOS()

  return (
    <div
      className={`fixed left-0 right-0 z-50 px-4 transition-transform duration-300 ease-out bottom-[calc(3.5rem+env(safe-area-inset-bottom))] ${
        mounted ? 'translate-y-0' : 'translate-y-[200%]'
      }`}
    >
      <div className="bg-bg-secondary border border-border rounded-xl p-4 shadow-lg max-w-lg mx-auto">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="font-semibold text-text-primary text-sm">
              Get the full app experience
            </p>
            {ios ? (
              <p className="text-text-muted text-xs mt-1">
                Tap{' '}
                <svg
                  className="inline w-4 h-4 -mt-0.5 text-accent"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>{' '}
                then <strong>"Add to Home Screen"</strong> to install.
              </p>
            ) : (
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={handleInstall}
                  className="bg-accent text-white text-xs font-semibold px-4 py-1.5 rounded-lg"
                >
                  Install
                </button>
              </div>
            )}
          </div>
          <button
            onClick={dismiss}
            className="text-text-muted p-1 -mt-1 -mr-1"
            aria-label="Dismiss"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
