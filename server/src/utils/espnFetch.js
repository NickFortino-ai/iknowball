import { logger } from './logger.js'

// ESPN request hardening, installed once as a global fetch interceptor.
//
// On 2026-08-26 ESPN began answering this server with 403 across the
// board — NBA/WNBA/MLB scoreboards, DFS salary generation, stat scoring,
// and player game logs all failed at the same minute, while the identical
// URLs returned 200 from a laptop. Node's global fetch sends no
// User-Agent, which is the usual trigger for that class of block.
//
// Why an interceptor rather than a helper every call site imports: ESPN is
// reached from ~25 call sites across 18 files, and many build the URL into
// a variable first (`const url = ...; fetch(url)`), so there is no reliable
// way to convert them all mechanically. The jobs that broke — scoreMLBDFS,
// scoreNBADFS, syncInjuries — are exactly the variable-URL kind. A single
// host-scoped wrapper covers every one of them, including any added later.
//
// Non-ESPN requests (Sleeper, Firebase, APNs, Cloudflare) pass through
// completely untouched.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const ESPN_HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function urlOf(input) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input?.url || ''
}

function isEspn(url) {
  return url.includes('espn.com') || url.includes('espncdn.com')
}

export function installEspnFetch() {
  if (globalThis.__espnFetchInstalled) return
  const nativeFetch = globalThis.fetch

  globalThis.fetch = async function patchedFetch(input, init = {}) {
    const url = urlOf(input)
    if (!isEspn(url)) return nativeFetch(input, init)

    const opts = { ...init, headers: { ...ESPN_HEADERS, ...(init.headers || {}) } }

    // site.api.espn.com is the host currently being 403'd for this server;
    // site.web.api.espn.com serves identical payloads and is not. Go to the
    // working host FIRST rather than always paying 403 + retry + mirror —
    // three requests per call is exactly the wrong thing to do while ESPN is
    // rate-limiting us. Falls back to the original host below if the mirror
    // ever fails, so this self-corrects if ESPN flips which one is blocked.
    const primary = url.includes('site.api.espn.com')
      ? url.replace('site.api.espn.com', 'site.web.api.espn.com')
      : input

    const blocked = (r) => r.status === 403 || r.status === 429

    let res = await nativeFetch(primary, opts)
    if (!blocked(res)) return res

    // One backoff retry — 403/429 can be momentary throttling.
    logger.warn({ url, status: res.status }, 'ESPN request blocked — retrying once')
    await sleep(1500)
    res = await nativeFetch(primary, opts)
    if (!blocked(res)) return res

    // Still blocked. When we rewrote the host, try the ORIGINAL as a last
    // resort so this self-corrects if ESPN ever flips which of the two it
    // blocks, instead of pinning us to a dead host.
    if (primary !== input) {
      logger.warn({ url, status: res.status }, 'ESPN mirror blocked — trying original host')
      const fallbackRes = await nativeFetch(input, opts)
      if (fallbackRes.ok) {
        logger.info({ url }, 'ESPN original host succeeded')
        return fallbackRes
      }
      logger.error({ url, status: fallbackRes.status }, 'ESPN blocked on both hosts')
      return fallbackRes
    }

    logger.error({ url, status: res.status }, 'ESPN request still failing after retry')

    return res
  }

  globalThis.__espnFetchInstalled = true
  logger.info('ESPN fetch interceptor installed')
}
