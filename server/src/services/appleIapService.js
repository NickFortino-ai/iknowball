import { SignedDataVerifier, Environment } from '@apple/app-store-server-library'
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CERTS_DIR = join(__dirname, '../../certs')
const PRODUCT_ID = 'com.iknowball.app.season_access'

let verifier = null

function getVerifier() {
  if (verifier) return verifier

  const certFiles = readdirSync(CERTS_DIR).filter((f) => f.endsWith('.cer'))
  if (certFiles.length === 0) {
    throw new Error('No Apple root certificates found in server/certs/')
  }

  const rootCerts = certFiles.map((f) => readFileSync(join(CERTS_DIR, f)))
  const appleEnv =
    env.APPLE_IAP_ENVIRONMENT === 'Sandbox' ? Environment.SANDBOX : Environment.PRODUCTION

  verifier = new SignedDataVerifier(rootCerts, true, appleEnv, env.APPLE_BUNDLE_ID)
  logger.info({ certCount: certFiles.length, environment: env.APPLE_IAP_ENVIRONMENT }, 'Apple IAP verifier initialized')
  return verifier
}

export async function verifyTransaction(jwsString) {
  const v = getVerifier()
  const decoded = await v.verifyAndDecodeTransaction(jwsString)

  if (decoded.bundleId !== env.APPLE_BUNDLE_ID) {
    throw new Error(`Bundle ID mismatch: expected ${env.APPLE_BUNDLE_ID}, got ${decoded.bundleId}`)
  }

  if (decoded.productId !== PRODUCT_ID) {
    throw new Error(`Product ID mismatch: expected ${PRODUCT_ID}, got ${decoded.productId}`)
  }

  return decoded
}
