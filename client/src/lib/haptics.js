import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Capacitor } from '@capacitor/core'

export async function triggerHaptic(style = 'Light') {
  if (!Capacitor.isNativePlatform()) return
  try {
    await Haptics.impact({ style: ImpactStyle[style] })
  } catch {
    // no-op on unsupported devices
  }
}
