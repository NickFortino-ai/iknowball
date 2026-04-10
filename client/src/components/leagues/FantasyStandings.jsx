import { useState } from 'react'
import Avatar from '../ui/Avatar'
import UserProfileModal from '../profile/UserProfileModal'
import { useFantasyStandings } from '../../hooks/useLeagues'

export default function FantasyStandings({ league }) {
  const [selectedUserId, setSelectedUserId] = useState(null)
  const { data: serverStandings } = useFantasyStandings(league.id)

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

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-text-primary/10 text-text-muted text-xs">
              <th className="py-3 px-2 text-center font-semibold w-10">#</th>
              <th className="py-3 px-2 text-left font-semibold">Manager</th>
              <th className="py-3 px-2 text-center font-semibold">W-L-T</th>
              <th className="py-3 px-2 text-center font-semibold">PF</th>
              <th className="py-3 px-2 text-center font-semibold">PA</th>
              <th className="py-3 px-2 text-center font-semibold">Streak</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr
                key={s.userId}
                onClick={() => setSelectedUserId(s.userId)}
                className="border-b border-text-primary/10 last:border-0 hover:bg-text-primary/5 transition-colors cursor-pointer"
              >
                <td className="py-3.5 px-2 text-center">
                  <span className={`font-display text-xl ${s.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>{s.rank}</span>
                </td>
                <td className="py-3.5 px-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar user={s.user} size="lg" />
                    <div className="min-w-0">
                      <div className="font-bold text-base text-text-primary truncate">
                        {s.user?.display_name || s.user?.username}
                      </div>
                      {s.fantasyTeamName && (
                        <div className="text-xs text-text-muted italic truncate">{s.fantasyTeamName}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-2 text-center text-text-primary text-base">
                  {s.wins || s.losses || s.ties ? `${s.wins}-${s.losses}-${s.ties}` : '--'}
                </td>
                <td className="py-3.5 px-2 text-center text-white font-display text-base">
                  {s.pointsFor > 0 ? s.pointsFor.toFixed(1) : '--'}
                </td>
                <td className="py-3.5 px-2 text-center text-text-primary text-base">
                  {s.pointsAgainst > 0 ? s.pointsAgainst.toFixed(1) : '--'}
                </td>
                <td className="py-3.5 px-2 text-center text-text-muted">{s.streak}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {standings.length === 0 && (
          <div className="text-center py-8 text-text-muted text-sm">No members yet</div>
        )}
      </div>
      {selectedUserId && (
        <UserProfileModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      )}
    </div>
  )
}
