import FeedCardWrapper from './FeedCardWrapper'
import TierBadge from '../ui/TierBadge'

const TIER_ORDER = ['Rookie', 'Baller', 'Elite', 'Hall of Famer', 'GOAT']

const TIER_BORDER_COLORS = {
  Baller: 'blue-500',
  Elite: 'purple-500',
  'Hall of Famer': 'amber-500',
  GOAT: 'yellow-400',
}

function getPreviousTier(currentTier) {
  const idx = TIER_ORDER.indexOf(currentTier)
  if (idx <= 0) return null
  return TIER_ORDER[idx - 1]
}

export default function TierUpFeedCard({ item, onUserTap }) {
  const { tier } = item
  const previousTier = getPreviousTier(tier.name)

  return (
    <FeedCardWrapper
      item={item}
      borderColor={tier.name === 'GOAT' ? 'gold' : tier.name === 'Hall of Famer' ? 'gold' : 'accent'}
      onUserTap={onUserTap}
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">{'\u2B50'}</span>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {previousTier && (
              <>
                <TierBadge tier={previousTier} size="sm" />
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted flex-shrink-0">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </>
            )}
            <span className="shimmer inline-block">
              <TierBadge tier={tier.name} size="md" />
            </span>
          </div>
          <div className="text-xs text-text-muted mt-1">
            Leveled up!
          </div>
        </div>
      </div>
    </FeedCardWrapper>
  )
}
