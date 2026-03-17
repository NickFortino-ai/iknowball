import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { ODDS_TO_ESPN, INJURY_SPORTS, BASKETBALL_SPORTS } from '../config/espnTeamMap.js'

const SEVERITY_ORDER = { Out: 0, Doubtful: 1, Questionable: 2, Probable: 3, 'Day-To-Day': 4 }
const NOTABLE_STATUSES = new Set(['Out', 'Doubtful', 'Questionable'])
const NBA_POSITIONS = ['pg', 'sg', 'sf', 'pf', 'c']

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchDepthChart(sportPath, espnTeamId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/teams/${espnTeamId}/depthcharts`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`ESPN depth chart ${res.status} for ${sportPath} team ${espnTeamId}`)
  }
  return res.json()
}

function extractBasketballData(data) {
  const chart = data.depthchart?.[0]
  if (!chart?.positions) return { starters: [], injuries: [] }

  const starters = []
  const injuredMap = new Map()
  const usedStarters = new Set()

  // Extract depth chart for the 5 positions (starter + backups)
  // Skip players already listed at a previous position
  for (const posKey of NBA_POSITIONS) {
    const pos = chart.positions[posKey]
    if (!pos?.athletes?.length) continue
    const posLabel = pos.position?.abbreviation?.toUpperCase() || posKey.toUpperCase()
    const depth = pos.athletes.map((a) => ({
      name: a.displayName,
      shortName: a.shortName,
    }))
    const starter = depth.find((p) => !usedStarters.has(p.name))
    if (starter) {
      usedStarters.add(starter.name)
      starters.push({
        position: posLabel,
        name: starter.name,
        shortName: starter.shortName,
        depth,
      })
    }
  }

  // Scan all positions for injuries
  for (const [, pos] of Object.entries(chart.positions)) {
    const posLabel = pos.position?.abbreviation || ''
    for (const athlete of pos.athletes || []) {
      if (!athlete.injuries?.length) continue
      if (injuredMap.has(athlete.id)) continue
      const inj = athlete.injuries[0]
      injuredMap.set(athlete.id, {
        name: athlete.displayName,
        shortName: athlete.shortName,
        position: posLabel.toUpperCase(),
        status: inj.status || 'Unknown',
        detail: inj.shortComment || '',
      })
    }
  }

  const injuries = [...injuredMap.values()].sort(
    (a, b) => (SEVERITY_ORDER[a.status] ?? 99) - (SEVERITY_ORDER[b.status] ?? 99)
  )

  return { starters, injuries }
}

function extractFootballInjuries(data) {
  const injuredMap = new Map()

  for (const chart of data.depthchart || []) {
    if (!chart?.positions) continue
    for (const [, pos] of Object.entries(chart.positions)) {
      const posLabel = pos.position?.abbreviation || ''
      for (const athlete of pos.athletes || []) {
        if (!athlete.injuries?.length) continue
        if (injuredMap.has(athlete.id)) continue
        const inj = athlete.injuries[0]
        injuredMap.set(athlete.id, {
          name: athlete.displayName,
          shortName: athlete.shortName,
          position: posLabel.toUpperCase(),
          status: inj.status || 'Unknown',
          detail: inj.shortComment || '',
        })
      }
    }
  }

  const injuries = [...injuredMap.values()].sort(
    (a, b) => (SEVERITY_ORDER[a.status] ?? 99) - (SEVERITY_ORDER[b.status] ?? 99)
  )

  return { starters: [], injuries }
}

async function getUpcomingTeams(sportKey) {
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', sportKey)
    .single()

  if (!sport) return []

  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const { data: games } = await supabase
    .from('games')
    .select('home_team, away_team')
    .eq('sport_id', sport.id)
    .eq('status', 'upcoming')
    .gte('starts_at', now.toISOString())
    .lte('starts_at', tomorrow.toISOString())

  if (!games?.length) return []

  const teams = new Set()
  for (const g of games) {
    if (g.home_team) teams.add(g.home_team)
    if (g.away_team) teams.add(g.away_team)
  }
  return [...teams]
}

export async function syncInjuries() {
  logger.info('Starting injury sync')
  let totalSynced = 0

  for (const [sportKey, sportPath] of Object.entries(INJURY_SPORTS)) {
    const teamNames = await getUpcomingTeams(sportKey)
    if (!teamNames.length) {
      logger.debug({ sportKey }, 'No upcoming games in 24h, skipping injury sync')
      continue
    }

    const isBasketball = BASKETBALL_SPORTS.has(sportKey)
    const sportMap = ODDS_TO_ESPN[sportKey] || {}
    let synced = 0

    for (const teamName of teamNames) {
      const espnId = sportMap[teamName]
      if (!espnId) {
        logger.warn({ sportKey, teamName }, 'No ESPN ID mapping for team')
        continue
      }

      try {
        const data = await fetchDepthChart(sportPath, espnId)
        const { starters, injuries } = isBasketball
          ? extractBasketballData(data)
          : extractFootballInjuries(data)

        const notableCount = injuries.filter((i) => NOTABLE_STATUSES.has(i.status)).length

        const { error } = await supabase
          .from('team_intel')
          .upsert({
            sport_key: sportKey,
            team_name: teamName,
            espn_team_id: espnId,
            starters,
            injuries,
            notable_injury_count: notableCount,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'sport_key,team_name' })

        if (error) {
          logger.error({ error, sportKey, teamName }, 'Failed to upsert team_intel')
        } else {
          synced++
        }
      } catch (err) {
        logger.error({ err, sportKey, teamName, espnId }, 'Failed to fetch depth chart')
      }

      await delay(150)
    }

    totalSynced += synced
    logger.info({ sportKey, synced, totalTeams: teamNames.length }, 'Injury sync for sport complete')
  }

  logger.info({ totalSynced }, 'Injury sync complete')
}
