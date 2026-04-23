import { supabase } from './supabase'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}

function classifyFetchError(err) {
  if (err.name === 'AbortError') {
    return new Error('Request timed out. Please try again.')
  }
  // Real offline state — only when the browser is sure
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new Error('You appear to be offline. Check your connection and try again.')
  }
  // TypeError from fetch — could be CORS, DNS, TLS, network transition, server unreachable
  if (err.name === 'TypeError') {
    return new Error('Network error reaching the server. Try again in a moment.')
  }
  return new Error(err.message || 'Unexpected network error. Try again.')
}

async function rawFetch(path, options, authHeaders, timeoutMs = 25000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...authHeaders,
        ...options.headers,
      },
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function request(path, options = {}) {
  let authHeaders = await getAuthHeaders()
  let res

  // Up to 3 attempts. Backoff sequence: immediate, 600ms, 1.5s, 3s.
  // This gives Render's free-tier cold-start (~15-25s) enough room to
  // complete instead of failing on a single transient TypeError.
  const backoffs = [0, 600, 1500, 3000]
  let lastErr
  // Callers can pass { longTimeout: true } for operations that legitimately
  // take a while (e.g., recap generation with fact-check + retry can take
  // 60+ seconds). Default tolerates Render cold-start (~25s) but not longer.
  const longFirst = options.longTimeout ? 120000 : 30000
  const longRetry = options.longTimeout ? 60000 : 15000
  for (let attempt = 0; attempt < backoffs.length; attempt++) {
    if (backoffs[attempt] > 0) {
      await new Promise((r) => setTimeout(r, backoffs[attempt]))
    }
    try {
      const timeoutMs = attempt === 0 ? longFirst : longRetry
      res = await rawFetch(path, options, authHeaders, timeoutMs)
      lastErr = null
      break
    } catch (err) {
      lastErr = err
      // Don't retry on AbortError (timeout) or genuine offline
      if (err.name === 'AbortError') break
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break
      // Retry only on TypeError (network errors)
      if (err.name === 'TypeError') continue
      break
    }
  }

  if (lastErr) throw classifyFetchError(lastErr)

  // Token expired? Refresh once and retry exactly once.
  if (res.status === 401) {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) throw error
      if (data?.session?.access_token) {
        authHeaders = { Authorization: `Bearer ${data.session.access_token}` }
        try {
          res = await rawFetch(path, options, authHeaders)
        } catch (err) {
          throw classifyFetchError(err)
        }
      }
    } catch {
      // Refresh failed — fall through and surface the original 401
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const error = new Error(body.error || `Request failed: ${res.status}`)
    error.status = res.status
    error.details = body.details
    error.response = body
    throw error
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get: (path, opts = {}) => request(path, opts),
  post: (path, data, opts = {}) => request(path, { method: 'POST', body: JSON.stringify(data), ...opts }),
  postForm: (path, formData, opts = {}) => request(path, { method: 'POST', body: formData, ...opts }),
  put: (path, data, opts = {}) => request(path, { method: 'PUT', body: JSON.stringify(data), ...opts }),
  patch: (path, data, opts = {}) => request(path, { method: 'PATCH', body: JSON.stringify(data), ...opts }),
  delete: (path, opts = {}) => request(path, { method: 'DELETE', ...opts }),
}
