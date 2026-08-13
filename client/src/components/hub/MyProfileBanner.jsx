import { getTier } from '../../lib/scoring'
import Avatar from '../ui/Avatar'
import TierBadge from '../ui/TierBadge'
import SocialLinks from '../ui/SocialLinks'
import { getBackdropUrl } from '../../lib/backdropUrl'

// The signed-in user's identity card — avatar, name, handle, tier
// badge, and total points, layered over their profile backdrop.
// Shared between the Hub (top of the page) and Results (top of the
// page). Clicking anywhere on the card opens the user's own profile
// modal via the parent's onTap handler.
export default function MyProfileBanner({ profile, onTap }) {
  const tier = getTier(profile.total_points)
  const hasBackdrop = !!profile.backdrop_image

  return (
    <div
      onClick={onTap}
      className={`relative bg-bg-primary border border-text-primary/20 rounded-2xl mb-6 cursor-pointer hover:bg-text-primary/5 transition-colors overflow-hidden lg:max-w-2xl lg:mx-auto ${hasBackdrop ? 'p-5 lg:py-8' : 'p-5'}`}
    >
      {hasBackdrop && (
        <>
          <img
            src={getBackdropUrl(profile.backdrop_image)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none"
            style={{ objectPosition: `center ${profile.backdrop_y ?? 50}%` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-bg-primary/70 via-bg-primary/40 to-bg-primary/70 pointer-events-none" />
        </>
      )}
      <div className="relative z-10 flex items-center gap-4">
        <Avatar user={profile} size="2xl" className="bg-accent/15 border border-accent/25" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl truncate">{profile.display_name || profile.username}</div>
          <div className="text-text-muted text-sm">@{profile.username}</div>
          <SocialLinks user={profile} />
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <TierBadge tier={tier.name} size="md" />
          <span className="text-white font-display text-lg">{profile.total_points} pts</span>
        </div>
      </div>
    </div>
  )
}
