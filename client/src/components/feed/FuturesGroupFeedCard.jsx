import FeedCardWrapper from './FeedCardWrapper'
import Avatar from '../ui/Avatar'
import PlayerHeadshot from '../ui/PlayerHeadshot'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../../lib/teamLogos'

function isPlayerFuturesMarket(key) {
  if (typeof key !== 'string') return false
  return /_(mvp|opoy|dpoy|coy|roy|oroy|droy|comeback_player)$/.test(key)
}

function formatPickDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
}

// Name size scales with how early the call was. The point of this card is
// that calling the Brewers in August is not the same as calling them in
// October, and a flat list says they are. Banded rather than continuous so
// the column still reads as a list instead of a ransom note.
function callerTextClass(days) {
  if (days >= 60) return 'text-base font-bold text-yellow-400'
  if (days >= 30) return 'text-sm font-bold text-yellow-500/90'
  if (days >= 14) return 'text-sm font-semibold text-text-primary'
  return 'text-xs text-text-muted'
}

export default function FuturesGroupFeedCard({ item, reactions, onUserTap }) {
  const g = item.futures_group
  if (!g) return null
  const isPlayerMarket = isPlayerFuturesMarket(g.futures_sport_key)
  const logoUrl = isPlayerMarket ? null : getTeamLogoUrl(g.picked_outcome, g.sport_key)

  return (
    <FeedCardWrapper
      item={item}
      reactions={reactions}
      targetType="futures_group"
      targetId={g.market_id}
      // gold, matching the "called it" treatment inside the card — every
      // other feed card carries a colour on its left edge and this one read
      // as unfinished without it.
      borderColor="gold"
      // No byline: the card belongs to the market, not to any one caller.
      headerLayout="none"
    >
      <div className="rounded-2xl border border-yellow-500/30 bg-gradient-to-b from-yellow-500/[0.07] to-transparent p-4">
        <div className="text-center mb-3">
          <span className="text-sm font-bold text-yellow-500">
            {g.correct_count} IKB'ers called it
          </span>
        </div>

        <div className="flex flex-col items-center py-4 bg-gradient-to-b from-yellow-500/10 to-transparent rounded-xl mb-3">
          {isPlayerMarket ? (
            <div className="mb-3">
              <PlayerHeadshot url={g.player_headshot_url} name={g.picked_outcome} size="lg" className="w-20 h-20 text-xl" />
            </div>
          ) : logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="w-20 h-20 object-contain mb-3"
              onError={(e) => {
                const fb = getTeamLogoFallbackUrl(g.picked_outcome, g.sport_key)
                if (fb && e.target.src !== fb) e.target.src = fb
                else e.target.style.display = 'none'
              }}
            />
          ) : (
            <div className="text-5xl mb-3">{'🏆'}</div>
          )}
          <div className="font-display text-lg text-text-primary text-center px-4">{g.picked_outcome}</div>
          <div className="text-sm text-text-primary mt-1">{g.market_title}</div>
        </div>

        {/* Earliest first — the ordering IS the story. */}
        <div className="space-y-1.5">
          {(g.callers || []).map((c) => (
            <button
              key={c.userId}
              onClick={(e) => { e.stopPropagation(); onUserTap?.(c.userId) }}
              className="w-full flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors text-left"
            >
              <Avatar user={c} size="sm" />
              <span className={`truncate ${callerTextClass(c.days_before_settle)}`}>
                {c.display_name || c.username}
              </span>
              <span className="ml-auto flex items-center gap-2 shrink-0 text-[11px] text-text-muted tabular-nums">
                {/* Date hides on the narrowest screens — "82d out" carries the
                    same meaning in a third of the width, and the payout is
                    what should never be the thing that gets squeezed out. */}
                <span className="hidden sm:inline">{formatPickDate(c.pick_date)}</span>
                {/* White, and spelled out. This is the number the whole card
                    is arguing about — how early the call was — and it was
                    rendering at 60% opacity next to a full-strength date,
                    which put the emphasis on the wrong one. Room exists
                    because the date hides below sm. */}
                <span className="text-text-primary font-semibold">
                  {c.days_before_settle} day{c.days_before_settle === 1 ? '' : 's'} out
                </span>
                {c.points_earned != null && (
                  <span className="text-correct font-bold text-xs">+{c.points_earned}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>
    </FeedCardWrapper>
  )
}
