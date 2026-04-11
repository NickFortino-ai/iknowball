import { useState } from 'react'
import { useSearchUsers } from '../../hooks/useInvitations'
import { useAdminUserLookup, useAdminSubscriptionOverride, useAdminGameSearch, useAdminGameOverride } from '../../hooks/useAdmin'
import Avatar from '../ui/Avatar'
import { toast } from '../ui/Toast'

const SUB_STATUSES = ['active', 'expired', 'cancelled', 'past_due', 'trialing']
const PAYMENT_SOURCES = ['stripe', 'apple_iap', 'promo_code']

export default function AdminToolsPanel() {
  const [activeTab, setActiveTab] = useState('user') // user | games

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[
          { key: 'user', label: 'User Lookup' },
          { key: 'games', label: 'Game Override' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === t.key ? 'bg-accent text-white' : 'bg-bg-primary/50 border border-text-primary/20 text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'user' && <UserLookup />}
      {activeTab === 'games' && <GameOverride />}
    </div>
  )
}

// =====================================================================
// User Lookup + Subscription Override
// =====================================================================
function UserLookup() {
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState(null)
  const { data: searchResults } = useSearchUsers(search)
  const { data: userData, isLoading } = useAdminUserLookup(selectedUserId)
  const subOverride = useAdminSubscriptionOverride()

  const [editingSub, setEditingSub] = useState(false)
  const [subForm, setSubForm] = useState({})

  function startEditSub() {
    const u = userData?.user
    setSubForm({
      subscription_status: u?.subscription_status || '',
      subscription_plan: u?.subscription_plan || '',
      subscription_expires_at: u?.subscription_expires_at ? u.subscription_expires_at.split('T')[0] : '',
      is_paid: u?.is_paid ?? false,
      payment_source: u?.payment_source || '',
    })
    setEditingSub(true)
  }

  async function saveSub() {
    try {
      await subOverride.mutateAsync({
        user_id: selectedUserId,
        subscription_status: subForm.subscription_status || null,
        subscription_plan: subForm.subscription_plan || null,
        subscription_expires_at: subForm.subscription_expires_at ? new Date(subForm.subscription_expires_at).toISOString() : null,
        is_paid: subForm.is_paid,
        payment_source: subForm.payment_source || null,
      })
      toast('Subscription updated', 'success')
      setEditingSub(false)
    } catch (err) {
      toast(err.message || 'Failed to update', 'error')
    }
  }

  const user = userData?.user

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username or name..."
          className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        {search.length >= 2 && searchResults?.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
            {searchResults.map((u) => (
              <button
                key={u.id}
                onClick={() => { setSelectedUserId(u.id); setSearch(''); setEditingSub(false) }}
                className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-bg-card-hover transition-colors"
              >
                <Avatar user={u} size="md" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{u.display_name || u.username}</div>
                  <div className="text-xs text-text-muted">@{u.username}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* User Details */}
      {isLoading && <div className="text-sm text-text-muted">Loading...</div>}
      {user && (
        <div className="space-y-4">
          {/* Profile Header */}
          <div className="bg-bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-3 mb-3">
              <Avatar user={user} size="xl" />
              <div>
                <div className="font-bold text-lg">{user.display_name || user.username}</div>
                <div className="text-sm text-text-muted">@{user.username}</div>
              </div>
              <div className="ml-auto text-right">
                <div className="font-display text-2xl text-accent">{user.total_points}</div>
                <div className="text-xs text-text-muted">{user.tier} tier</div>
              </div>
            </div>
            <div className="text-xs text-text-muted">Joined {new Date(user.created_at).toLocaleDateString()}</div>
          </div>

          {/* Subscription */}
          <div className="bg-bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Subscription</h3>
              {!editingSub && (
                <button onClick={startEditSub} className="text-xs text-accent font-semibold hover:underline">Edit</button>
              )}
            </div>
            {editingSub ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Status</label>
                    <select value={subForm.subscription_status} onChange={(e) => setSubForm(f => ({ ...f, subscription_status: e.target.value }))}
                      className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent">
                      <option value="">None</option>
                      {SUB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Plan</label>
                    <select value={subForm.subscription_plan} onChange={(e) => setSubForm(f => ({ ...f, subscription_plan: e.target.value }))}
                      className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent">
                      <option value="">None</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Expires At</label>
                    <input type="date" value={subForm.subscription_expires_at} onChange={(e) => setSubForm(f => ({ ...f, subscription_expires_at: e.target.value }))}
                      className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Payment Source</label>
                    <select value={subForm.payment_source} onChange={(e) => setSubForm(f => ({ ...f, payment_source: e.target.value }))}
                      className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent">
                      <option value="">None</option>
                      {PAYMENT_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={subForm.is_paid} onChange={(e) => setSubForm(f => ({ ...f, is_paid: e.target.checked }))} />
                  <span className="text-text-primary">is_paid</span>
                </label>
                <div className="flex gap-2">
                  <button onClick={saveSub} disabled={subOverride.isPending}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white disabled:opacity-50">
                    {subOverride.isPending ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setEditingSub(false)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-bg-primary text-text-secondary border border-border">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-text-muted">Status</span>
                <span className={`font-semibold ${user.subscription_status === 'active' ? 'text-correct' : user.subscription_status === 'expired' ? 'text-incorrect' : 'text-text-primary'}`}>
                  {user.subscription_status || 'None'}
                </span>
                <span className="text-text-muted">Plan</span>
                <span>{user.subscription_plan || 'None'}</span>
                <span className="text-text-muted">Expires</span>
                <span>{user.subscription_expires_at ? new Date(user.subscription_expires_at).toLocaleDateString() : 'N/A'}</span>
                <span className="text-text-muted">Source</span>
                <span>{user.payment_source || 'None'}</span>
                <span className="text-text-muted">is_paid</span>
                <span className={user.is_paid ? 'text-correct' : 'text-incorrect'}>{user.is_paid ? 'Yes' : 'No'}</span>
                <span className="text-text-muted">Lifetime</span>
                <span>{user.is_lifetime ? 'Yes' : 'No'}</span>
              </div>
            )}
          </div>

          {/* Recent Picks */}
          <div className="bg-bg-card rounded-xl border border-border p-4">
            <h3 className="font-semibold text-sm mb-3">Recent Picks ({userData.picks?.length})</h3>
            {userData.picks?.length ? (
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {userData.picks.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-text-primary/5 last:border-0">
                    <span className={`w-4 text-center font-bold ${p.is_correct === true ? 'text-correct' : p.is_correct === false ? 'text-incorrect' : 'text-text-muted'}`}>
                      {p.is_correct === true ? 'W' : p.is_correct === false ? 'L' : '·'}
                    </span>
                    <span className="flex-1 truncate text-text-primary">
                      {p.games?.away_team} @ {p.games?.home_team}
                    </span>
                    <span className="text-text-muted">{p.picked_team}</span>
                    <span className={`font-semibold tabular-nums ${(p.points_earned || 0) >= 0 ? 'text-correct' : 'text-incorrect'}`}>
                      {p.points_earned != null ? (p.points_earned > 0 ? '+' : '') + p.points_earned : '--'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-text-muted">No picks</div>
            )}
          </div>

          {/* Leagues */}
          <div className="bg-bg-card rounded-xl border border-border p-4">
            <h3 className="font-semibold text-sm mb-3">Leagues ({userData.leagues?.length})</h3>
            {userData.leagues?.length ? (
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {userData.leagues.map((l) => (
                  <div key={l.league_id} className="flex items-center gap-2 text-xs py-1.5 border-b border-text-primary/5 last:border-0">
                    <span className="flex-1 truncate text-text-primary font-medium">{l.name}</span>
                    <span className="text-text-muted">{l.format}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${l.status === 'active' ? 'text-correct' : 'text-text-muted'}`}>{l.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-text-muted">No leagues</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================================
// Game Status Override
// =====================================================================
function GameOverride() {
  const [search, setSearch] = useState('')
  const { data: games } = useAdminGameSearch(search)
  const override = useAdminGameOverride()
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ status: '', winner: '', home_score: '', away_score: '' })

  function selectGame(game) {
    setSelected(game)
    setForm({
      status: game.status,
      winner: game.winner || '',
      home_score: game.home_score ?? '',
      away_score: game.away_score ?? '',
    })
    setSearch('')
  }

  async function handleOverride() {
    try {
      await override.mutateAsync({
        game_id: selected.id,
        status: form.status,
        winner: form.winner || null,
        home_score: form.home_score !== '' ? Number(form.home_score) : undefined,
        away_score: form.away_score !== '' ? Number(form.away_score) : undefined,
      })
      toast(`Game status updated to ${form.status}`, 'success')
      setSelected(null)
    } catch (err) {
      toast(err.message || 'Failed to override', 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by team name..."
          className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        {search.length >= 2 && games?.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-10 max-h-64 overflow-y-auto">
            {games.map((g) => (
              <button
                key={g.id}
                onClick={() => selectGame(g)}
                className="w-full text-left px-4 py-2.5 hover:bg-bg-card-hover transition-colors border-b border-text-primary/5 last:border-0"
              >
                <div className="text-sm font-medium">{g.away_team} @ {g.home_team}</div>
                <div className="text-xs text-text-muted">
                  {new Date(g.starts_at).toLocaleDateString()} · <span className={g.status === 'completed' ? 'text-correct' : g.status === 'in_progress' ? 'text-accent' : 'text-text-muted'}>{g.status}</span>
                  {g.home_score != null && ` · ${g.away_score}-${g.home_score}`}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="bg-bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="text-sm font-bold">{selected.away_team} @ {selected.home_team}</div>
          <div className="text-xs text-text-muted">{new Date(selected.starts_at).toLocaleString()} · Current: {selected.status}</div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent">
                <option value="upcoming">Upcoming</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Winner</label>
              <select value={form.winner} onChange={(e) => setForm(f => ({ ...f, winner: e.target.value }))}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent">
                <option value="">None</option>
                <option value="home">{selected.home_team}</option>
                <option value="away">{selected.away_team}</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">{selected.away_team} Score</label>
              <input type="number" value={form.away_score} onChange={(e) => setForm(f => ({ ...f, away_score: e.target.value }))}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">{selected.home_team} Score</label>
              <input type="number" value={form.home_score} onChange={(e) => setForm(f => ({ ...f, home_score: e.target.value }))}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent" />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleOverride} disabled={override.isPending}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white disabled:opacity-50">
              {override.isPending ? 'Saving...' : 'Apply Override'}
            </button>
            <button onClick={() => setSelected(null)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-bg-primary text-text-secondary border border-border">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
