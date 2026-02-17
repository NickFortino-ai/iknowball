import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const BASE_URL = 'https://api.the-odds-api.com/v4'
const MAX_RETRIES = 3

async function fetchFromOddsApi(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set('apiKey', env.ODDS_API_KEY)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url)

      // Don't retry client errors (400-499) except 429 (rate limit)
      if (!res.ok && res.status !== 429 && res.status >= 400 && res.status < 500) {
        const text = await res.text()
        logger.error({ status: res.status, body: text }, 'Odds API request failed')
        throw new Error(`Odds API error: ${res.status}`)
      }

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Odds API error: ${res.status} - ${text}`)
      }

      const remaining = res.headers.get('x-requests-remaining')
      const used = res.headers.get('x-requests-used')
      logger.info({ remaining, used }, 'Odds API quota')

      return res.json()
    } catch (err) {
      if (attempt === MAX_RETRIES || (err.message.includes('Odds API error: 4') && !err.message.includes('429'))) {
        throw err
      }
      const delay = 1000 * 2 ** (attempt - 1) // 1s, 2s, 4s
      logger.warn({ attempt, delay, err: err.message }, 'Odds API request failed, retrying')
      await new Promise((r) => setTimeout(r, delay))
    }
  }
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

export async function fetchPlayerProps(sportKey, eventId, markets) {
  const marketKeys = markets?.length ? markets.join(',') : 'player_points'
  return fetchFromOddsApi(`/sports/${sportKey}/events/${eventId}/odds`, {
    regions: 'us',
    markets: marketKeys,
    oddsFormat: 'american',
  })
}
