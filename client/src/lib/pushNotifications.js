import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { api } from './api'

// Native push (APNs on iOS, FCM on Android in the future). The token
// from Capacitor gets POSTed to /users/me/device-token so the server
// can fan out notifications via apnsService. No-ops on web — browsers
// use the separate web-push path (see pushSubscription.js).

export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return

  const permission = await PushNotifications.requestPermissions()
  if (permission.receive !== 'granted') return

  await PushNotifications.register()

  PushNotifications.addListener('registration', async (token) => {
    // Send the token to our server so it can be addressed by APNs. The
    // platform string distinguishes APNs from FCM once we add Android.
    try {
      await api.post('/users/me/device-token', {
        token: token.value,
        platform: Capacitor.getPlatform(), // 'ios' or 'android'
      })
    } catch (err) {
      // Don't block the app if token registration fails — it'll retry
      // on the next app launch. Log quietly.
      console.error('Failed to register device token with server:', err)
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
