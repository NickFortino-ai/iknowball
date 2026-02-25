const STORAGE_KEY = 'ikb_saved_accounts'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export function getSavedAccounts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

export function upsertAccount({ userId, username, displayName, avatarEmoji, refreshToken }) {
  const accounts = getSavedAccounts()
  const idx = accounts.findIndex((a) => a.userId === userId)
  const account = { userId, username, displayName, avatarEmoji, refreshToken }
  if (idx >= 0) {
    accounts[idx] = account
  } else {
    accounts.push(account)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
}

export function removeAccount(userId) {
  const accounts = getSavedAccounts().filter((a) => a.userId !== userId)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
}

export async function fetchUnreadCountForAccount(account) {
  try {
    // Refresh the token via direct POST to avoid touching the active supabase session
    const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ refresh_token: account.refreshToken }),
    })

    if (tokenRes.status === 400 || tokenRes.status === 401) {
      return { error: 'expired' }
    }

    if (!tokenRes.ok) {
      return { error: 'expired' }
    }

    const tokenData = await tokenRes.json()

    // Update stored refresh token (Supabase rotates them)
    upsertAccount({ ...account, refreshToken: tokenData.refresh_token })

    // Fetch unread count using the fresh access token
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
    const countRes = await fetch(`${baseUrl}/notifications/unread-count`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!countRes.ok) return { count: 0 }
    const data = await countRes.json()
    return { count: data.count || 0 }
  } catch {
    return { error: 'expired' }
  }
}
