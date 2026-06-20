import { Capacitor } from '@capacitor/core'

// Production web origin. Hard-coded because Capacitor's WebView reports
// `window.location.origin` as `capacitor://localhost` inside the native
// app — useless for sharing outside the app. All share URLs must point
// at the live web origin so iMessage / X / WhatsApp / etc. can preview
// and other recipients can actually open them.
const WEB_ORIGIN = 'https://www.iknowball.club'

/**
 * Return the right base URL for share links.
 * - On native (iOS/Android via Capacitor): always WEB_ORIGIN.
 * - On the web (browser at iknowball.club, localhost dev, preview deploys):
 *   use window.location.origin so dev/preview shares stay self-referential.
 */
export function shareOrigin() {
  if (Capacitor.isNativePlatform()) return WEB_ORIGIN
  return window.location.origin
}

/**
 * Convenience: build a /join/<code> URL with optional bracket query.
 */
export function buildJoinLink(inviteCode, { isBracket = false } = {}) {
  const suffix = isBracket ? '?t=bracket' : ''
  return `${shareOrigin()}/join/${inviteCode}${suffix}`
}
