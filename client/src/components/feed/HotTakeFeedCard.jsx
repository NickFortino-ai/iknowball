import FeedCardWrapper from './FeedCardWrapper'

export default function HotTakeFeedCard({ item, reactions, onUserTap }) {
  const { hot_take } = item

  return (
    <FeedCardWrapper
      item={item}
      borderColor="accent"
      targetType="hot_take"
      targetId={hot_take.id}
      reactions={reactions}
      onUserTap={onUserTap}
    >
      {/* Quote-style content */}
      <div className="text-sm text-text-primary leading-relaxed">
        &ldquo;{hot_take.content}&rdquo;
      </div>

      {/* Team tag */}
      {hot_take.team_tag && (
        <div className="mt-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider bg-accent/15 text-accent px-2 py-0.5 rounded-full">
            {hot_take.team_tag}
          </span>
        </div>
      )}
    </FeedCardWrapper>
  )
}
