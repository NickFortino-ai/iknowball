import { useState, useEffect, useRef } from 'react'
import { Outlet, Link, useParams, useLocation } from 'react-router-dom'
import { getBackdropUrl } from '../../lib/backdropUrl'
import { useAuthStore } from '../../stores/authStore'

// ---------------------------------------------------------------------------
// HeroLayout — persistent hero across /, /signup, /login, /payment, /join/:code
// ---------------------------------------------------------------------------
// Owns the cycling stadium backdrops (IKB mode) so navigating between auth
// routes never resets the animation or remounts the wordmark. When a
// `pendingInviteCode` is queued in localStorage (or the URL is /join/:code),
// the layout fetches that league's preview and swaps the backdrop to the
// league's own image — same wordmark on top, league name as subtitle, form
// card slides in below via <Outlet />.

// Sixteen, ORDERED SO NO TWO CONSECUTIVE SHOTS ARE THE SAME SPORT. The hero
// cycles on a timer, and three ballparks in a row reads as one picture that
// failed to change.
//
// Every one was picked by LOOKING at it, not by resolution or file size. The
// bar is: a packed house, real light, and the playing surface roughly central
// so the wordmark sits over the pitch rather than over a crowd. Most of the
// library fails that — a lot of the NBA set is a beautiful EMPTY arena shot
// pre-game (Chase Center, TD Garden, Crypto.com), and Arrowhead is an empty
// bowl. Those are good backdrops and bad heroes.
//
// Also deliberately excluded: exteriors (the Superdome night shot is
// gorgeous, but it has CAESARS SUPERDOME and SUPER BOWL LIX baked into the
// frame, which fights the wordmark on top of it).
const IKB_HERO_IMAGES = [
  'nfl-mile-high.webp',          // orange balloon release — the accent colour, airborne
  'mlb-wrigley.webp',            // checkerboard outfield, Chicago skyline
  'nba-msg.webp',                // warm amber ceiling, full house
  'mlb-dodger.webp',             // World Series at dusk, hills behind
  'nfl-lambeau.webp',            // 1920x700 — already hero-shaped
  'mlb-globe-life-field.webp',
  'nba-scotiabank.webp',         // red and orange, live action
  'mlb-fenway.webp',             // Green Monster, CITGO, the skyline
  'nfl-gillette.webp',
  'mlb-oracle.webp',
  'nba-kaseya-center.webp',      // white-out crowd against a dark bowl
  'mlb-rogers-centre.webp',      // the flag across the outfield
  'nfl-us-bank.webp',
  'mlb-pnc.webp',
  'nfl-metlife-blue.webp',       // 2560x1440, the sharpest in the set
  'nba-fiserv.webp',
].map(getBackdropUrl)

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

function readPendingInviteCode() {
  try { return localStorage.getItem('pendingInviteCode') } catch { return null }
}

