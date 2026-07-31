import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FeedCardWrapper from './FeedCardWrapper'
import Avatar from '../ui/Avatar'
import RichContent from './RichContent'
import PostEmbed from './PostEmbed'
import LinkPreview from './LinkPreview'
import ImageLightbox from './ImageLightbox'
import { timeAgo } from '../../lib/time'
import { getPronouns } from '../../lib/pronouns'
import { extractFirstUrl } from '../../lib/urlUtils'

export default function HotTakeReminderFeedCard({ item, reactions, onUserTap }) {
  const { hot_take, reminded_user, self_remind } = item
  const navigate = useNavigate()
  const { possessive } = getPronouns(reminded_user?.title_preference)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [carouselIndex, setCarouselIndex] = useState(0)

  function handleQuoteTap(e) {
    e.stopPropagation()
    navigate(`/hub?tab=hot_takes&scrollTo=hot_take-${hot_take.id}`)
  }

  const allImages = hot_take.image_urls?.length
    ? hot_take.image_urls
    : hot_take.image_url ? [hot_take.image_url] : []

  // Self-remind (author reminding themselves) is a victory lap and
  // deserves the loud header. Rendered as a topBanner so it sits flush
  // against the top of the card, above the user header.
  const calledItBanner = self_remind ? (
    <div className="py-4 bg-gradient-to-b from-yellow-500/25 to-yellow-500/5 border-b border-yellow-500/30 text-center">
      <div className="font-display text-3xl text-yellow-400 tracking-wider drop-shadow-[0_0_12px_rgba(234,179,8,0.4)]">
        CALLED IT
      </div>
      <div className="text-sm text-yellow-500/90 font-semibold mt-1">
        Predicted {timeAgo(hot_take.created_at)} ago
      </div>
    </div>
  ) : null

  return (
    <FeedCardWrapper
      item={item}
      borderColor="accent"
      targetType="hot_take_reminder"
      targetId={item.id}
      reactions={reactions}
      onUserTap={onUserTap}
      commentCount={item.commentCount}
      topBanner={calledItBanner}
    >
      {/* Other-remind keeps the "reminded X of Y prediction" line inside
          the card body with the elapsed time in yellow. */}
      {!self_remind && (
        <div className="mb-3">
          <div className="text-sm text-text-secondary">
            reminded <span className="font-semibold text-accent">@{reminded_user?.username || 'unknown'}</span> of {possessive} prediction from{' '}
            <span className="font-semibold text-yellow-400">{timeAgo(hot_take.created_at)} ago</span>
          </div>
        </div>
      )}

      {/* Reminder comment (author's celebratory line) */}
      {item.comment && (
        <div className="text-base text-text-primary leading-relaxed mb-3 font-semibold">
          {item.comment}
        </div>
      )}

      {/* Full original post embed — includes text, image, tags, and any
          YouTube/X embed the author attached. Tap to jump to the source. */}
      <div
        onClick={handleQuoteTap}
        className="rounded-lg border border-text-primary/15 bg-bg-secondary/40 overflow-hidden cursor-pointer hover:bg-bg-secondary/60 transition-colors"
      >
        <div className="p-3 space-y-2">
          <RichContent
            text={`“${hot_take.content}”`}
            className="text-sm text-text-primary leading-relaxed italic"
          />

          {/* Images from the original post */}
          {allImages.length > 0 && (
            <div className="relative mt-2">
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(carouselIndex) }}
                className="block w-full"
              >
                <img
                  src={allImages[carouselIndex]}
                  alt=""
                  loading="lazy"
                  className="w-full rounded-lg"
                />
              </button>
              {allImages.length > 1 && (
                <>
                  {carouselIndex > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setCarouselIndex((i) => i - 1) }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                    >
                      &#8249;
                    </button>
                  )}
                  {carouselIndex < allImages.length - 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setCarouselIndex((i) => i + 1) }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                    >
                      &#8250;
                    </button>
                  )}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {allImages.map((_, i) => (
                      <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${i === carouselIndex ? 'bg-white' : 'bg-white/40'}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* YouTube / X embed from the original post */}
          {hot_take.embed_provider && hot_take.embed_ref_id && (
            <PostEmbed provider={hot_take.embed_provider} refId={hot_take.embed_ref_id} />
          )}
          {!hot_take.embed_provider && extractFirstUrl(hot_take.content) && (
            <LinkPreview url={extractFirstUrl(hot_take.content)} />
          )}

          {/* Tags + origin timestamp */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {hot_take.team_tags?.length > 0 && hot_take.team_tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-semibold uppercase tracking-wider text-accent px-2 py-0.5 rounded-full"
              >
                {tag}
              </span>
            ))}
            {hot_take.tagged_users?.length > 0 && hot_take.tagged_users.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1 text-[10px] font-semibold bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-full"
              >
                <Avatar user={u} size="xs" />
                @{u.username}
              </span>
            ))}
            <span className="text-xs font-semibold text-text-secondary">
              Originally posted {timeAgo(hot_take.created_at)}
            </span>
          </div>
        </div>
      </div>

      {lightboxIndex != null && allImages[lightboxIndex] && (
        <ImageLightbox src={allImages[lightboxIndex]} onClose={() => setLightboxIndex(null)} />
      )}
    </FeedCardWrapper>
  )
}
