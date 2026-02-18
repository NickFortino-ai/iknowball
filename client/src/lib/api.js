import { supabase } from './supabase'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}

async function request(path, options = {}) {
  const authHeaders = await getAuthHeaders()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers,
      },
    })
  } finally {
    clearTimeout(timeoutId)
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
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}
