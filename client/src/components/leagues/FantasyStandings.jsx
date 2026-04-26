import { Fragment, useState } from 'react'
import Avatar from '../ui/Avatar'
import RosterList from './RosterList'
import FantasyGlobalRankModal from './FantasyGlobalRankModal'
import UserProfileModal from '../profile/UserProfileModal'
import { useFantasyStandings, useGlobalRank } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'

function ChevronDown({ open }) {
  return (
    <svg
      className={`w-4 h-4 text-accent shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export default function FantasyStandings({ league, isSalaryCap }) {
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
        wins: 0, losses: 0, ties: 0,
        pointsFor: 0, pointsAgainst: 0,
        streak: '--',
        gamesPlayed: 0,
      }))

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
      {/* Desktop: full-width table */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-primary/10 text-text-muted text-xs">
              <th className="py-3 px-2 text-center font-semibold w-10">#</th>
              <th className="py-3 px-2 text-left font-semibold">Manager</th>
              <th className="py-3 px-3 text-center font-semibold cursor-pointer select-none hover:text-text-primary" onClick={() => handleSortClick('wl')}>{isSalaryCap ? 'Wins' : 'W-L'}</th>
              <th
                className={`py-3 px-3 text-center font-semibold ${!isSalaryCap ? 'cursor-pointer select-none hover:text-text-primary' : ''}`}
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
              return (
                <Fragment key={s.userId}>
                  <tr
                    onClick={() => toggleExpand(s.userId)}
                    className={`border-b border-text-primary/10 hover:bg-text-primary/5 transition-colors cursor-pointer ${isExpanded ? 'bg-text-primary/5' : ''}`}
                  >
                    <td className="py-3.5 px-2 text-center w-8">
                      <span className={`font-display text-xl ${seasonStarted && s.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>{seasonStarted ? s.rank : '--'}</span>
                    </td>
                    <td className="py-3.5 px-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setProfileUserId(s.userId) }}
                          className="shrink-0"
                        >
                          <Avatar user={s.user} size="lg" />
                        </button>
                        <div className="min-w-0 overflow-hidden flex-1">
                          <div className="font-bold text-sm md:text-base text-text-primary truncate">
                            {s.user?.display_name || s.user?.username}
                          </div>
                          {s.fantasyTeamName && (
                            <div className="text-xs text-text-primary italic uppercase tracking-wide truncate">{s.fantasyTeamName}</div>
                          )}
                        </div>
                        <ChevronDown open={isExpanded} />
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-center text-text-primary text-sm md:text-base font-semibold whitespace-nowrap">
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

      {/* Mobile: per-row blocks with internal sticky-left + scrollable-right stats, expansion below */}
      <div className="md:hidden">
        <div className="flex border-b border-text-primary/10 text-text-muted text-xs">
          <div className="shrink-0 flex">
            <div className="py-3 px-2 text-center font-semibold w-8">#</div>
            <div className="py-3 px-2 text-left font-semibold w-36">Manager</div>
          </div>
          <div className="flex-1 overflow-x-auto">
            <div className="flex min-w-max">
              <div className="py-3 px-3 text-center font-semibold w-16 cursor-pointer select-none hover:text-text-primary" onClick={() => handleSortClick('wl')}>{isSalaryCap ? 'Wins' : 'W-L'}</div>
              <div className={`py-3 px-3 text-center font-semibold w-16 ${!isSalaryCap ? 'cursor-pointer select-none hover:text-text-primary' : ''}`} onClick={() => !isSalaryCap && handleSortClick('pf')}>
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
        </div>
        {sortedStandings.map((s) => {
          const isExpanded = expandedUserId === s.userId
          return (
            <div key={s.userId} className={`border-b border-text-primary/10 ${isExpanded ? 'bg-bg-primary/40' : ''}`}>
              <div
                onClick={() => toggleExpand(s.userId)}
                className="flex items-stretch hover:bg-text-primary/5 transition-colors cursor-pointer"
              >
                <div className="shrink-0 flex items-center h-16">
                  <div className="px-2 text-center w-8">
                    <span className={`font-display text-xl ${seasonStarted && s.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>{seasonStarted ? s.rank : '--'}</span>
                  </div>
                  <div className="px-2 w-36">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setProfileUserId(s.userId) }}
                        className="shrink-0"
                      >
                        <Avatar user={s.user} size="lg" />
                      </button>
                      <div className="min-w-0 overflow-hidden flex-1">
                        <div className="font-bold text-sm text-text-primary truncate">{s.user?.display_name || s.user?.username}</div>
                        {s.fantasyTeamName && (
                          <div className="text-xs text-text-primary italic uppercase tracking-wide truncate">{s.fantasyTeamName}</div>
                        )}
                      </div>
                      <ChevronDown open={isExpanded} />
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-x-auto">
                  <div className="flex items-center h-16 min-w-max">
                    <div className="px-3 text-center text-text-primary text-sm w-16">
                      {isSalaryCap ? (s.wins > 0 ? s.wins : '--') : (s.wins || s.losses || s.ties ? `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}` : '--')}
                    </div>
                    <div className="px-3 text-center text-white font-display text-sm w-16">{s.pointsFor > 0 ? s.pointsFor.toFixed(1) : '--'}</div>
                    {!isSalaryCap && <div className="px-3 text-center text-text-primary text-sm w-16">{s.pointsAgainst > 0 ? s.pointsAgainst.toFixed(1) : '--'}</div>}
                    {!isSalaryCap && <div className="px-3 text-center text-text-muted text-sm w-16">{s.streak}</div>}
                  </div>
                </div>
              </div>
              {isExpanded && (
                <RosterList league={league} userId={s.userId} />
              )}
            </div>
          )
        })}
      </div>

      {sortedStandings.length === 0 && (
        <div className="text-center py-8 text-text-muted text-sm">No members yet</div>
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
