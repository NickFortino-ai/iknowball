import { StatusBar, Style } from '@capacitor/status-bar'
import { Capacitor } from '@capacitor/core'

export async function initStatusBar() {
  if (!Capacitor.isNativePlatform()) return
  try {
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#0A0A0F' })
    // Android default has the status bar overlay the WebView, which hides
    // the top of the navbar (logo + bell + hamburger) behind the system
    // status bar. Push the WebView below the status bar so the navbar
    // renders fully. iOS handles safe-area natively so this is a no-op
    // there. Status bar background color above keeps continuity with the
    // navbar background.
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setOverlaysWebView({ overlay: false })
    }
  } catch {
    // no-op if not supported
  }
}
