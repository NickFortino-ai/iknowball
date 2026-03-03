import { useState } from 'react'
import FeedCardWrapper from './FeedCardWrapper'
import ImageLightbox from './ImageLightbox'

export default function HotTakeFeedCard({ item, reactions, onUserTap }) {
  const { hot_take } = item
  const [lightboxOpen, setLightboxOpen] = useState(false)

  return (
    <FeedCardWrapper
      item={item}
      borderColor="purple"
      targetType="hot_take"
      targetId={hot_take.id}
      reactions={reactions}
      onUserTap={onUserTap}
      commentCount={item.commentCount}
    >
      {/* Tweet-style content */}
      <div className="text-sm text-text-primary leading-relaxed">
        {hot_take.content}
      </div>

      {/* Image */}
      {hot_take.image_url && (
        <button
          onClick={(e) => { e.stopPropagation(); setLightboxOpen(true) }}
          className="mt-2 block w-full"
        >
          <img
            src={hot_take.image_url}
            alt=""
            className="w-full max-h-72 object-cover rounded-lg"
          />
        </button>
      )}

      {/* Team tag */}
      {hot_take.team_tag && (
        <div className="mt-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider bg-accent/15 text-accent px-2 py-0.5 rounded-full">
            {hot_take.team_tag}
          </span>
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && hot_take.image_url && (
        <ImageLightbox
          src={hot_take.image_url}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </FeedCardWrapper>
  )
}
