import { useState } from 'react'
import Avatar from '../ui/Avatar'
import RosterModal from './RosterModal'
import FantasyGlobalRankModal from './FantasyGlobalRankModal'
import { useFantasyStandings, useGlobalRank } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'

export default function FantasyStandings({ league, isSalaryCap }) {
  const [selectedUser, setSelectedUser] = useState(null)
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

  const sortedStandings = (() => {
    if (!seasonStarted) {
      return [...standings].sort((a, b) => (a.userId === profile?.id ? -1 : b.userId === profile?.id ? 1 : 0))
    }
    if (!sortCol) return standings // default server order (W-L record)
    const key = sortCol === 'pf' ? 'pointsFor' : 'pointsAgainst'
    return [...standings].sort((a, b) => sortDir === 'desc' ? b[key] - a[key] : a[key] - b[key])
  })()

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="text-sm w-full">
          <thead>
            <tr className="border-b border-text-primary/10 text-text-muted text-xs">
              <th className="py-3 px-2 text-center font-semibold w-8">#</th>
              <th className="py-3 px-2 text-left font-semibold">Manager</th>
              <th className="py-3 px-2 text-center font-semibold">{isSalaryCap ? 'Wins' : 'W-L'}</th>
              <th
                className={`py-3 px-2 text-center font-semibold ${!isSalaryCap ? 'cursor-pointer select-none hover:text-text-primary' : ''}`}
                onClick={() => !isSalaryCap && handleSortClick('pf')}
              >
                {isSalaryCap ? 'Points' : 'PF'}{sortCol === 'pf' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
              </th>
              {!isSalaryCap && (
                <th
                  className="py-3 px-2 text-center font-semibold cursor-pointer select-none hover:text-text-primary"
                  onClick={() => handleSortClick('pa')}
                >
                  PA{sortCol === 'pa' ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
              )}
              {!isSalaryCap && <th className="py-3 px-2 text-center font-semibold">Streak</th>}
            </tr>
          </thead>
          <tbody>
            {sortedStandings.map((s) => (
              <tr
                key={s.userId}
                onClick={() => setSelectedUser(s)}
                className="border-b border-text-primary/10 last:border-0 hover:bg-text-primary/5 transition-colors cursor-pointer"
              >
                <td className="py-3.5 px-2 text-center">
                  <span className={`font-display text-xl ${seasonStarted && s.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>{seasonStarted ? s.rank : '--'}</span>
                </td>
                <td className="py-3.5 px-2">
                  <div className="flex items-center gap-3 min-w-0 overflow-hidden">
                    <Avatar user={s.user} size="lg" className="shrink-0" />
                    <div className="min-w-0 overflow-hidden">
                      <div className="font-bold text-base text-text-primary truncate">
                        {s.user?.display_name || s.user?.username}
                      </div>
                      {s.fantasyTeamName && (
                        <div className="text-xs text-text-muted italic uppercase tracking-wide truncate">{s.fantasyTeamName}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-2 text-center text-text-primary text-base">
                  {isSalaryCap
                    ? (s.wins > 0 ? s.wins : '--')
                    : (s.wins || s.losses || s.ties ? `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}` : '--')}
                </td>
                <td className="py-3.5 px-2 text-center text-white font-display text-base">
                  {s.pointsFor > 0 ? s.pointsFor.toFixed(1) : '--'}
                </td>
                {!isSalaryCap && (
                  <td className="py-3.5 px-2 text-center text-text-primary text-base">
                    {s.pointsAgainst > 0 ? s.pointsAgainst.toFixed(1) : '--'}
                  </td>
                )}
                {!isSalaryCap && (
                  <td className="py-3.5 px-2 text-center text-text-muted">{s.streak}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {sortedStandings.length === 0 && (
          <div className="text-center py-8 text-text-muted text-sm">No members yet</div>
        )}
      </div>

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

      {selectedUser && (
        <RosterModal
          league={league}
          userId={selectedUser.userId}
          user={selectedUser.user}
          fantasyTeamName={selectedUser.fantasyTeamName}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  )
}
