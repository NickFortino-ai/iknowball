import { SignedDataVerifier, Environment } from '@apple/app-store-server-library'
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CERTS_DIR = join(__dirname, '../../certs')
const PRODUCT_IDS = ['com.iknowball.app.monthly', 'com.iknowball.app.yearly']

let prodVerifier = null
let sandboxVerifier = null

function loadRootCerts() {
  const certFiles = readdirSync(CERTS_DIR).filter((f) => f.endsWith('.cer'))
  if (certFiles.length === 0) {
    throw new Error('No Apple root certificates found in server/certs/')
  }
  return certFiles.map((f) => readFileSync(join(CERTS_DIR, f)))
}

// Production requires appAppleId — the app's numeric App Store ID — or
// every verify call throws "appAppleId is required when the environment
// is Production". Sandbox tolerates omission, which is why sandbox QA
// passed but every live transaction silently failed until this was wired.
function getProdVerifier() {
  if (prodVerifier) return prodVerifier
  if (!env.APPLE_APP_ID) {
    throw new Error('APPLE_APP_ID env var is required for Production Apple IAP verification')
  }
  prodVerifier = new SignedDataVerifier(loadRootCerts(), true, Environment.PRODUCTION, env.APPLE_BUNDLE_ID, Number(env.APPLE_APP_ID))
  logger.info({ environment: 'Production', appAppleId: env.APPLE_APP_ID }, 'Apple IAP production verifier initialized')
  return prodVerifier
}

function getSandboxVerifier() {
  if (sandboxVerifier) return sandboxVerifier
  const appAppleId = env.APPLE_APP_ID ? Number(env.APPLE_APP_ID) : undefined
  sandboxVerifier = new SignedDataVerifier(loadRootCerts(), true, Environment.SANDBOX, env.APPLE_BUNDLE_ID, appAppleId)
  logger.info({ environment: 'Sandbox' }, 'Apple IAP sandbox verifier initialized')
  return sandboxVerifier
}

// Apple-recommended pattern: try production first, then fall back to sandbox.
// TestFlight + Apple App Review use sandbox transactions even in a "Production"
// build, so we must accept both. The sandbox verifier is a no-op for prod JWS
// (it'll reject due to environment mismatch).
export async function verifyTransaction(jwsString) {
  let decoded
  try {
    decoded = await getProdVerifier().verifyAndDecodeTransaction(jwsString)
  } catch (prodErr) {
    try {
      decoded = await getSandboxVerifier().verifyAndDecodeTransaction(jwsString)
    } catch (sandboxErr) {
      logger.warn({ prodErr: prodErr.message, sandboxErr: sandboxErr.message }, 'Apple IAP JWS rejected by both environments')
      throw prodErr
    }
  }

  if (decoded.bundleId !== env.APPLE_BUNDLE_ID) {
    throw new Error(`Bundle ID mismatch: expected ${env.APPLE_BUNDLE_ID}, got ${decoded.bundleId}`)
  }

  if (!PRODUCT_IDS.includes(decoded.productId)) {
    throw new Error(`Product ID mismatch: expected one of ${PRODUCT_IDS.join(', ')}, got ${decoded.productId}`)
  }

  return decoded
}

// Verify + decode an App Store Server Notification v2 signed payload.
// Apple POSTs these whenever a subscription state changes (renewal,
// cancel, refund, etc). Same prod-first / sandbox-fallback pattern as
// transaction verification, because sandbox-environment notifications
// come from TestFlight / App Review even on a production binary.
export async function verifyNotification(signedPayload) {
  let decoded
  try {
    decoded = await getProdVerifier().verifyAndDecodeNotification(signedPayload)
  } catch (prodErr) {
    try {
      decoded = await getSandboxVerifier().verifyAndDecodeNotification(signedPayload)
    } catch (sandboxErr) {
      logger.warn({ prodErr: prodErr.message, sandboxErr: sandboxErr.message }, 'Apple notification JWS rejected by both environments')
      throw prodErr
    }
  }
  return decoded
}

// The notification's data carries signed transaction + renewal-info JWS
// strings. Decode either with whichever verifier accepted the parent
// notification — try prod first then sandbox to match.
export async function verifyTransactionLoose(jwsString) {
  try {
    return await getProdVerifier().verifyAndDecodeTransaction(jwsString)
  } catch {
    return await getSandboxVerifier().verifyAndDecodeTransaction(jwsString)
  }
}

export async function verifyRenewalInfo(jwsString) {
  try {
    return await getProdVerifier().verifyAndDecodeRenewalInfo(jwsString)
  } catch {
    return await getSandboxVerifier().verifyAndDecodeRenewalInfo(jwsString)
  }
}
