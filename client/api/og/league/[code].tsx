import { ImageResponse } from '@vercel/og'

// Vercel Edge Function — generates a 1200x630 PNG link-preview card
// for a league invite. Cached at the edge.
//
// Endpoint: /api/og/league/[code]
// Used as og:image / twitter:image by /api/share/league/[code]

export const config = {
  runtime: 'edge',
}

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

export default async function handler(req) {
  const url = new URL(req.url)
  const code = url.pathname.split('/').pop()
  const host = req.headers.get('host') || 'iknowball.club'

  try {
    // Fetch league preview
    let league = null
    try {
      const apiBase = process.env.VITE_API_URL || 'https://iknowball.onrender.com/api'
      const res = await fetch(`${apiBase}/leagues/preview/${encodeURIComponent(code)}`)
      if (res.ok) league = await res.json()
    } catch (_) { /* fall through */ }

    const formatLabel = league?.format ? (FORMAT_LABELS[league.format] || league.format.toUpperCase()) : 'LEAGUE'
    const sportLabel = league?.sport ? (SPORT_LABELS[league.sport] || league.sport.toUpperCase()) : null
    const tagLine = [formatLabel, sportLabel].filter(Boolean).join(' • ')
    const leagueName = league?.name || 'I KNOW BALL'
    const commissionerName = league?.users?.display_name || league?.users?.username || null
    const memberCount = league?.member_count ?? 0
    const memberLine = memberCount > 0
      ? `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`
      : 'New league'

    // Minimal, defensive layout. Satori is picky — no textShadow, no
    // boxShadow, no em units, no implicit children. Solid colors only,
    // explicit pixel sizes everywhere.
    return new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            backgroundColor: '#0a0a0a',
            padding: '60px',
          }}
        >
          {/* Top row: IKB monogram */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <div
              style={{
                display: 'flex',
                padding: '10px 18px',
                backgroundColor: 'rgba(255,77,0,0.15)',
                border: '2px solid #FF4D00',
                borderRadius: '10px',
                fontSize: '28px',
                color: '#FF4D00',
                letterSpacing: '4px',
              }}
            >
              I KNOW BALL
            </div>
          </div>

          {/* Middle: league name */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                display: 'flex',
                padding: '10px 20px',
                backgroundColor: '#FF4D00',
                borderRadius: '6px',
                fontSize: '24px',
                color: '#ffffff',
                letterSpacing: '3px',
                marginBottom: '32px',
              }}
            >
              {tagLine}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: leagueName.length > 28 ? '78px' : '108px',
                color: '#ffffff',
                lineHeight: '1',
                maxWidth: '1080px',
              }}
            >
              {leagueName}
            </div>
          </div>

          {/* Bottom row: commissioner + JOIN NOW */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: '28px',
                color: '#cccccc',
              }}
            >
              {commissionerName
                ? `Invited by ${commissionerName} · ${memberLine}`
                : memberLine}
            </div>
            <div
              style={{
                display: 'flex',
                padding: '20px 40px',
                backgroundColor: '#FF4D00',
                borderRadius: '10px',
                fontSize: '32px',
                color: '#ffffff',
                letterSpacing: '3px',
              }}
            >
              JOIN NOW →
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400',
        },
      },
    )
  } catch (err) {
    // Renderer threw — never serve a 0-byte response. Redirect to the
    // static fallback so scrapers and browsers always get a valid image.
    return new Response(null, {
      status: 302,
      headers: {
        Location: `https://${host}/og-image.png`,
        'Cache-Control': 'public, max-age=60',
      },
    })
  }
}
