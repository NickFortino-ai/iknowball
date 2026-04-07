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

async function rawFetch(path, options, authHeaders) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)
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

  // Try once, then retry once on transient TypeError (network blip, network transition).
  let lastErr
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await rawFetch(path, options, authHeaders)
      lastErr = null
      break
    } catch (err) {
      lastErr = err
      // Don't retry on AbortError (timeout) or genuine offline
      if (err.name === 'AbortError') break
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break
      if (attempt === 0 && err.name === 'TypeError') {
        // Brief backoff before second try — catches Wi-Fi → cell transitions
        await new Promise((r) => setTimeout(r, 600))
        continue
      }
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
    throw error
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  postForm: (path, formData) => request(path, { method: 'POST', body: formData }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}
