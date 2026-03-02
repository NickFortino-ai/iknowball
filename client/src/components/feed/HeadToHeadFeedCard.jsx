import { timeAgo } from '../../lib/time'
import Avatar from '../ui/Avatar'

export default function HeadToHeadFeedCard({ item, onUserTap }) {
  const { matchup, game } = item
  const { userA, userB } = matchup

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden border-l-4 border-l-accent">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-accent font-bold text-xs uppercase tracking-wider">Head-to-Head</span>
          {game.sport_name && (
            <span className="text-[10px] text-text-muted uppercase">{game.sport_name}</span>
          )}
        </div>
        <span className="text-xs text-text-muted">{timeAgo(item.timestamp)}</span>
      </div>

      {/* Matchup line */}
      <div className="px-4 pb-1 text-xs text-text-secondary">
        {game.away_team} @ {game.home_team}
      </div>

      {/* Two-user layout */}
      <div className="px-4 pb-4 flex items-center gap-2">
        {/* User A */}
        <UserSide user={userA} onUserTap={onUserTap} />

        {/* VS */}
        <div className="flex-shrink-0 text-xs font-bold text-text-muted px-1">VS</div>

        {/* User B */}
        <UserSide user={userB} onUserTap={onUserTap} />
      </div>
    </div>
  )
}

function UserSide({ user, onUserTap }) {
  const won = user.is_correct

  return (
    <button
      onClick={() => onUserTap?.(user.userId)}
      className="flex-1 bg-bg-secondary rounded-lg px-3 py-2 flex flex-col items-center gap-1.5 hover:bg-border transition-colors"
    >
      <Avatar
        user={{ avatar_url: user.avatar_url, avatar_emoji: user.avatar_emoji, username: user.username, display_name: user.display_name }}
        size="md"
      />
      <span className="text-xs font-semibold text-accent truncate max-w-full">
        {user.display_name || user.username}
      </span>
      <span className="text-[10px] text-text-muted">{user.picked_team_name}</span>
      <span className={`text-xs font-bold ${won ? 'text-correct' : 'text-incorrect'}`}>
        {won ? 'W' : 'L'} {won ? `+${user.points_earned}` : `-${user.risk_points}`}
      </span>
    </button>
  )
}
