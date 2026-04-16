import { ImageResponse } from '@vercel/og'

// Vercel Edge Function — generates a 1200x630 PNG link-preview card
// for a league invite. Backdrop image as background, dark gradient
// overlay, league name + format/sport tag + commissioner + member
// count + JOIN NOW button. Cached at the edge so subsequent scrapes
// of the same league hit ~10ms.
//
// Endpoint: /api/og/league/[code]
// Used as og:image / twitter:image by /api/share/league/[code]

export const config = {
  runtime: 'edge',
}

const SUPABASE_PUBLIC_BUCKET = 'backdrop-approved'

const FORMAT_LABELS = {
  pickem: "PICK'EM",
  survivor: 'SURVIVOR',
  bracket: 'BRACKET',
  squares: 'SQUARES',
  fantasy: 'FANTASY FOOTBALL',
  nba_dfs: 'NBA DAILY FANTASY',
  mlb_dfs: 'MLB DAILY FANTASY',
  hr_derby: 'HOME RUN DERBY',
  td_pass: 'PASSING TD COMPETITION',
}

const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  basketball_wncaab: 'WNCAAB',
  americanfootball_ncaaf: 'NCAAF',
  basketball_wnba: 'WNBA',
  icehockey_nhl: 'NHL',
  soccer_usa_mls: 'MLS',
}

function backdropToAbsoluteUrl(filename, host) {
  if (!filename) return null
  if (filename.startsWith('custom/')) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    if (!supabaseUrl) return null
    return `${supabaseUrl}/storage/v1/object/public/${SUPABASE_PUBLIC_BUCKET}/${filename.slice(7)}`
  }
  return `https://${host}/backdrops/${filename}`
}

export default async function handler(req) {
  const url = new URL(req.url)
  // Vercel passes the dynamic segment via the URL path; pull from there.
  const code = url.pathname.split('/').pop()
  const host = req.headers.get('host') || 'iknowball.club'

  try {
  // Fetch league preview
  let league = null
  try {
    const apiBase = process.env.VITE_API_URL || 'https://iknowball.onrender.com/api'
    const res = await fetch(`${apiBase}/leagues/preview/${encodeURIComponent(code)}`)
    if (res.ok) league = await res.json()
  } catch (_) { /* fall through to fallback render */ }

  const formatLabel = league?.format ? (FORMAT_LABELS[league.format] || league.format.toUpperCase()) : 'LEAGUE'
  const sportLabel = league?.sport ? (SPORT_LABELS[league.sport] || league.sport.toUpperCase()) : null
  const tagLine = [formatLabel, sportLabel].filter(Boolean).join(' • ')
  const leagueName = league?.name || 'I KNOW BALL'
  const commissionerName = league?.users?.display_name || league?.users?.username || null
  const memberCount = league?.member_count ?? 0
  const memberLine = memberCount > 0
    ? `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`
    : 'New league'

  const backdropUrl = backdropToAbsoluteUrl(league?.backdrop_image, host)

  // Use @vercel/og's default embedded font (Noto Sans). Loading Oswald from
  // Google Fonts at the edge was producing 0-byte responses — too many
  // failure modes (network, CSS parse, weight mismatch). Vercel's bundled
  // font is reliable and we can layer on a vendored Oswald .ttf later if
  // we want a truer brand match.

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          backgroundColor: '#0a0a0a',
        }}
      >
        {/* Backdrop image, full bleed */}
        {backdropUrl && (
          <img
            src={backdropUrl}
            alt=""
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '1200px',
              height: '630px',
              objectFit: 'cover',
            }}
          />
        )}

        {/* Dark gradient overlay — strong at bottom for text legibility */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '1200px',
            height: '630px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 45%, rgba(0,0,0,0.2) 75%, rgba(0,0,0,0.05) 100%)',
            display: 'flex',
          }}
        />

        {/* IKB monogram top-right */}
        <div
          style={{
            position: 'absolute',
            top: '36px',
            right: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 14px',
            backgroundColor: 'rgba(0,0,0,0.55)',
            border: '2px solid rgba(255,255,255,0.18)',
            borderRadius: '10px',
          }}
        >
          <span
            style={{
              fontSize: '28px',
              fontWeight: 300,
              color: '#FF4D00',
              letterSpacing: '0.08em',
            }}
          >
            I KNOW BALL
          </span>
        </div>

        {/* Bottom content stack */}
        <div
          style={{
            position: 'absolute',
            left: '60px',
            right: '60px',
            bottom: '60px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
          }}
        >
          {/* Format / Sport tag */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px 16px',
              backgroundColor: '#FF4D00',
              borderRadius: '6px',
              marginBottom: '24px',
            }}
          >
            <span
              style={{
                fontSize: '22px',
                fontWeight: 500,
                color: '#ffffff',
                letterSpacing: '0.1em',
              }}
            >
              {tagLine}
            </span>
          </div>

          {/* League name — brand-aligned thin Oswald for the condensed look */}
          <div
            style={{
              display: 'flex',
              fontSize: leagueName.length > 28 ? '76px' : '96px',
              fontWeight: 300,
              color: '#ffffff',
              lineHeight: 1.0,
              letterSpacing: '0.02em',
              textShadow: '0 2px 12px rgba(0,0,0,0.7)',
              maxWidth: '1080px',
              marginBottom: '28px',
            }}
          >
            {leagueName}
          </div>

          {/* Bottom row: invited-by line + JOIN NOW button */}
          <div
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: '28px',
                fontWeight: 500,
                color: 'rgba(255,255,255,0.9)',
                letterSpacing: '0.02em',
              }}
            >
              {commissionerName
                ? `Invited by ${commissionerName} · ${memberLine}`
                : memberLine}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '18px 36px',
                backgroundColor: '#FF4D00',
                borderRadius: '10px',
                boxShadow: '0 4px 16px rgba(255,77,0,0.4)',
              }}
            >
              <span
                style={{
                  fontSize: '32px',
                  fontWeight: 500,
                  color: '#ffffff',
                  letterSpacing: '0.08em',
                }}
              >
                JOIN NOW →
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        // Cache the generated image at the CDN — same league hits ~10ms
        // after first scrape. 5 min s-maxage keeps it fresh enough that
        // backdrop / member-count changes propagate within minutes.
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400',
      },
    },
  )
  } catch (err) {
    // Renderer threw — never serve a 0-byte response. Redirect scrapers and
    // browsers to the static OG fallback instead. They'll re-scrape and get
    // a valid image.
    return new Response(null, {
      status: 302,
      headers: {
        Location: `https://${host}/og-image.png`,
        // Don't let CDNs cache the failure for long.
        'Cache-Control': 'public, max-age=60',
      },
    })
  }
}