export default function HeroLayout() {
  const params = useParams()
  const location = useLocation()
  const session = useAuthStore((s) => s.session)

  // Only the auth-funnel routes consume pendingInviteCode. The home page (/)
  // always shows the IKB cycling hero, never the invite-league hero — a stale
  // pendingInviteCode in localStorage shouldn't bleed through to the signed-in
  // home page. /join/:code always uses the URL code regardless.
  const isInviteFlowRoute =
    location.pathname.startsWith('/join') ||
    location.pathname === '/signup' ||
    location.pathname === '/login' ||
    location.pathname === '/payment'
  const code = params.code || (isInviteFlowRoute ? readPendingInviteCode() : null)

  // Clean up stale pendingInviteCode for a logged-in user on the home page.
  // They either already joined or abandoned the flow; either way the code
  // shouldn't follow them around.
  useEffect(() => {
    if (session?.user && location.pathname === '/') {
      try { localStorage.removeItem('pendingInviteCode') } catch {}
    }
  }, [session?.user, location.pathname])

  const [leaguePreview, setLeaguePreview] = useState(null)
  const [leagueLoaded, setLeagueLoaded] = useState(false)

  // Fetch league preview when a code is present (public endpoint, no auth)
  useEffect(() => {
    if (!code) { setLeaguePreview(null); setLeagueLoaded(true); return }
    let cancelled = false
    setLeagueLoaded(false)
    fetch(`${BASE_URL}/leagues/preview/${code}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (!cancelled) { setLeaguePreview(data); setLeagueLoaded(true) } })
      .catch(() => { if (!cancelled) { setLeaguePreview(null); setLeagueLoaded(true) } })
    return () => { cancelled = true }
  }, [code])

  const useLeagueHero = !!(code && leaguePreview && leaguePreview.backdrop_image)

  // IKB cycling state — only animates when we're not in league mode. State
  // lives in the layout, so it persists across child route changes (the
  // whole point of the persistent layout).
  // Seeded at RANDOM, not 0.
  //
  // The layout persists across the auth routes but unmounts the moment you
  // leave for Picks or the Hub, so every return to the landing page
  // remounted the hero at index 0. With six images that was harmless. With
  // sixteen and an 11-second interval it takes nearly three minutes to see
  // the set, so a visitor would have met the first two and never the rest —
  // the other fourteen may as well not have been there.
  //
  // Lazy initialiser so it is picked once per mount, not on every render.
  const [heroIdx, setHeroIdx] = useState(() => Math.floor(Math.random() * IKB_HERO_IMAGES.length))
  // Captured at mount so the eager-loading hint below has a stable target —
  // reading heroIdx there would flip images to lazy as the cycle advances,
  // after they have already loaded.
  const firstHeroIdx = useRef(heroIdx)
  useEffect(() => {
    if (useLeagueHero) return
    const interval = setInterval(() => {
      setHeroIdx((i) => (i + 1) % IKB_HERO_IMAGES.length)
    }, 11000)
    return () => clearInterval(interval)
  }, [useLeagueHero])

  // Provide league context to children that want to reference it (e.g. the
  // join CTA copy on /join/:code or the "and immediately join X" line on
  // /payment). Stashed on window for now; could promote to React context.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__ikb_invite_league = leaguePreview || null
    }
  }, [leaguePreview])

  return (
    <div className="min-h-screen relative bg-bg-primary">
      {/* Backdrop layer — covers the full hero region. For league mode it's
          one static image; for IKB mode it's a crossfade between the
          cycling photos. */}
      <div className="absolute inset-x-0 top-0 h-[520px] sm:h-[560px] overflow-hidden pointer-events-none">
        {useLeagueHero ? (
          <img
            src={getBackdropUrl(leaguePreview.backdrop_image)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: `center ${leaguePreview.backdrop_y ?? 50}%` }}
          />
        ) : (
          IKB_HERO_IMAGES.map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                opacity: i === heroIdx ? 1 : 0,
                transform: i === heroIdx ? 'scale(1.05)' : 'scale(1)',
                transition: i === heroIdx
                  ? 'opacity 2.5s ease-in-out, transform 15s ease-out'
                  : 'opacity 2.5s ease-in-out, transform 0.01s 2.6s',
              }}
              // Eager for the image that opens and the one queued behind
              // it. Pinned to 0/1 this fetched two images the visitor might
              // never see while the one on screen waited its turn.
              loading={i === firstHeroIdx.current || i === (firstHeroIdx.current + 1) % IKB_HERO_IMAGES.length ? 'eager' : 'lazy'}
            />
          ))
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/55 to-bg-primary" />
      </div>

      {/* Foreground content: wordmark always; optional league subtitle */}
      <div className="relative z-10 px-4 pt-10 sm:pt-14 pb-6 text-center">
        <Link
          to="/"
          aria-label="I Know Ball"
          className="inline-block hover:opacity-90 transition-opacity"
        >
          <h1 className="font-display text-5xl sm:text-7xl text-accent tracking-tight drop-shadow-lg">
            I KNOW BALL
          </h1>
        </Link>
        {useLeagueHero && (
          <div className="mt-3 sm:mt-4">
            <div className="text-xs font-bold uppercase tracking-wider text-white/80 drop-shadow">
              You're invited to
            </div>
            <div className="font-display text-xl sm:text-2xl text-white mt-1 drop-shadow">
              {leaguePreview.name}
            </div>
          </div>
        )}
      </div>

      {/* Outlet — page content sits below the wordmark. Pages that want
          their own backdrop overlap (e.g. form cards) should render with
          transparency so the hero bleeds through, especially on mobile. */}
      <div className="relative z-10 px-4 pb-12">
        <Outlet context={{ leaguePreview, leagueLoaded, useLeagueHero }} />
      </div>
    </div>
  )
}
