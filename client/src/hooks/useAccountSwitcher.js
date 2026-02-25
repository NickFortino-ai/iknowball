import { useState, useCallback, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'
import { getSavedAccounts, removeAccount, fetchUnreadCountForAccount } from '../lib/accountManager'
import { toast } from '../components/ui/Toast'

export function useAccountSwitcher() {
  const session = useAuthStore((s) => s.session)
  const switching = useAuthStore((s) => s.switching)
  const switchAccount = useAuthStore((s) => s.switchAccount)

  const [unreadCounts, setUnreadCounts] = useState({})
  const hasFetchedRef = useRef(false)

  const currentUserId = session?.user?.id || null
  const savedAccounts = getSavedAccounts()
  const inactiveAccounts = savedAccounts.filter((a) => a.userId !== currentUserId)

  const refreshUnreadCounts = useCallback(async () => {
    if (hasFetchedRef.current) return
    hasFetchedRef.current = true

    const inactive = getSavedAccounts().filter((a) => a.userId !== currentUserId)
    if (inactive.length === 0) return

    const results = await Promise.all(
      inactive.map(async (account) => {
        const result = await fetchUnreadCountForAccount(account)
        return { userId: account.userId, ...result }
      })
    )

    const counts = {}
    for (const r of results) {
      counts[r.userId] = r.error ? { error: r.error } : { count: r.count }
    }
    setUnreadCounts(counts)
  }, [currentUserId])

  const resetFetchState = useCallback(() => {
    hasFetchedRef.current = false
  }, [])

  const handleSwitch = useCallback(async (userId) => {
    try {
      await switchAccount(userId)
    } catch (err) {
      toast(err.message || 'Failed to switch account', 'error')
    }
  }, [switchAccount])

  const handleRemove = useCallback((userId) => {
    removeAccount(userId)
    setUnreadCounts((prev) => {
      const next = { ...prev }
      delete next[userId]
      return next
    })
  }, [])

  return {
    savedAccounts,
    inactiveAccounts,
    currentUserId,
    switching,
    unreadCounts,
    refreshUnreadCounts,
    resetFetchState,
    handleSwitch,
    handleRemove,
  }
}
