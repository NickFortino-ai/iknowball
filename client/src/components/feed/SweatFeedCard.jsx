import { timeAgo } from '../../lib/time'
import Avatar from '../ui/Avatar'

export default function SweatFeedCard({ item, onUserTap }) {
  const { sweaters, game } = item

  const visibleUsers = sweaters.slice(0, 3)
  const extraCount = sweaters.length - 3

  return (
    <div className="bg-bg-primary border border-orange-500/30 rounded-xl overflow-hidden border-l-4 border-l-orange-400 shimmer">
      {/* Header: avatar stack + text */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-3">
        <div className="flex items-center flex-shrink-0">
          {visibleUsers.map((user, i) => (
            <button
              key={user.userId}
              onClick={() => onUserTap?.(user.userId)}
              className="hover:ring-2 hover:ring-accent/30 transition-shadow rounded-full"
              style={{ marginLeft: i > 0 ? '-8px' : 0, zIndex: visibleUsers.length - i }}
            >
              <Avatar
                user={{ avatar_url: user.avatar_url, avatar_emoji: user.avatar_emoji, username: user.username, display_name: user.display_name }}
                size="lg"
                className="ring-2 ring-bg-card"
              />
            </button>
          ))}
          {extraCount > 0 && (
            <span
              className="w-8 h-8 rounded-full bg-bg-primary text-xs font-bold text-text-muted flex items-center justify-center ring-2 ring-bg-card flex-shrink-0"
              style={{ marginLeft: '-8px', zIndex: 0 }}
            >
              +{extraCount}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-orange-400 leading-tight">
            {sweaters.length === 1
              ? `${sweaters[0].display_name || sweaters[0].username} is sweating this game`
              : `${sweaters.length} are sweating this game`}
          </div>
        </div>
        <span className="text-xs text-text-muted flex-shrink-0">{timeAgo(item.timestamp)}</span>
      </div>

      {/* Card body */}
      <div className="px-4 pb-3">
        {/* Sport tag */}
        {game.sport_name && (
          <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
            {game.sport_name}
          </span>
        )}

        {/* Matchup */}
        <div className="text-sm text-text-secondary mt-0.5 mb-2">
          {game.away_team} @ {game.home_team}
        </div>

        {/* Sweater picks */}
        <div className="space-y-1.5">
          {sweaters.map((s) => (
            <div key={s.userId} className="flex items-center justify-between text-xs bg-bg-secondary rounded-lg px-2 py-1.5">
              <button
                onClick={() => onUserTap?.(s.userId)}
                className="text-accent hover:underline font-medium"
              >
                @{s.username}
              </button>
              <span className="text-text-secondary font-medium">{s.picked_team_name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
