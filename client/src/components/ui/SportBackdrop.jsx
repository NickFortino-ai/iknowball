// Fixed-position, sport-specific hero backdrop for the Picks and
// Results pages. Reuses the same /backdrops/props/{sport}.{ext}
// images that power the props tile grid so a single asset set drives
// both surfaces.
//
// Layered:
//   1) The image itself, cover-fitted, fixed, blurred slightly for
//      a hero-vibe rather than a distracting focus.
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
}

// Same file extensions as PropsSection's SPORTS list.
const BACKDROP_FILENAME = {
  nba: 'nba.webp',
  wnba: 'wnba.jpg',
  mlb: 'mlb.jpg',
  nfl: 'nfl.jpg',
  ncaaf: 'ncaaf.jpg',
  ncaab: 'ncaab.webp',
}

export default function SportBackdrop({ sportKey }) {
  // Accept either short ('nba') or full ('basketball_nba') keys.
  const short = FULL_KEY_TO_SHORT[sportKey] || sportKey
  const filename = BACKDROP_FILENAME[short]
  if (!filename) return null
  const url = `/backdrops/props/${filename}`
  return (
    <>
      {/* Mobile: bg-contain so the whole image fits inside the tall
          portrait viewport (no aggressive crop) — dark background
          + scrim fills the empty top/bottom bands, which reads as
          a hero letterbox rather than empty space. Desktop: bg-cover
          since wide viewports don't crop the image awkwardly. */}
      <div
        aria-hidden
        className="fixed inset-0 z-0 pointer-events-none bg-center bg-no-repeat bg-contain sm:bg-cover bg-black"
        style={{
          backgroundImage: `url(${url})`,
          filter: 'blur(1px) saturate(0.85)',
        }}
      />
      {/* Scrim for readability. Slightly stronger at the bottom so
          the pinned parlay slip / navbar area stays legible. */}
      <div
        aria-hidden
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 60%, rgba(0,0,0,0.9) 100%)',
        }}
      />
    </>
  )
}
