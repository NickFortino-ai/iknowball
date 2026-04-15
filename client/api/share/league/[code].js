// Vercel serverless function — returns the SPA's index.html with the
// generic OG tags swapped for league-specific ones (backdrop image,
// league name, commissioner). Bots/scrapers (iMessage, X, FB,
// WhatsApp, Slack, Discord) get a custom rich preview while real
// users still load the full React app from this same response.
//
// Route: /join/[code] is rewritten to /api/share/league/[code]
// in vercel.json.

const SUPABASE_PUBLIC_BUCKET = 'backdrop-approved'

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  bracket: 'Bracket',
  squares: 'Squares',
  fantasy: 'Fantasy Football',
  nba_dfs: 'NBA Daily Fantasy',
  mlb_dfs: 'MLB Daily Fantasy',
  hr_derby: 'Home Run Derby',
  td_pass: 'Passing TD Competition',
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

export default async function handler(req, res) {
  const { code } = req.query
  const host = req.headers.host || 'iknowball.club'

  // 1. Fetch league preview from our server API
  let league = null
  try {
    const apiBase = process.env.VITE_API_URL || 'https://iknowball.onrender.com/api'
    const previewRes = await fetch(`${apiBase}/leagues/preview/${encodeURIComponent(code)}`)
    if (previewRes.ok) league = await previewRes.json()
  } catch (_) {
    // Fall through to default OG tags below
  }

  // 2. Pull the SPA's compiled index.html from the same Vercel deployment
  //    so we get the current bundle hashes / asset paths automatically.
  let indexHtml
  try {
    const indexRes = await fetch(`https://${host}/index.html`, {
      headers: { 'cache-control': 'no-cache' },
    })
    if (!indexRes.ok) throw new Error(`index.html fetch returned ${indexRes.status}`)
    indexHtml = await indexRes.text()
  } catch (err) {
    // If we can't fetch the SPA shell, just return a 500. Better to fail
    // visibly than serve a half-broken page.
    res.status(500).send('Failed to load app shell')
    return
  }

  // 3. Build the league-specific OG payload
  const formatLabel = league?.format ? (FORMAT_LABELS[league.format] || league.format) : null
  const commissionerName = league?.users?.display_name || league?.users?.username || null
  const memberCount = league?.member_count ?? 0

  const title = league
    ? `${league.name} — Join on I KNOW BALL`
    : 'I KNOW BALL — Invite link'
  const description = league
    ? `${commissionerName ? `${commissionerName} invited you to ` : 'You\'ve been invited to '}${formatLabel || 'a'} league with ${memberCount} ${memberCount === 1 ? 'member' : 'members'} so far. Tap to join.`
    : 'Tap to join the league on I KNOW BALL.'
  const backdropUrl = backdropToAbsoluteUrl(league?.backdrop_image, host) || `https://${host}/og-image.png`
  const canonicalUrl = `https://${host}/join/${encodeURIComponent(code)}`

  // 4. Patch the OG / Twitter / standard meta tags
  const replacements = [
    [/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`],
    [/<meta name="description"[^>]*\/>/, `<meta name="description" content="${escapeHtml(description)}" />`],
    [/<meta property="og:title"[^>]*\/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`],
    [/<meta property="og:description"[^>]*\/>/, `<meta property="og:description" content="${escapeHtml(description)}" />`],
    [/<meta property="og:image"[^>]*\/>/, `<meta property="og:image" content="${escapeHtml(backdropUrl)}" />`],
    [/<meta property="og:url"[^>]*\/>/, `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`],
    [/<meta name="twitter:title"[^>]*\/>/, `<meta name="twitter:title" content="${escapeHtml(title)}" />`],
    [/<meta name="twitter:description"[^>]*\/>/, `<meta name="twitter:description" content="${escapeHtml(description)}" />`],
    [/<meta name="twitter:image"[^>]*\/>/, `<meta name="twitter:image" content="${escapeHtml(backdropUrl)}" />`],
  ]

  let html = indexHtml
  for (const [regex, replacement] of replacements) {
    html = html.replace(regex, replacement)
  }

  // 5. Cache the response: short s-maxage so updates propagate within
  //    minutes, but allow CDN caching to absorb scraper traffic spikes.
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(html)
}
