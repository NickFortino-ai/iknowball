import { Capacitor } from '@capacitor/core'
import { NativePurchases } from '@capgo/native-purchases'
import { api } from './api'
import { useAuthStore } from '../stores/authStore'

export function initIAPListener() {
  if (!Capacitor.isNativePlatform()) return

  NativePurchases.addListener('transactionUpdated', async (transaction) => {
    if (!transaction?.jwsRepresentation) return

    try {
      await api.post('/payments/verify-apple-iap', {
        signedTransaction: transaction.jwsRepresentation,
      })
      await useAuthStore.getState().fetchProfile()
    } catch {
      // Will be retried on next app open via pending transaction recovery
    }
  })
}
