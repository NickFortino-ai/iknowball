import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'

// Open a URL outside our own webview. On native iOS this uses
// SFSafariViewController (Apple's recommended in-app browser) so the
// user sees the link content without leaving the app — critical for
// Terms of Use / Privacy Policy links on the paywall, which Apple App
// Review explicitly checks for during subscription review. On web we
// fall back to a normal new-tab open.
export async function openExternalUrl(url) {
  if (!url) return
  if (Capacitor.isNativePlatform()) {
    try {
      await Browser.open({ url })
      return
    } catch {
      // fall through to window.open on plugin failure
    }
  }
  try {
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    // ignore — nothing to do if both paths fail
  }
}
