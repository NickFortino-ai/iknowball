import FeedCardWrapper from './FeedCardWrapper'
import TierBadge from '../ui/TierBadge'

export default function TierUpFeedCard({ item, onUserTap }) {
  const { tier } = item

  return (
    <FeedCardWrapper
      item={item}
      borderColor="accent"
      onUserTap={onUserTap}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{'\u2B50'}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Reached</span>
          <TierBadge tier={tier.name} size="md" />
        </div>
      </div>
    </FeedCardWrapper>
  )
}
