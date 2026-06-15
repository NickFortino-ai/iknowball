import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { api } from './api'
import { supabase } from './supabase'

// Native push (APNs on iOS, FCM on Android in the future). The token
// from Capacitor gets POSTed to /users/me/device-token so the server
// can fan out notifications via apnsService. No-ops on web — browsers
// use the separate web-push path (see pushSubscription.js).

const PENDING_TOKEN_KEY = 'pending_device_token'

// Attempt to POST the most recently received token to the server.
// Skips silently if there's no pending token, or if auth isn't ready
// yet. onAuthStateChange below retries this on SIGNED_IN, which
// handles the fresh-install race where Capacitor's registration
// listener fires before the user has finished signing in (the POST
// would 401 silently and the token never reaches the DB).
async function tryPostDeviceToken() {
  let tok
  try { tok = localStorage.getItem(PENDING_TOKEN_KEY) } catch { return }
  if (!tok) return

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return // wait for sign-in; onAuthStateChange will retry

  try {
    await api.post('/users/me/device-token', {
      token: tok,
      platform: Capacitor.getPlatform(),
    })
    try { localStorage.removeItem(PENDING_TOKEN_KEY) } catch {}
  } catch (err) {
    // Leave pending so the next auth event retries.
    console.error('Failed to register device token with server:', err)
  }
}

export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return

  const permission = await PushNotifications.requestPermissions()
  if (permission.receive !== 'granted') return

  await PushNotifications.register()

  PushNotifications.addListener('registration', async (token) => {
    // Persist immediately — registration can fire before auth is ready
    // (fresh install). The pending shim makes sure the token isn't lost
    // when the first POST 401s.
    try { localStorage.setItem(PENDING_TOKEN_KEY, token.value) } catch {}
    await tryPostDeviceToken()
  })

  // Retry the token POST whenever auth becomes ready. Critical for
  // fresh installs where initPushNotifications runs at app mount but
  // the user signs in afterwards.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      tryPostDeviceToken()
    }
  })

  PushNotifications.addListener('registrationError', (error) => {
    console.error('Push registration error:', error)
  })

  // Foreground arrival — iOS suppresses the banner by default, but the
  // notification is still delivered to the app. No-op for now; could
  // route to a toast later if desired.
  PushNotifications.addListener('pushNotificationReceived', () => {})

  // Tap handler — deep-link using the `url` payload we set server-side
  // in apnsService.js. Uses hash-style navigation to avoid a full
  // reload. Falls through to `/` if no URL was attached.
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const url = action?.notification?.data?.url
    if (url && typeof window !== 'undefined') {
      // Use SPA navigation by dispatching a custom event the router can
      // listen for. The simplest reliable path is to just update the
      // location — the router will pick it up.
      window.location.href = url
    }
  })
}
