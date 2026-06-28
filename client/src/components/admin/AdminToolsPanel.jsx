import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchUsers } from '../../hooks/useInvitations'
import { useAdminUserLookup, useAdminSubscriptionOverride, useAdminGameSearch, useAdminGameOverride, useAdminResetPassword } from '../../hooks/useAdmin'
import { api } from '../../lib/api'
import { CATEGORIES, CATEGORY_CARDS, FORMAT_BY_VALUE } from '../../pages/CreateLeaguePage'
import Avatar from '../ui/Avatar'
import { toast } from '../ui/Toast'

const SUB_STATUSES = ['active', 'expired', 'cancelled', 'past_due', 'trialing']
const PAYMENT_SOURCES = ['stripe', 'apple_iap', 'promo_code']

export default function AdminToolsPanel() {
  const [activeTab, setActiveTab] = useState('user') // user | games | formats

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'user', label: 'User Lookup' },
          { key: 'games', label: 'Game Override' },
          { key: 'formats', label: 'Format Visibility' },
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
      {activeTab === 'formats' && <FormatVisibility />}
    </div>
  )
}

// =====================================================================
// Format Visibility — admin toggle per league-format CARD (mirrors the
// exact card list on the Create League page in the exact same order, so
// per-sport variants like NBA Pick'em vs MLB Pick'em can be hidden
// independently). Stored in app_settings under `disabled_format_cards`
// as a JSON array of card keys. Flip a toggle here and the change takes
// effect for every user on their next page load — no client release.
// =====================================================================

function cardLabel(card) {
  if (card.label) return card.label
  const base = FORMAT_BY_VALUE[card.format]
  return base?.label || card.format
}

function FormatVisibility() {
  const queryClient = useQueryClient()
  const { data: setting } = useQuery({
    queryKey: ['app-settings', 'disabled_format_cards'],
    queryFn: () => api.get('/admin/app-settings/disabled_format_cards'),
  })
  const disabledList = (() => {
    const raw = setting?.value
    if (Array.isArray(raw)) return raw
    if (Array.isArray(raw?.keys)) return raw.keys
    return []
  })()
  const disabled = new Set(disabledList)

  const save = useMutation({
    mutationFn: (list) => api.put('/admin/app-settings/disabled_format_cards', { value: list }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings', 'disabled_format_cards'] })
      toast('Saved', 'success')
    },
    onError: (err) => toast(err.message || 'Failed to save', 'error'),
  })

  function toggle(key) {
    const next = disabled.has(key)
      ? disabledList.filter((k) => k !== key)
      : [...disabledList, key]
    save.mutate(next)
  }

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4 space-y-4">
      <div className="text-sm text-text-secondary">
        Toggle a format <span className="font-semibold">OFF</span> to hide it from the Create League picker for everyone. Existing leagues of that format keep working — only NEW league creation is blocked. Changes take effect on every user's next page load, no app update required.
      </div>
      {CATEGORIES.map((cat) => {
        const cards = CATEGORY_CARDS[cat.key] || []
        if (!cards.length) return null
        return (
          <div key={cat.key} className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-text-primary border-b border-text-primary/10 pb-1">
              {cat.label}
            </div>
            {cards.map((card) => {
              const isVisible = !disabled.has(card.key)
              return (
                <div
                  key={card.key}
                  className="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg hover:bg-bg-primary/40 transition-colors cursor-pointer"
                  onClick={() => !save.isPending && toggle(card.key)}
                >
                  <div>
                    <div className={`text-sm transition-colors ${isVisible ? 'text-text-primary' : 'text-text-muted'}`}>{cardLabel(card)}</div>
                    <div className="text-[10px] text-text-muted uppercase tracking-wider">{card.key}</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isVisible}
                    aria-label={`Toggle ${cardLabel(card)}`}
                    disabled={save.isPending}
                    onClick={(e) => { e.stopPropagation(); toggle(card.key) }}
                    className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
                      isVisible ? 'bg-accent' : 'bg-bg-secondary border border-text-primary/20'
                    }`}
                  >
                    <span
                      className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                        isVisible ? 'translate-x-[22px]' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}
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
  const resetPassword = useAdminResetPassword()

  const [editingSub, setEditingSub] = useState(false)
  const [subForm, setSubForm] = useState({})
  const [newPassword, setNewPassword] = useState('')

  // 12-char alphanumeric without ambiguous chars (no 0/O/1/l/I). Quick
  // "tap to fill" so admin doesn't have to invent one when texting a
  // user a temporary password.
  function generatePassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let out = ''
    for (let i = 0; i < 12; i++) out += chars.charAt(Math.floor(Math.random() * chars.length))
    setNewPassword(out)
  }

  async function handleResetPassword() {
    if (!newPassword || newPassword.length < 8) {
      toast('Password must be at least 8 characters', 'error')
      return
    }
    if (!confirm(`Set new password for @${user?.username}? You'll need to text this password to them.`)) return
    try {
      await resetPassword.mutateAsync({ user_id: selectedUserId, password: newPassword })
      toast('Password updated', 'success')
      // Keep the password in the field so admin can copy/text it.
      // They'll close the panel or pick a different user to clear it.
    } catch (err) {
      toast(err.message || 'Failed to update password', 'error')
    }
  }

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
                onClick={() => { setSelectedUserId(u.id); setSearch(''); setEditingSub(false); setNewPassword('') }}
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

          {/* Password Reset — for users who can't receive recovery emails. */}
          <div className="bg-bg-card rounded-xl border border-border p-4">
            <h3 className="font-semibold text-sm mb-3">Set New Password</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Type or generate (min 8 chars)"
                className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
              <button
                onClick={generatePassword}
                type="button"
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-bg-primary border border-border text-text-secondary hover:text-text-primary transition-colors"
              >
                Generate
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetPassword.isPending || !newPassword}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {resetPassword.isPending ? 'Setting...' : 'Set Password'}
              </button>
            </div>
            <div className="text-[10px] text-text-muted mt-2">
              Bypasses email — text the new password to the user directly. Field stays filled after save so you can copy it.
            </div>
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
                  {new Date(g.starts_at).toLocaleDateString()} · <span className={g.status === 'final' ? 'text-correct' : g.status === 'live' ? 'text-accent' : g.status === 'postponed' ? 'text-incorrect' : 'text-text-muted'}>{g.status}</span>
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
                <option value="live">Live</option>
                <option value="final">Final</option>
                <option value="postponed">Postponed</option>
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
