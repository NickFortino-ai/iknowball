import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const BASE_URL = 'https://api.the-odds-api.com/v4'

async function fetchFromOddsApi(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set('apiKey', env.ODDS_API_KEY)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    logger.error({ status: res.status, body: text }, 'Odds API request failed')
    throw new Error(`Odds API error: ${res.status}`)
  }

  const remaining = res.headers.get('x-requests-remaining')
  const used = res.headers.get('x-requests-used')
  logger.info({ remaining, used }, 'Odds API quota')

  return res.json()
}

export async function fetchOdds(sportKey = 'americanfootball_nfl') {
  return fetchFromOddsApi(`/sports/${sportKey}/odds`, {
    regions: 'us',
    markets: 'h2h',
    oddsFormat: 'american',
  })
}

export async function fetchScores(sportKey = 'americanfootball_nfl') {
  return fetchFromOddsApi(`/sports/${sportKey}/scores`, {
    daysFrom: 3,
  })
}
