import { Capacitor } from '@capacitor/core'
import { NativePurchases } from '@capgo/native-purchases'

const PRODUCT_IDS = {
  monthly: 'com.iknowball.app.monthly',
  yearly: 'com.iknowball.app.yearly',
}
// Android-only: the base plan ID configured under each subscription in
// Play Console. Required by @capgo/native-purchases when productType is
// 'subs'; ignored on iOS.
const BASE_PLAN_IDS = {
  monthly: 'monthly',
  yearly: 'yearly',
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

// On Android the plugin returns `identifier` as the base plan ID
// (e.g. "monthly") and `planIdentifier` as the subscription product ID
// (e.g. "com.iknowball.app.monthly"). On iOS only `identifier` exists
// and it holds the product ID. Match against either so the same lookup
// works on both platforms.
function matchesProductId(product, productId) {
  return product?.planIdentifier === productId || product?.identifier === productId
}

export async function getSubscriptionProducts() {
  if (!isIAPAvailable()) return { monthly: null, yearly: null }
  try {
    const result = await NativePurchases.getProducts({
      productIdentifiers: [PRODUCT_IDS.monthly, PRODUCT_IDS.yearly],
      productType: SUBSCRIPTION_PRODUCT_TYPE,
    })
    const products = result.products || []
    return {
      monthly: products.find((p) => matchesProductId(p, PRODUCT_IDS.monthly)) || null,
      yearly: products.find((p) => matchesProductId(p, PRODUCT_IDS.yearly)) || null,
    }
  } catch (err) {
    console.error('[IAP] getProducts error:', err)
    return { monthly: null, yearly: null }
  }
}

export async function purchaseSubscription(plan) {
  const productId = PRODUCT_IDS[plan]
  if (!productId) throw new Error(`Invalid plan: ${plan}`)
  const result = await NativePurchases.purchaseProduct({
    productIdentifier: productId,
    planIdentifier: BASE_PLAN_IDS[plan],
    productType: SUBSCRIPTION_PRODUCT_TYPE,
  })
  // Tolerate either a flat Transaction (current @capgo/native-purchases
  // shape on both platforms) or a legacy { transactions: [...] } wrapper
  // (older plugin builds). The pre-fix code assumed the wrapper, which
  // broke when the plugin moved to the flat shape; this keeps working
  // either way so we can't get bitten by another silent shape flip.
  if (result?.transactions && result.transactions.length > 0) {
    return result.transactions[0]
  }
  return result || null
}

export async function restoreSubscription() {
  const result = await NativePurchases.restorePurchases()
  const list = result?.purchases || result?.transactions || []
  if (list.length === 0) return null
  const validIds = new Set(Object.values(PRODUCT_IDS))
  const match = list.find((t) => validIds.has(t.productIdentifier))
  return match || list[0]
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
