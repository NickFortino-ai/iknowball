// Fixed-position, sport-specific hero backdrop for the Picks and
// Results pages. Reuses the /backdrops/props/ image library.
//
// Two modes per sport:
//   heroFit=true  — vertical composition, fills the mobile viewport
//                   edge-to-edge (object-cover on all sizes). No
//                   letterbox to hide, so the scrim is a normal
//                   bottom-heavier gradient.
//   heroFit=false — horizontal props-tile image. On mobile we use
//                   object-contain so the ball isn't cropped, and
//                   the scrim goes dark at BOTH edges to hide the
//                   letterbox transition. Desktop uses object-cover
//                   since wide viewports don't crop awkwardly.
//
// Sits behind page content via z-index. Renders nothing if the
// sport has no backdrop art.

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

// Per-sport backdrop config. heroFit flips mobile fit + scrim style
// based on whether the image is vertically composed for full-screen
// fill. Add heroFit:true as you swap in vertical versions per sport.
const BACKDROPS = {
  nba:   { url: '/backdrops/props/nba.webp',           heroFit: false },
  wnba:  { url: '/backdrops/props/wnba.jpg',           heroFit: false },
  mlb:   { url: '/backdrops/props/mlb.jpg',            heroFit: false },
  nfl:   { url: '/backdrops/props/nfl%20football.webp', heroFit: true },
  ncaaf: { url: '/backdrops/props/ncaaf.jpg',          heroFit: false },
  ncaab: { url: '/backdrops/props/ncaab.webp',         heroFit: false },
  mls:   { url: '/backdrops/props/mls.jpg',            heroFit: false },
}

// Symmetric dark-at-edges scrim: used for letterboxed (contain)
// backdrops to hide the top+bottom letterbox transition regardless
// of where the image edges fall for a given aspect ratio.
const SCRIM_LETTERBOX = 'linear-gradient(to bottom, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 25%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.95) 100%)'
// Bottom-heavier scrim: used for hero-fit backdrops where the image
// fills the viewport. Keeps the parlay slip / navbar area readable
// without over-darkening the top of the image.
const SCRIM_HERO = 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.9) 100%)'

export default function SportBackdrop({ sportKey }) {
  const short = FULL_KEY_TO_SHORT[sportKey] || sportKey
  const cfg = BACKDROPS[short]
  if (!cfg) return null

  const fitClass = cfg.heroFit
    ? 'object-cover'
    : 'object-contain sm:object-cover'
  const scrim = cfg.heroFit ? SCRIM_HERO : SCRIM_LETTERBOX

  return (
    <>
      <img
        src={cfg.url}
        alt=""
        aria-hidden
        onError={(e) => { e.currentTarget.style.display = 'none' }}
        className={`fixed inset-0 z-0 pointer-events-none w-full h-full object-center ${fitClass} bg-black`}
        style={{
          filter: 'blur(1px) saturate(0.85)',
          // Softens the image's top+bottom edges so hero-fit backdrops
          // (which reach viewport edges) don't butt against the header
          // or bottom nav in a hard line.
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
        }}
      />
      <div
        aria-hidden
        className="fixed inset-0 z-0 pointer-events-none"
        style={{ background: scrim }}
      />
    </>
  )
}
