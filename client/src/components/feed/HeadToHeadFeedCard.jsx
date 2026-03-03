import { timeAgo } from '../../lib/time'
import Avatar from '../ui/Avatar'
import FeedReactions from './FeedReactions'
import PickComments from '../social/PickComments'

function shortName(fullName) {
  if (!fullName) return ''
  const words = fullName.trim().split(/\s+/)
  return words[words.length - 1]
}

export default function HeadToHeadFeedCard({ item, reactions, onUserTap }) {
  const { matchup, game } = item
  const { userA, userB, record } = matchup

  const aWon = userA.is_correct
  const bWon = userB.is_correct
  const winner = aWon ? userA : bWon ? userB : null
  const loser = aWon ? userB : bWon ? userA : null

  const name = (u) => u.display_name || u.username

  // Narrative text
  let narrative
  if (winner) {
    narrative = `${name(winner)} beats ${name(loser)} head to head in their ${shortName(winner.picked_team_name)} vs ${shortName(loser.picked_team_name)} pick.`
  } else {
    narrative = `${name(userA)} and ${name(userB)} both missed on ${shortName(userA.picked_team_name)} vs ${shortName(userB.picked_team_name)}.`
  }

  // Record line
  let recordLine = null
  if (record) {
    if (winner) {
      const wWins = winner === userA ? record.userAWins : record.userBWins
      const lWins = winner === userA ? record.userBWins : record.userAWins
      if (wWins > lWins) {
        recordLine = `${name(winner)} is up ${wWins}-${lWins} against ${name(loser)} head to head!`
      } else if (wWins < lWins) {
        recordLine = `${name(winner)} won this one, but is still ${wWins}-${lWins} against ${name(loser)} head to head.`
      } else {
        recordLine = `${name(winner)} and ${name(loser)} are now tied ${wWins}-${lWins} head to head.`
      }
    } else {
      const aW = record.userAWins
      const bW = record.userBWins
      if (aW !== bW) {
        const leader = aW > bW ? userA : userB
        const trailer = aW > bW ? userB : userA
        recordLine = `${name(leader)} leads ${Math.max(aW, bW)}-${Math.min(aW, bW)} against ${name(trailer)} head to head.`
      } else {
        recordLine = `${name(userA)} and ${name(userB)} are tied ${aW}-${bW} head to head.`
      }
    }
  }

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

      {/* Narrative */}
      <div className="px-4 pb-2">
        <p className="text-sm text-text-primary">{narrative}</p>
        {recordLine && (
          <p className="text-sm text-text-muted mt-1">{recordLine}</p>
        )}
      </div>

      {/* Game cards */}
      <div className="px-4 pb-3 flex items-center gap-2">
        <UserSide user={userA} onUserTap={onUserTap} />
        <div className="flex-shrink-0 text-xs font-bold text-text-muted px-1">VS</div>
        <UserSide user={userB} onUserTap={onUserTap} />
      </div>

      {/* Reactions + comments */}
      {item.pickId && (
        <div className="px-4 pb-3 space-y-1.5">
          <FeedReactions targetType="head_to_head" targetId={item.pickId} reactions={reactions} />
          <PickComments targetType="head_to_head" targetId={item.pickId} commentCount={item.commentCount} />
        </div>
      )}
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
