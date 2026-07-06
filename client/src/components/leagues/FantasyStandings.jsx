import { Fragment, useState } from 'react'
import Avatar from '../ui/Avatar'
import RosterList from './RosterList'
import FantasyGlobalRankModal from './FantasyGlobalRankModal'
import StandingsRosterBanner from './StandingsRosterBanner'
import UserProfileModal from '../profile/UserProfileModal'
import { useFantasyStandings, useGlobalRank } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'

export default function FantasyStandings({ league, isSalaryCap, championMetric }) {
  // For salary cap leagues, highlight the column the league winner is
  // judged on (most wins vs total points) in green so it's obvious.
  const winsIsKey = isSalaryCap && championMetric === 'most_wins'
  const pointsIsKey = isSalaryCap && championMetric === 'total_points'
  const [expandedUserId, setExpandedUserId] = useState(null)
  const [profileUserId, setProfileUserId] = useState(null)
  const [showGlobalRank, setShowGlobalRank] = useState(false)
  const [sortCol, setSortCol] = useState(null) // null = default (W-L), 'pf', 'pa'
  const [sortDir, setSortDir] = useState('desc')
  const { data: serverStandings } = useFantasyStandings(league.id)
  const { profile } = useAuth()
  const { data: globalRankData } = useGlobalRank(league.id)
  const hasGlobalRank = globalRankData?.status === 'ok' && globalRankData?.format?.team_count > 1

  const standings = (serverStandings && serverStandings.length)
    ? serverStandings.map((s) => ({
        rank: s.rank,
        user: s.user,
        userId: s.user_id,
        fantasyTeamName: s.fantasy_team_name || null,
        clinched: !!s.fantasy_clinched_at,
        eliminated: !!s.fantasy_eliminated_at,
        wins: s.wins,
        losses: s.losses,
        ties: s.ties,
        pointsFor: s.pf,
        pointsAgainst: s.pa,
        streak: s.streak || '--',
        gamesPlayed: s.games_played,
      }))
    : (league.members || []).map((m, i) => ({
        rank: i + 1,
        user: m.users,
        userId: m.user_id,
        fantasyTeamName: m.fantasy_team_name || null,
        clinched: false,
        eliminated: false,
        wins: 0, losses: 0, ties: 0,
        pointsFor: 0, pointsAgainst: 0,
        streak: '--',
        gamesPlayed: 0,
      }))
  const anyClinched = standings.some((s) => s.clinched)
  const isCompleted = league.status === 'completed'

  // Podium treatment for completed leagues: 1st/2nd/3rd get colored
  // accents on their standings row. 2nd + 3rd rows also get more
  // vertical breathing room to visually promote them above 4th-Nth
  // (1st is already featured in the Trophy Card above the tabs).
  function podium(rank) {
    if (!isCompleted || rank > 3 || !rank) return null
    if (rank === 1) return { accent: 'border-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-500/5', label: '1st Place', bigger: false }
    if (rank === 2) return { accent: 'border-slate-300', text: 'text-slate-300', bg: 'bg-slate-300/5', label: '2nd Place', bigger: true }
    if (rank === 3) return { accent: 'border-amber-600', text: 'text-amber-500', bg: 'bg-amber-600/5', label: '3rd Place', bigger: true }
    return null
  }

  // Pre-season: no games played yet — show user on top, no rank numbers
  const seasonStarted = standings.some((s) => s.gamesPlayed > 0 || s.wins > 0 || s.losses > 0 || s.pointsFor > 0)

  function handleSortClick(col) {
    if (sortCol === col) {
      if (sortDir === 'desc') setSortDir('asc')
      else { setSortCol(null); setSortDir('desc') } // third tap resets to default
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  function toggleExpand(userId) {
    setExpandedUserId((prev) => (prev === userId ? null : userId))
  }

  const sortedStandings = (() => {
    if (!seasonStarted) {
      return [...standings].sort((a, b) => (a.userId === profile?.id ? -1 : b.userId === profile?.id ? 1 : 0))
    }
    if (!sortCol || sortCol === 'wl') return standings // default server order (W-L record)
    if (sortCol === 'streak') {
      return [...standings].sort((a, b) => {
        const parseStreak = (s) => { const m = (s || '').match(/([WL])(\d+)/); return m ? (m[1] === 'W' ? parseInt(m[2]) : -parseInt(m[2])) : 0 }
        return sortDir === 'desc' ? parseStreak(b.streak) - parseStreak(a.streak) : parseStreak(a.streak) - parseStreak(b.streak)
      })
    }
    const key = sortCol === 'pf' ? 'pointsFor' : 'pointsAgainst'
    return [...standings].sort((a, b) => sortDir === 'desc' ? b[key] - a[key] : a[key] - b[key])
  })()

  const desktopColCount = isSalaryCap ? 4 : 6 // # / Manager / W-L / PF (+ PA + Streak)

  return (
    <div>
      <StandingsRosterBanner />

      {/* Desktop: full-width table */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-primary/10 text-text-muted text-xs">
              <th className="py-3 px-2 text-center font-semibold w-10">#</th>
              <th className="py-3 px-2 text-left font-semibold">Manager</th>
              <th className={`py-3 px-3 text-center font-semibold cursor-pointer select-none hover:text-text-primary ${winsIsKey ? 'text-correct' : ''}`} onClick={() => handleSortClick('wl')}>{isSalaryCap ? 'Wins' : 'W-L'}</th>
              <th
                className={`py-3 px-3 text-center font-semibold ${!isSalaryCap ? 'cursor-pointer select-none hover:text-text-primary' : ''} ${pointsIsKey ? 'text-correct' : ''}`}
                onClick={() => !isSalaryCap && handleSortClick('pf')}
              >
                {isSalaryCap ? 'Points' : 'PF'}{sortCol === 'pf' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
              </th>
              {!isSalaryCap && (
                <th className="py-3 px-3 text-center font-semibold cursor-pointer select-none hover:text-text-primary" onClick={() => handleSortClick('pa')}>
                  PA{sortCol === 'pa' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
              )}
              {!isSalaryCap && <th className="py-3 px-3 text-center font-semibold cursor-pointer select-none hover:text-text-primary" onClick={() => handleSortClick('streak')}>Streak{sortCol === 'streak' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}</th>}
            </tr>
          </thead>
          <tbody>
            {sortedStandings.map((s) => {
              const isExpanded = expandedUserId === s.userId
              const p = podium(s.rank)
              const rowPad = p?.bigger ? 'py-5' : 'py-3.5'
              return (
                <Fragment key={s.userId}>
                  <tr
                    onClick={() => toggleExpand(s.userId)}
                    className={`border-b border-text-primary/10 hover:bg-text-primary/5 transition-colors cursor-pointer ${
                      isExpanded ? 'bg-text-primary/5' : ''
                    } ${p ? `${p.bg} border-l-4 ${p.accent}` : ''}`}
                  >
                    <td className={`${rowPad} px-2 text-center w-8`}>
                      <span className={`font-display text-xl ${p ? p.text : seasonStarted && s.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>{seasonStarted ? s.rank : '--'}</span>
                    </td>
                    <td className={`${rowPad} px-2`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setProfileUserId(s.userId) }}
                          className="shrink-0"
                        >
                          <Avatar user={s.user} size={p?.bigger ? '2xl' : 'lg'} />
                        </button>
                        <div className="min-w-0 overflow-hidden flex-1">
                          <div className="font-bold text-sm md:text-base text-text-primary truncate">
                            {s.user?.display_name || s.user?.username}
                            {s.clinched && <span className="text-correct font-bold ml-1" title="Clinched playoff spot">*</span>}
                          </div>
                          {p ? (
                            <div className={`text-[10px] uppercase tracking-widest font-bold ${p.text}`}>{p.label}</div>
                          ) : s.fantasyTeamName ? (
                            <div className="text-xs text-text-primary italic uppercase tracking-wide truncate">{s.fantasyTeamName}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className={`${rowPad} px-3 text-center text-text-primary text-sm md:text-base font-semibold whitespace-nowrap`}>
                      {isSalaryCap
                        ? (s.wins > 0 ? s.wins : '--')
                        : (s.wins || s.losses || s.ties ? `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}` : '--')}
                    </td>
                    <td className="py-3.5 px-3 text-center text-white font-display text-sm md:text-base whitespace-nowrap">
                      {s.pointsFor > 0 ? s.pointsFor.toFixed(1) : '--'}
                    </td>
                    {!isSalaryCap && (
                      <td className="py-3.5 px-3 text-center text-text-primary text-sm md:text-base whitespace-nowrap">
                        {s.pointsAgainst > 0 ? s.pointsAgainst.toFixed(1) : '--'}
                      </td>
                    )}
                    {!isSalaryCap && (
                      <td className="py-3.5 px-3 text-center text-text-muted text-sm">{s.streak}</td>
                    )}
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-text-primary/10 bg-bg-primary/40">
                      <td colSpan={desktopColCount} className="p-0">
                        <RosterList league={league} userId={s.userId} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: single shared horizontal scroll with sticky-left manager column.
          Expansion is sticky-positioned so it stays anchored to viewport left
          as the user scrolls the stats horizontally. */}
      <div className="md:hidden overflow-x-auto overscroll-x-none">
        <div className="min-w-max">
          {/* Header */}
          <div className="flex border-b border-text-primary/10 text-text-muted text-xs">
            <div className="sticky left-0 z-10 bg-bg-primary/40 backdrop-blur-sm shrink-0 flex">
              <div className="py-3 px-2 text-center font-semibold w-8">#</div>
              <div className="py-3 px-2 text-left font-semibold w-44">Manager</div>
            </div>
            <div className="flex">
              <div className={`py-3 px-3 text-center font-semibold w-16 cursor-pointer select-none hover:text-text-primary ${winsIsKey ? 'text-correct' : ''}`} onClick={() => handleSortClick('wl')}>{isSalaryCap ? 'Wins' : 'W-L'}</div>
              <div className={`py-3 px-3 text-center font-semibold w-16 ${!isSalaryCap ? 'cursor-pointer select-none hover:text-text-primary' : ''} ${pointsIsKey ? 'text-correct' : ''}`} onClick={() => !isSalaryCap && handleSortClick('pf')}>
                {isSalaryCap ? 'Points' : 'PF'}{sortCol === 'pf' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
              </div>
              {!isSalaryCap && (
                <div className="py-3 px-3 text-center font-semibold w-16 cursor-pointer select-none hover:text-text-primary" onClick={() => handleSortClick('pa')}>
                  PA{sortCol === 'pa' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                </div>
              )}
              {!isSalaryCap && <div className="py-3 px-3 text-center font-semibold w-16 cursor-pointer select-none hover:text-text-primary" onClick={() => handleSortClick('streak')}>Streak{sortCol === 'streak' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}</div>}
            </div>
          </div>
          {/* Rows */}
          {sortedStandings.map((s) => {
            const isExpanded = expandedUserId === s.userId
            const p = podium(s.rank)
            const rowHeight = p?.bigger ? 'h-20' : 'h-16'
            return (
              <div key={s.userId} className={`border-b border-text-primary/10 ${p ? `${p.bg} border-l-4 ${p.accent}` : ''}`}>
                <div
                  onClick={() => toggleExpand(s.userId)}
                  className={`flex items-stretch hover:bg-text-primary/5 transition-colors cursor-pointer ${rowHeight}`}
                >
                  <div className={`sticky left-0 z-10 backdrop-blur-sm shrink-0 flex items-center ${p ? p.bg : 'bg-bg-primary/40'}`}>
                    <div className="px-2 text-center w-8">
                      <span className={`font-display text-xl ${p ? p.text : seasonStarted && s.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>{seasonStarted ? s.rank : '--'}</span>
                    </div>
                    <div className="px-2 w-44">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setProfileUserId(s.userId) }}
                          className="shrink-0"
                        >
                          <Avatar user={s.user} size={p?.bigger ? 'xl' : 'lg'} />
                        </button>
                        <div className="min-w-0 overflow-hidden flex-1">
                          <div className="font-bold text-sm text-text-primary truncate">
                            {s.user?.display_name || s.user?.username}
                            {s.clinched && <span className="text-correct font-bold ml-1" title="Clinched playoff spot">*</span>}
                          </div>
                          {p ? (
                            <div className={`text-[10px] uppercase tracking-widest font-bold ${p.text}`}>{p.label}</div>
                          ) : s.fantasyTeamName ? (
                            <div className="text-xs text-text-primary italic uppercase tracking-wide truncate">{s.fantasyTeamName}</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="px-3 text-center text-text-primary text-sm w-16">
                      {isSalaryCap ? (s.wins > 0 ? s.wins : '--') : (s.wins || s.losses || s.ties ? `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}` : '--')}
                    </div>
                    <div className="px-3 text-center text-white font-display text-sm w-16">{s.pointsFor > 0 ? s.pointsFor.toFixed(1) : '--'}</div>
                    {!isSalaryCap && <div className="px-3 text-center text-text-primary text-sm w-16">{s.pointsAgainst > 0 ? s.pointsAgainst.toFixed(1) : '--'}</div>}
                    {!isSalaryCap && <div className="px-3 text-center text-text-muted text-sm w-16">{s.streak}</div>}
                  </div>
                </div>
                {isExpanded && (
                  <div className="sticky left-0 w-screen bg-bg-primary/40 pr-4">
                    <RosterList league={league} userId={s.userId} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {sortedStandings.length === 0 && (
        <div className="text-center py-8 text-text-muted text-sm">No members yet</div>
      )}

      {anyClinched && (
        <div className="mt-3 text-xs text-text-muted flex items-center gap-1.5 justify-center">
          <span className="text-correct font-bold">*</span>
          <span>Clinched playoff spot</span>
        </div>
      )}

      {hasGlobalRank && (
        <button
          onClick={() => setShowGlobalRank(true)}
          className="w-full mt-4 rounded-xl border border-text-primary/20 bg-bg-primary p-4 flex items-center justify-between hover:bg-bg-secondary transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div className="text-left">
              <div className="text-sm font-semibold text-text-primary">Global Rank</div>
              <div className="text-xs text-text-primary">See where your team ranks across all IKB leagues with the same roster and scoring settings.</div>
            </div>
          </div>
          <span className="text-text-muted">→</span>
        </button>
      )}

      {showGlobalRank && (
        <FantasyGlobalRankModal leagueId={league.id} onClose={() => setShowGlobalRank(false)} />
      )}

      {profileUserId && (
        <UserProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
      )}
    </div>
  )
}
