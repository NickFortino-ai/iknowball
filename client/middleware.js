const BOT_PATTERN = /bot|crawl|spider|facebookexternalhit|WhatsApp|Twitterbot|Slackbot|LinkedInBot|Discordbot|TelegramBot|iMessageRichPreviewAgent|Googlebot|Applebot/i

export default function middleware(request) {
  const url = new URL(request.url)
  const match = url.pathname.match(/^\/join\/([A-Za-z0-9]+)$/)
  if (!match) return

  const ua = request.headers.get('user-agent') || ''
  if (!BOT_PATTERN.test(ua)) return

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>I KNOW BALL — Join this league!</title>
  <meta property="og:title" content="I KNOW BALL — Join this league!" />
  <meta property="og:description" content="You've been invited to join a league on I KNOW BALL. Tap to join and prove you know ball." />
  <meta property="og:image" content="https://iknowball.club/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url.href}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="I KNOW BALL — Join this league!" />
  <meta name="twitter:description" content="You've been invited to join a league on I KNOW BALL. Tap to join and prove you know ball." />
  <meta name="twitter:image" content="https://iknowball.club/og-image.png" />
</head>
<body></body>
</html>`

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export const config = {
  matcher: '/join/:code*',
}
