import Avatar from '../ui/Avatar'

export default function FantasyStandings({ league }) {
  const members = league.members || []

  // TODO: Once matchups are played, compute W-L-T, PF, PA, streak, waiver, moves from API
  // For now, show members with placeholder stats
  const standings = members
    .map((m, i) => ({
      rank: i + 1,
      user: m.users,
      userId: m.user_id,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      streak: '--',
      waiver: i + 1,
      moves: 0,
    }))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[600px]">
        <thead>
          <tr className="border-b border-border text-text-muted text-xs">
            <th className="py-3 px-2 text-center font-semibold w-12">Rank</th>
            <th className="py-3 px-2 text-left font-semibold">Team</th>
            <th className="py-3 px-2 text-center font-semibold">W-L-T</th>
            <th className="py-3 px-2 text-center font-semibold">PF</th>
            <th className="py-3 px-2 text-center font-semibold">PA</th>
            <th className="py-3 px-2 text-center font-semibold">Streak</th>
            <th className="py-3 px-2 text-center font-semibold">Waiver</th>
            <th className="py-3 px-2 text-center font-semibold">Moves</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.userId} className="border-b border-border last:border-0 hover:bg-bg-card-hover/30 transition-colors">
              <td className="py-3 px-2 text-center text-text-primary font-semibold">{s.rank}</td>
              <td className="py-3 px-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar user={s.user} size="sm" />
                  <span className="font-semibold text-text-primary truncate">
                    {s.user?.display_name || s.user?.username}
                  </span>
                </div>
              </td>
              <td className="py-3 px-2 text-center text-text-primary">
                {s.wins || s.losses || s.ties ? `${s.wins}-${s.losses}-${s.ties}` : '--'}
              </td>
              <td className="py-3 px-2 text-center text-text-primary">
                {s.pointsFor > 0 ? s.pointsFor.toFixed(2) : '--'}
              </td>
              <td className="py-3 px-2 text-center text-text-primary">
                {s.pointsAgainst > 0 ? s.pointsAgainst.toFixed(2) : '--'}
              </td>
              <td className="py-3 px-2 text-center text-text-primary">{s.streak}</td>
              <td className="py-3 px-2 text-center text-text-muted">{s.waiver}</td>
              <td className="py-3 px-2 text-center text-text-muted">{s.moves}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {standings.length === 0 && (
        <div className="text-center py-8 text-text-muted text-sm">No members yet</div>
      )}
    </div>
  )
}
