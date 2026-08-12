// Fixed-position, sport-specific hero backdrop for the Picks and
// Results pages. Prefers a vertically-composed image at
// /backdrops/hero/{sport}.{ext} (better for tall portrait viewports),
// falling back to the props-tile image at /backdrops/props/{sport}.{ext}
// so nothing goes empty while we're still adding hero art.
//
// Layered:
//   1) The image itself, contain-fitted on mobile / cover-fitted on
//      desktop, fixed, blurred slightly for a hero vibe rather than
//      a distracting focus. Mask-image fades top and bottom edges to
//      transparent so the mobile letterbox blends smoothly.
//   2) A dark bottom-to-top gradient scrim so page content stays
//      readable regardless of the image's palette.
//
// Sits behind page content via z-index; page content itself is
// unchanged. Renders nothing if the sport has no backdrop art yet.

// Maps the odds-API full sport key (basketball_nba) to the short
// key used in the props backdrop filenames (nba). Keys not in this
// map render no backdrop — falls through to the app's default bg.
const FULL_KEY_TO_SHORT = {
  basketball_nba: 'nba',
  basketball_wnba: 'wnba',
  baseball_mlb: 'mlb',
  americanfootball_nfl: 'nfl',
  americanfootball_nfl_preseason: 'nfl',
  americanfootball_ncaaf: 'ncaaf',
  basketball_ncaab: 'ncaab',
  soccer_usa_mls: 'mls',
}

// Same file extensions as PropsSection's SPORTS list.
const BACKDROP_FILENAME = {
  nba: 'nba.webp',
  wnba: 'wnba.jpg',
  mlb: 'mlb.jpg',
  nfl: 'nfl.jpg',
  ncaaf: 'ncaaf.jpg',
  ncaab: 'ncaab.webp',
  mls: 'mls.jpg',
}

export default function SportBackdrop({ sportKey }) {
  // Accept either short ('nba') or full ('basketball_nba') keys.
  const short = FULL_KEY_TO_SHORT[sportKey] || sportKey
  const filename = BACKDROP_FILENAME[short]
  if (!filename) return null
  const heroUrl = `/backdrops/hero/${filename}`
  const propsUrl = `/backdrops/props/${filename}`
  return (
    <>
      {/* Mobile: object-contain so the whole image fits inside the
          tall portrait viewport (no aggressive crop). Desktop:
          object-cover since wide viewports don't crop awkwardly.
          The mask-image gradient softens the top+bottom edges so
          the mobile letterbox blends smoothly instead of a stark
          cut. onError falls back from /hero/ to /props/ so as long
          as one exists, the backdrop renders. */}
      <img
        src={heroUrl}
        alt=""
        aria-hidden
        onError={(e) => {
          if (e.currentTarget.src !== window.location.origin + propsUrl && !e.currentTarget.src.endsWith(propsUrl)) {
            e.currentTarget.src = propsUrl
          } else {
            e.currentTarget.style.display = 'none'
          }
        }}
        className="fixed inset-0 z-0 pointer-events-none w-full h-full object-center object-contain sm:object-cover bg-black"
        style={{
          filter: 'blur(1px) saturate(0.85)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
        }}
      />
      {/* Scrim: dark at both top and bottom, softer in the middle
          where the image sits. This intentionally obscures the
          letterbox transition on mobile (where object-contain leaves
          black bands top+bottom) so the image bleeds into darkness
          instead of showing a stark cut. Bottom is slightly darker
          than top so the parlay slip / navbar area stays legible. */}
      <div
        aria-hidden
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 25%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.95) 100%)',
        }}
      />
    </>
  )
}
