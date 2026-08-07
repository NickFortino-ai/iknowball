import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { toast } from '../ui/Toast'
import { useSearchUsers } from '../../hooks/useInvitations'

// Grant/revoke the is_writer flag. Full-admin only — the server
// endpoint enforces this; the client just doesn't render the tab for
// helper admins (see AdminPage tab filter).
export default function WritersPanel() {
  const [writers, setWriters] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const { data: searchResults } = useSearchUsers(search)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.get('/admin/writers')
      setWriters(data)
    } catch (err) {
      toast(err.message, 'error')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const grant = async (userId) => {
    try {
      await api.post(`/admin/users/${userId}/writer`, { is_writer: true })
      toast('Writer role granted', 'success')
      setSearch('')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const revoke = async (userId) => {
    if (!confirm('Revoke writer access for this user?')) return
    try {
      await api.post(`/admin/users/${userId}/writer`, { is_writer: false })
      toast('Writer role revoked', 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const existingWriterIds = new Set(writers.map((w) => w.id))
  const candidates = (searchResults || []).filter((u) => !existingWriterIds.has(u.id))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl mb-1">Writers</h2>
        <p className="text-text-muted text-sm">Users granted access to the Player Blurbs tool at <span className="font-mono">/writer</span>.</p>
      </div>

      {/* Grant */}
      <div className="bg-bg-primary border border-text-primary/20 rounded-xl p-4">
        <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Grant writer access</div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username..."
          className="w-full px-3 py-2 rounded-lg bg-bg-card border border-text-primary/20 text-sm text-text-primary placeholder-text-muted"
        />
        {search.length >= 2 && candidates.length > 0 && (
          <div className="mt-2 space-y-1">
            {candidates.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-card">
                <div className="text-sm">
                  <span className="font-semibold text-text-primary">{u.display_name || u.username}</span>
                  <span className="text-text-muted ml-2">@{u.username}</span>
                </div>
                <button
                  onClick={() => grant(u.id)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-correct text-white"
                >Grant</button>
              </div>
            ))}
          </div>
        )}
        {search.length >= 2 && candidates.length === 0 && (
          <div className="mt-2 text-xs text-text-muted">No matching users (already-granted writers filtered out).</div>
        )}
      </div>

      {/* Current writers */}
      <div className="bg-bg-primary border border-text-primary/20 rounded-xl p-4">
        <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Current writers ({writers.length})</div>
        {loading ? (
          <div className="text-text-muted text-sm">Loading...</div>
        ) : writers.length === 0 ? (
          <div className="text-text-muted text-sm">No writers yet. Search above to grant.</div>
        ) : (
          <div className="space-y-1">
            {writers.map((w) => (
              <div key={w.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-card">
                <div className="text-sm">
                  <span className="font-semibold text-text-primary">{w.display_name || w.username}</span>
                  <span className="text-text-muted ml-2">@{w.username}</span>
                  {w.is_admin && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent/20 text-accent ml-2">ADMIN</span>}
                </div>
                <button
                  onClick={() => revoke(w.id)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-incorrect/20 text-incorrect"
                >Revoke</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
