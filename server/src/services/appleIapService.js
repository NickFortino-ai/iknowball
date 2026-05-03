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

function getProdVerifier() {
  if (prodVerifier) return prodVerifier
  prodVerifier = new SignedDataVerifier(loadRootCerts(), true, Environment.PRODUCTION, env.APPLE_BUNDLE_ID)
  logger.info({ environment: 'Production' }, 'Apple IAP production verifier initialized')
  return prodVerifier
}

function getSandboxVerifier() {
  if (sandboxVerifier) return sandboxVerifier
  sandboxVerifier = new SignedDataVerifier(loadRootCerts(), true, Environment.SANDBOX, env.APPLE_BUNDLE_ID)
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
