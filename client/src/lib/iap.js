import { Capacitor } from '@capacitor/core'
import { NativePurchases } from '@capgo/native-purchases'

const PRODUCT_IDS = {
  monthly: 'com.iknowball.app.monthly',
  yearly: 'com.iknowball.app.yearly',
}
const PENDING_TX_KEY = 'pendingAppleTransaction'

export function isIAPAvailable() {
  return Capacitor.isNativePlatform()
}

// Capacitor's @capgo/native-purchases plugin defaults productType to
// 'inapp' on Android, which silently filters our subscription products
// out of the result. Explicitly request 'subs' so Play Billing actually
// returns the IKB Monthly / Yearly subscriptions. iOS ignores
// productType (StoreKit treats consumables / subscriptions identically
// for this call), so passing it is safe across both platforms.
const SUBSCRIPTION_PRODUCT_TYPE = 'subs'

export async function getSubscriptionProducts() {
  if (!isIAPAvailable()) return { monthly: null, yearly: null }
  try {
    const result = await NativePurchases.getProducts({
      productIdentifiers: [PRODUCT_IDS.monthly, PRODUCT_IDS.yearly],
      productType: SUBSCRIPTION_PRODUCT_TYPE,
    })
    const products = result.products || []
    return {
      monthly: products.find((p) => p.identifier === PRODUCT_IDS.monthly) || null,
      yearly: products.find((p) => p.identifier === PRODUCT_IDS.yearly) || null,
    }
  } catch (err) {
    console.error('[IAP] getProducts error:', err)
    return { monthly: null, yearly: null }
  }
}

export async function purchaseSubscription(plan) {
  const productId = PRODUCT_IDS[plan]
  if (!productId) throw new Error(`Invalid plan: ${plan}`)
  const { transactions } = await NativePurchases.purchaseProduct({
    productIdentifier: productId,
    productType: SUBSCRIPTION_PRODUCT_TYPE,
  })
  return transactions && transactions.length > 0 ? transactions[0] : null
}

export async function restoreSubscription() {
  const { transactions } = await NativePurchases.restorePurchases()
  if (!transactions || transactions.length === 0) return null
  const validIds = new Set(Object.values(PRODUCT_IDS))
  const match = transactions.find((t) => validIds.has(t.productIdentifier))
  return match || transactions[0]
}

export function savePendingTransaction(jws) {
  try {
    localStorage.setItem(PENDING_TX_KEY, jws)
  } catch {
    // storage full, ignore
  }
}

export function getPendingTransaction() {
  try {
    return localStorage.getItem(PENDING_TX_KEY)
  } catch {
    return null
  }
}

export function clearPendingTransaction() {
  try {
    localStorage.removeItem(PENDING_TX_KEY)
  } catch {
    // ignore
  }
}
