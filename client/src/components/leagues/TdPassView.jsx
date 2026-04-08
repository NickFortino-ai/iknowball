import { useState, useMemo } from 'react'
import {
  useTdPassQbs,
  useTdPassMyPicks,
  useTdPassLeaguePicks,
  useTdPassStandings,
  useTdPassCurrentWeek,
  useSubmitTdPassPick,
} from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import LoadingSpinner from '../ui/LoadingSpinner'
import Avatar from '../ui/Avatar'
import { toast } from '../ui/Toast'
import UserProfileModal from '../profile/UserProfileModal'

export default function TdPassView({ league, tab = 'picks' }) {
  const { profile } = useAuth()
  const { data: weekData } = useTdPassCurrentWeek()
  const currentWeek = weekData?.week
  const currentSeason = weekData?.season

  const { data: qbs, isLoading: qbsLoading } = useTdPassQbs(league.id)
  const { data: myPicks } = useTdPassMyPicks(league.id)
  const { data: leaguePicks } = useTdPassLeaguePicks(league.id)
  const { data: standingsData } = useTdPassStandings(league.id)
  const submit = useSubmitTdPassPick()

  const [search, setSearch] = useState('')
  const [profileUserId, setProfileUserId] = useState(null)

  const myCurrentPick = useMemo(() => {
    if (!currentWeek) return null
    return (myPicks || []).find((p) => p.week === currentWeek) || null
  }, [myPicks, currentWeek])

  const filteredQbs = useMemo(() => {
    if (!qbs) return []
    if (!search) return qbs
    const q = search.toLowerCase()
    return qbs.filter((p) => p.full_name?.toLowerCase().includes(q) || p.team?.toLowerCase().includes(q))
  }, [qbs, search])

  // History tab — group league picks by week, ordered desc
  const groupedHistory = useMemo(() => {
    const byWeek = {}
    for (const p of leaguePicks || []) {
      if (!byWeek[p.week]) byWeek[p.week] = []
      byWeek[p.week].push(p)
    }
    return Object.entries(byWeek)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([week, picks]) => ({ week: Number(week), picks }))
  }, [leaguePicks])

  async function handlePick(qb) {
    try {
      await submit.mutateAsync({ leagueId: league.id, qbPlayerId: qb.id })
      toast(`Picked ${qb.full_name} for week ${currentWeek}`, 'success')
    } catch (err) {
      toast(err.message || 'Failed to submit pick', 'error')
    }
  }

  // ── Standings tab ───────────────────────────────────────────────
  if (tab === 'standings') {
    const standings = standingsData?.standings || []
    return (
      <div>
        {!standings.length ? (
          <div className="text-center py-8 text-sm text-text-secondary">No picks yet.</div>
        ) : (
          <div className="rounded-2xl border border-text-primary/20 overflow-hidden">
            <div className="grid grid-cols-[2.5rem_1fr_3rem_4rem] gap-2 px-4 py-3 border-b border-text-primary/10 text-xs text-text-muted uppercase tracking-wider">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Picks</span>
              <span className="text-right">Pass TD</span>
            </div>
            {standings.map((s) => {
              const isMe = s.user?.id === profile?.id
              return (
                <button
                  key={s.user?.id}
                  onClick={() => setProfileUserId(s.user?.id)}
                  className={`w-full grid grid-cols-[2.5rem_1fr_3rem_4rem] gap-2 px-4 py-3.5 items-center border-b border-text-primary/10 last:border-b-0 text-left hover:bg-text-primary/5 transition-colors cursor-pointer ${isMe ? 'bg-accent/5' : ''}`}
                >
                  <span className={`font-display text-xl ${s.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>{s.rank}</span>
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar user={s.user} size="lg" />
                    <span className={`font-bold truncate text-base ${isMe ? 'text-accent' : 'text-text-primary'}`}>
                      {s.user?.display_name || s.user?.username}
                    </span>
                  </div>
                  <span className="text-sm text-text-muted text-right">{s.picks}</span>
                  <span className="font-display text-xl text-white text-right">{s.totalTds}</span>
                </button>
              )
            })}
          </div>
        )}
        {profileUserId && (
          <UserProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
        )}
      </div>
    )
  }

  // ── History tab ─────────────────────────────────────────────────
  if (tab === 'history') {
    if (!groupedHistory.length) {
      return <div className="text-center py-8 text-sm text-text-secondary">No picks have been made yet.</div>
    }
    return (
      <div className="space-y-4">
        {groupedHistory.map((group) => (
          <div key={group.week} className="rounded-xl border border-text-primary/20 overflow-hidden bg-bg-primary">
            <div className="px-4 py-2 border-b border-text-primary/10 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Week {group.week}</h3>
              <span className="text-[10px] text-text-muted">{group.picks.length} picks</span>
            </div>
            <div className="divide-y divide-text-primary/10">
              {group.picks.map((p) => {
                const isMe = p.user_id === profile?.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setProfileUserId(p.user_id)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-text-primary/5 transition-colors ${isMe ? 'bg-accent/5' : ''}`}
                  >
                    <Avatar user={p.users} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold truncate ${isMe ? 'text-accent' : 'text-text-primary'}`}>
                        {p.users?.display_name || p.users?.username}
                      </div>
                      <div className="text-[11px] text-text-muted truncate">{p.qb_name} · {p.team}</div>
                    </div>
                    {p.headshot_url && (
                      <img src={p.headshot_url} alt="" className="w-9 h-9 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                    )}
                    <div className="text-right shrink-0 w-12">
                      <div className="font-display text-lg text-white leading-none">{p.td_count}</div>
                      <div className="text-[9px] text-text-muted uppercase">TD</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {profileUserId && (
          <UserProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
        )}
      </div>
    )
  }

  // ── Picks tab (default) ─────────────────────────────────────────
  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-6 pb-24 lg:pb-0">
      {/* Left: current pick + my history summary */}
      <div>
        <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Week {currentWeek || '—'} Pick</h3>
            <span className="text-[10px] text-text-muted">Season {currentSeason || ''}</span>
          </div>
          {myCurrentPick ? (
            <div className="flex items-center gap-3 bg-accent/10 border border-accent/30 rounded-lg px-3 py-2.5">
              {myCurrentPick.headshot_url && (
                <img src={myCurrentPick.headshot_url} alt="" className="w-12 h-12 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-text-primary truncate">{myCurrentPick.qb_name}</div>
                <div className="text-xs text-text-muted">{myCurrentPick.team}</div>
              </div>
              <div className="text-right">
                <div className="font-display text-2xl text-accent leading-none">{myCurrentPick.td_count}</div>
                <div className="text-[10px] text-text-muted uppercase">Pass TD</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Pick a QB from the pool — you can swap until their game starts.</p>
          )}
        </div>

        {/* My used QBs (so user can see who they've already burned) */}
        {(myPicks?.length || 0) > 0 && (
          <div className="mb-4">
            <div className="text-xs text-text-muted uppercase tracking-wider mb-2">QBs You've Used</div>
            <div className="flex flex-wrap gap-1.5">
              {(myPicks || []).map((p) => (
                <span key={p.id} className="text-[10px] bg-text-primary/10 text-text-muted px-2 py-1 rounded-full">
                  W{p.week} · {p.qb_name} · {p.td_count} TD
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: QB pool */}
      <div className="rounded-xl border border-text-primary/20 overflow-hidden lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:sticky lg:top-4">
        <div className="px-4 py-3 border-b border-text-primary/10">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Available QBs</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search QBs..."
            className="w-full bg-bg-primary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        {qbsLoading ? (
          <div className="py-8"><LoadingSpinner /></div>
        ) : !filteredQbs.length ? (
          <div className="px-4 py-6 text-center text-xs text-text-muted">
            {!qbs?.length ? 'No QBs available — you may have used them all.' : 'No QBs match your search.'}
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            {filteredQbs.map((qb) => (
              <div key={qb.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-text-primary/10 last:border-b-0">
                {qb.headshot_url ? (
                  <img src={qb.headshot_url} alt="" className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-bg-secondary shrink-0 flex items-center justify-center text-[10px] text-text-muted font-bold">QB</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-text-primary truncate">{qb.full_name}</div>
                  <div className="text-xs text-text-muted truncate">
                    {qb.team}{qb.injury_status ? ` · ${qb.injury_status}` : ''}
                    {qb.matchup && (
                      <span className="ml-1">
                        · {qb.matchup.home_away === 'home' ? 'vs' : '@'} {qb.matchup.opponent}
                        {qb.matchup.starts_at && (
                          <span className="ml-1 text-text-secondary">
                            {new Date(qb.matchup.starts_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handlePick(qb)}
                  disabled={submit.isPending}
                  className="px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors text-xs font-semibold shrink-0 disabled:opacity-50"
                >
                  Pick
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
