import { ImageResponse } from '@vercel/og'

// Vercel Edge Function — generates a 1200x630 PNG link-preview card
// for a league invite. Cached at the edge.
//
// Endpoint: /api/og/league/[code]
// Used as og:image / twitter:image by /api/share/league/[code]

export const config = {
  runtime: 'edge',
}

// Resolve a league's backdrop_image filename to a URL we can fetch.
// Preset backdrops have pre-generated 1000x525 JPEG thumbnails at
// /backdrops/og/<name>.jpg (much smaller than the original WebP, so
// inlining as a data URL stays well under Satori's practical limit).
// Custom user backdrops live in Supabase Storage — we use Supabase's
// built-in image transformation API to get a small variant on the fly.
function resolveBackdropUrl(filename, host) {
  if (!filename) return null
  if (filename.startsWith('custom/')) {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    if (!supabaseUrl) return null
    const objectPath = filename.slice(7)
    return `${supabaseUrl}/storage/v1/render/image/public/backdrop-approved/${objectPath}?width=1000&height=525&resize=cover&quality=55`
  }
  // Preset backdrop — strip extension, swap to /backdrops/og/<name>.jpg
  const baseName = filename.replace(/\.(webp|jpg|jpeg|png)$/i, '')
  return `https://${host}/backdrops/og/${baseName}.jpg`
}

// Pre-fetch the backdrop and inline it as a data URL. Satori's <img>
// loader is unreliable on cross-origin URLs; data URLs always render.
// We cap response size at 250KB so a misbehaving asset can't blow past
// the inline limit and break the whole card.
async function fetchBackdropAsDataUrl(url) {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    if (buffer.byteLength > 250_000) return null
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    // Convert ArrayBuffer to base64 in chunks to avoid call-stack overflow
    // on larger payloads (apply has an arg-count limit ~65k in some runtimes).
    const bytes = new Uint8Array(buffer)
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
    }
    return `data:${contentType};base64,${btoa(binary)}`
  } catch (_) {
    return null
  }
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

    // Pre-fetch backdrop as data URL — fails gracefully to null on any
    // size/network/parse issue, so a bad backdrop never breaks the card.
    const backdropUrl = resolveBackdropUrl(league?.backdrop_image, host)
    const backdropDataUrl = await fetchBackdropAsDataUrl(backdropUrl)

    // Satori is picky — no textShadow, no boxShadow, no em units, no
    // implicit children. Solid colors only, explicit pixel sizes
    // everywhere. Backdrop sits behind everything via absolute position.
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
            // Extra top/right padding so the IKB monogram doesn't get
            // clipped by close-button overlays in iMessage / X previews.
            padding: '90px 90px 60px 60px',
            position: 'relative',
          }}
        >
          {backdropDataUrl && (
            <img
              src={backdropDataUrl}
              alt=""
              width={1200}
              height={630}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '1200px',
                height: '630px',
                objectFit: 'cover',
                opacity: 0.55,
              }}
            />
          )}
          {backdropDataUrl && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '1200px',
                height: '630px',
                display: 'flex',
                background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.2) 100%)',
              }}
            />
          )}
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
          // Friendly inline filename so iMessage / Mail clients don't
          // surface the raw path segment ("L76QN7XE") as the file name
          // when they cache the image alongside the link preview.
          'Content-Disposition': 'inline; filename="iknowball-league.png"',
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
