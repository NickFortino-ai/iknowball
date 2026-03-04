import { Capacitor } from '@capacitor/core'
import { NativePurchases } from '@capgo/native-purchases'

const PRODUCT_ID = 'com.iknowball.app.season_access'
const PENDING_TX_KEY = 'pendingAppleTransaction'

export function isIAPAvailable() {
  return Capacitor.isNativePlatform()
}

export async function getSeasonAccessProduct() {
  if (!isIAPAvailable()) return null
  try {
    console.log('[IAP] Fetching product:', PRODUCT_ID)
    const result = await NativePurchases.getProducts({ productIdentifiers: [PRODUCT_ID] })
    console.log('[IAP] getProducts result:', JSON.stringify(result))
    const { products } = result
    if (products.length === 0) {
      console.warn('[IAP] No products returned for', PRODUCT_ID)
    }
    return products.length > 0 ? products[0] : null
  } catch (err) {
    console.error('[IAP] getProducts error:', err)
    return null
  }
}

export async function purchaseSeasonAccess() {
  const { transactions } = await NativePurchases.purchaseProduct({ productIdentifier: PRODUCT_ID })
  return transactions && transactions.length > 0 ? transactions[0] : null
}

export async function restoreSeasonAccess() {
  const { transactions } = await NativePurchases.restorePurchases()
  if (!transactions || transactions.length === 0) return null
  // Find the season access transaction
  const match = transactions.find((t) => t.productIdentifier === PRODUCT_ID)
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
