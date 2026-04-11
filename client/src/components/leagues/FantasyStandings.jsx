import { useState } from 'react'
import Avatar from '../ui/Avatar'
import RosterModal from './RosterModal'
import { useFantasyStandings } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'

export default function FantasyStandings({ league, isSalaryCap }) {
  const [selectedUser, setSelectedUser] = useState(null)
  const { data: serverStandings } = useFantasyStandings(league.id)
  const { profile } = useAuth()

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
  const sortedStandings = seasonStarted
    ? standings
    : [...standings].sort((a, b) => (a.userId === profile?.id ? -1 : b.userId === profile?.id ? 1 : 0))

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-text-primary/10 text-text-muted text-xs">
              <th className="py-3 px-2 text-center font-semibold w-10">#</th>
              <th className="py-3 px-2 text-left font-semibold">Manager</th>
              <th className="py-3 px-2 text-center font-semibold">{isSalaryCap ? 'Wins' : 'W-L-T'}</th>
              <th className="py-3 px-2 text-center font-semibold">{isSalaryCap ? 'Points' : 'PF'}</th>
              {!isSalaryCap && <th className="py-3 px-2 text-center font-semibold">PA</th>}
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
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar user={s.user} size="lg" />
                    <div className="min-w-0">
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
                    : (s.wins || s.losses || s.ties ? `${s.wins}-${s.losses}-${s.ties}` : '--')}
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
