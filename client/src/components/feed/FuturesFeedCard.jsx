import FeedCardWrapper from './FeedCardWrapper'
import Avatar from '../ui/Avatar'
import { getTeamLogoUrl } from '../../lib/teamLogos'
import { getPronouns } from '../../lib/pronouns'

function formatPickDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
}

export default function FuturesFeedCard({ item, reactions, onUserTap }) {
  const { futures } = item
  const isHit = item.type === 'futures_hit'
  const logoUrl = getTeamLogoUrl(futures.picked_outcome, futures.sport_key)
  const pronouns = getPronouns(item.title_preference)

  if (isHit) {
    return (
      <FeedCardWrapper
        item={item}
        borderColor="gold"
        targetType="futures_pick"
        targetId={futures.id}
        reactions={reactions}
        onUserTap={onUserTap}
        commentCount={item.commentCount}
      >
        {/* "Called it" header */}
        <div className="text-center mb-3">
          <span className="text-sm font-bold text-yellow-500">
            {item.display_name || item.username} called this on {formatPickDate(futures.pick_date)}!
          </span>
        </div>

        {/* Centered team logo / visual */}
        <div className="flex flex-col items-center py-4 bg-gradient-to-b from-yellow-500/10 to-transparent rounded-xl mb-3">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="w-20 h-20 object-contain mb-3" onError={(e) => { e.target.style.display = 'none' }} />
          ) : (
            <div className="text-5xl mb-3">{'\uD83C\uDFC6'}</div>
          )}
          <div className="font-display text-lg text-text-primary text-center px-4">
            {futures.picked_outcome}
          </div>
          <div className="text-sm text-text-primary mt-1">{futures.market_title}</div>
        </div>

        {/* Narrative subtext */}
        <p className="text-xs text-text-secondary text-center mb-3 px-2 leading-relaxed">
          On {formatPickDate(futures.pick_date)}, {item.display_name || item.username} predicted that {futures.picked_outcome} would win the {futures.market_title?.replace(' Winner', '')}. They were right.
        </p>

        {/* User avatar + points */}
        <div className="flex items-center justify-center gap-3 pt-2 border-t border-text-primary/10">
          <Avatar user={{ avatar_url: item.avatar_url, avatar_emoji: item.avatar_emoji, username: item.username }} size="sm" />
          <span className="text-sm font-semibold text-text-primary">{item.display_name || item.username}</span>
          <span className="font-display text-lg text-correct">+{futures.points_earned}</span>
        </div>
      </FeedCardWrapper>
    )
  }

  // Pending futures pick
  const rewardPts = futures.reward_at_submission
  const winLine = rewardPts
    ? `${pronouns.subject === 'they' ? pronouns.subject.charAt(0).toUpperCase() + pronouns.subject.slice(1) + "'ll" : pronouns.subject.charAt(0).toUpperCase() + pronouns.subject.slice(1) + "'ll"} win ${rewardPts} points if ${pronouns.subject === 'they' ? "they're" : pronouns.subject === 'he' ? "he's" : "she's"} right`
    : null

  return (
    <FeedCardWrapper
      item={item}
      borderColor="silver"
      targetType="futures_pick"
      targetId={futures.id}
      reactions={reactions}
      onUserTap={onUserTap}
      commentCount={item.commentCount}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{'\uD83D\uDD2E'}</span>
        <span className="font-semibold text-sm text-text-secondary">Futures Pick</span>
      </div>

      <div className="bg-bg-primary border border-text-primary/20 rounded-xl px-4 py-4">
        <div className="flex flex-col items-center text-center">
          {logoUrl && (
            <img src={logoUrl} alt="" className="w-12 h-12 object-contain mb-2" onError={(e) => { e.target.style.display = 'none' }} />
          )}
          <div className="font-display text-lg text-text-primary">{futures.picked_outcome}</div>
          <div className="text-sm text-text-primary mt-1">{futures.market_title}</div>
          {winLine && (
            <div className="text-sm text-correct font-semibold mt-2">{winLine}</div>
          )}
        </div>
      </div>
    </FeedCardWrapper>
  )
}

/**
 * Standalone modal version of the futures hit card (for notification tap).
 * Same design as the feed card but rendered as a modal overlay.
 */
export function FuturesHitModal({ pick, market, user, onClose }) {
  const logoUrl = getTeamLogoUrl(pick.picked_outcome, market?.sport_key)
  const pickDate = formatPickDate(pick.created_at)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="bg-bg-secondary w-full max-w-sm rounded-2xl overflow-hidden border border-yellow-500/30"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-b from-yellow-500/20 to-transparent px-6 pt-6 pb-4 text-center">
          <div className="text-sm font-bold text-yellow-500 mb-4">
            {user?.display_name || user?.username} called this on {pickDate}!
          </div>

          {/* Team logo or trophy */}
          {logoUrl ? (
            <img src={logoUrl} alt="" className="w-24 h-24 object-contain mx-auto mb-3" onError={(e) => { e.target.style.display = 'none' }} />
          ) : (
            <div className="text-6xl mb-3">{'\uD83C\uDFC6'}</div>
          )}

          <div className="font-display text-xl text-text-primary">
            {pick.picked_outcome}
          </div>
          <div className="text-xs text-text-muted mt-1">{market?.title}</div>
        </div>

        {/* Narrative */}
        <div className="px-6 pb-4">
          <p className="text-xs text-text-secondary text-center leading-relaxed">
            On {pickDate}, {user?.display_name || user?.username} predicted that {pick.picked_outcome} would win the {market?.title?.replace(' Winner', '')}. They were right.
          </p>
        </div>

        {/* User + points */}
        <div className="px-6 pb-6 flex items-center justify-center gap-3 border-t border-text-primary/10 pt-4">
          <Avatar user={user} size="md" />
          <span className="font-semibold text-text-primary">{user?.display_name || user?.username}</span>
          <span className="font-display text-2xl text-correct">+{pick.points_earned}</span>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="w-full py-3 text-sm text-text-muted hover:text-text-primary border-t border-text-primary/10 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}
