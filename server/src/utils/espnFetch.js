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
    let res = await nativeFetch(input, opts)

    // 403/429 can be transient throttling, so one backoff retry first.
    if (res.status === 403 || res.status === 429) {
      logger.warn({ url, status: res.status }, 'ESPN request blocked — retrying once')
      await sleep(1500)
      res = await nativeFetch(input, opts)
    }

    // Still blocked: fall over to ESPN's mirror host. The browser User-Agent
    // alone did NOT lift the 403s, which means the block is on this server's
    // IP rather than on how the request identifies itself — but it is applied
    // per-host. sports.core.api.espn.com kept working throughout (the HR
    // leaders fetch succeeded while every site.api.espn.com call failed), so
    // site.web.api.espn.com is worth trying: it serves the identical paths and
    // returns identical payloads (verified on scoreboard, summary and gamelog).
    //
    // Costs one extra request only on an already-failed call, and degrades to
    // exactly today's behaviour if the mirror is blocked too.
    if ((res.status === 403 || res.status === 429) && url.includes('site.api.espn.com')) {
      const mirrored = url.replace('site.api.espn.com', 'site.web.api.espn.com')
      logger.warn({ url, status: res.status }, 'ESPN still blocked — trying mirror host')
      const mirrorRes = await nativeFetch(mirrored, opts)
      if (mirrorRes.ok) {
        logger.info({ mirrored }, 'ESPN mirror host succeeded')
        return mirrorRes
      }
      logger.error({ url, mirrored, status: mirrorRes.status }, 'ESPN mirror host also blocked')
      return mirrorRes
    }

    if (!res.ok && (res.status === 403 || res.status === 429)) {
      logger.error({ url, status: res.status }, 'ESPN request still failing after retry')
    }

    return res
  }

  globalThis.__espnFetchInstalled = true
  logger.info('ESPN fetch interceptor installed')
}
