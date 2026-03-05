import { timeAgo } from '../../lib/time'
import Avatar from '../ui/Avatar'
import FeedReactions from './FeedReactions'
import PickComments from '../social/PickComments'

function formatOdds(odds) {
  return odds >= 0 ? `+${odds}` : `${odds}`
}

function getOddsTier(odds) {
  if (odds >= 500) return 'marquee'
  if (odds >= 300) return 'bold'
  return 'normal'
}

const BORDER_COLORS = {
  green: 'border-l-correct',
  red: 'border-l-incorrect',
  gold: 'border-l-yellow-500',
}

function getDescriptiveText(type, count) {
  switch (type) {
    case 'underdog_hit':
      return `${count} of your squad called this underdog`
    case 'multiplier_hit':
      return `${count} of your squad hit this multiplier`
    case 'multiplier_miss':
      return `${count} of your squad played this multiplier`
    case 'pick':
      return `${count} of your squad made this pick`
    default:
      return `${count} of your squad made this pick`
  }
}

function getBorderColor(type, pick) {
  if (type === 'underdog_hit') {
    const tier = getOddsTier(pick.odds_at_pick)
    return tier === 'marquee' ? 'gold' : 'green'
  }
  if (type === 'multiplier_hit') return 'green'
  if (type === 'multiplier_miss') return 'red'
  return pick.is_correct ? 'green' : 'red'
}

function getCardClassName(type, pick) {
  if (type === 'underdog_hit' && getOddsTier(pick.odds_at_pick) === 'marquee') return 'underdog-gold-glow'
  if (type === 'multiplier_hit') return 'multiplier-green-glow'
  return ''
}

export default function GroupedPickFeedCard({ item, reactions, onUserTap }) {
  const { pick, game, users, type } = item
  const borderColor = getBorderColor(type, pick)
  const borderClass = BORDER_COLORS[borderColor] || 'border-l-transparent'
  const cardClassName = getCardClassName(type, pick)

  // Show up to 3 avatars, then "+N"
  const visibleUsers = users.slice(0, 3)
  const extraCount = users.length - 3

  return (
    <div className={`bg-bg-card border border-border rounded-xl overflow-hidden border-l-4 ${borderClass} ${cardClassName}`}>
      {/* Header: avatar stack + descriptive text + timestamp */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-3">
        {/* Avatar stack */}
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

        {/* Description + timestamp */}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-text-primary leading-tight">
            {getDescriptiveText(type, users.length)}
          </div>
        </div>
        <span className="text-xs text-text-muted flex-shrink-0">{timeAgo(item.timestamp)}</span>
      </div>

      {/* Card body — mirrors the individual card layouts */}
      <div className="px-4 pb-3">
        {/* Type-specific banner */}
        {type === 'underdog_hit' && (
          <UnderdogBanner odds={pick.odds_at_pick} />
        )}
        {(type === 'multiplier_hit' || type === 'multiplier_miss') && (
          <MultiplierBanner pick={pick} isHit={type === 'multiplier_hit'} />
        )}

        {/* Sport tag */}
        {game.sport_name && (
          <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
            {game.sport_name}
          </span>
        )}

        {/* Matchup */}
        <div className="text-sm text-text-secondary mt-0.5">
          {game.away_team} @ {game.home_team}
        </div>

        {/* Pick details */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{pick.picked_team_name}</span>
            <span className="text-xs text-text-muted">{formatOdds(pick.odds_at_pick)}</span>
            {type === 'pick' && pick.multiplier > 1 && (
              <span className="text-[10px] font-bold bg-accent/20 text-accent px-1.5 py-0.5 rounded">
                {pick.multiplier}x
              </span>
            )}
          </div>
          <PickResult type={type} pick={pick} />
        </div>

        {/* Username list */}
        <div className="mt-2 flex flex-wrap gap-x-1.5 text-xs text-text-muted">
          {users.map((user, i) => (
            <span key={user.userId}>
              <button
                onClick={() => onUserTap?.(user.userId)}
                className="text-accent hover:underline"
              >
                {user.username}
              </button>
              {i < users.length - 1 && <span className="text-text-muted ml-0.5">&middot;</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Footer: reactions + comments (on first pick's ID) */}
      <div className="px-4 pb-3 space-y-1.5">
        <FeedReactions targetType="pick" targetId={pick.id} reactions={reactions} />
        <PickComments targetType="pick" targetId={pick.id} commentCount={item.commentCount} />
      </div>
    </div>
  )
}

function UnderdogBanner({ odds }) {
  const tier = getOddsTier(odds)
  return (
    <div className={`mb-2 rounded-lg px-3 text-center border ${
      tier === 'marquee'
        ? 'bg-yellow-500/15 border-yellow-500/40 py-3'
        : 'bg-correct/10 border-correct/30 py-2'
    }`}>
      <span className={`font-bold ${
        tier === 'marquee'
          ? 'text-yellow-400 text-lg'
          : tier === 'bold'
          ? 'text-correct text-base'
          : 'text-correct text-sm'
      }`}>
        UNDERDOG HIT {formatOdds(odds)}
      </span>
    </div>
  )
}

function MultiplierBanner({ pick, isHit }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <span className={`text-sm font-bold px-3 py-1 rounded-full ${
        isHit
          ? 'bg-correct/20 text-correct'
          : 'bg-incorrect/20 text-incorrect'
      }`}>
        {pick.multiplier}x
      </span>
      <span className={`font-bold text-lg ${isHit ? 'text-correct' : 'text-incorrect'}`}>
        {isHit ? `+${pick.points_earned} pts` : `\u{1F480} -${pick.risk_points} pts`}
      </span>
    </div>
  )
}

function PickResult({ type, pick }) {
  if (type === 'underdog_hit') {
    const tier = getOddsTier(pick.odds_at_pick)
    return (
      <span className={`font-bold text-correct ${tier === 'marquee' ? 'text-lg' : 'text-sm'}`}>
        W +{pick.points_earned}
      </span>
    )
  }

  if (type === 'multiplier_hit' || type === 'multiplier_miss') {
    const isHit = type === 'multiplier_hit'
    return (
      <span className={`font-bold text-sm ${isHit ? 'text-correct' : 'text-incorrect'}`}>
        {isHit ? 'W' : 'L'}
      </span>
    )
  }

  // Regular pick
  const won = pick.is_correct
  return (
    <span className={`font-bold text-sm ${won ? 'text-correct' : 'text-incorrect'}`}>
      {won ? 'W' : 'L'} {won ? `+${pick.points_earned}` : `-${pick.risk_points}`}
    </span>
  )
}
