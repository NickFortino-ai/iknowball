import { Capacitor } from '@capacitor/core'
import { NativePurchases } from '@capgo/native-purchases'
import { api } from './api'
import { useAuthStore } from '../stores/authStore'

export function initIAPListener() {
  if (!Capacitor.isNativePlatform()) return

  NativePurchases.addListener('transactionUpdated', async (transaction) => {
    console.log('[IAP Listener] transactionUpdated fired:', JSON.stringify(transaction))
    if (!transaction?.jwsRepresentation) return

    try {
      console.log('[IAP Listener] Verifying transaction with server...')
      await api.post('/payments/verify-apple-iap', {
        signedTransaction: transaction.jwsRepresentation,
      })
      console.log('[IAP Listener] Verification succeeded — fetching profile')
      await useAuthStore.getState().fetchProfile()
    } catch (err) {
      console.error('[IAP Listener] Verification failed:', err)
      // Will be retried on next app open via pending transaction recovery
    }
  })
}
