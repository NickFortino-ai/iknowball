import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import {
  getNBAPlayerPool,
  getNBADFSRoster,
  saveNBADFSRoster,
  getNBADFSStandings,
  getNBANightlyResults,
} from '../services/nbaDfsService.js'
import { getFantasySettings } from '../services/fantasyService.js'

const router = Router()
router.use(requireAuth)

// ESPN's gamelog opponent.abbreviation is the source of truth, but for MLB
// (and occasionally NFL relocations) it's intermittently missing or returns
// the full team name. Canonical abbreviations match ESPN's own scoreboard
// codes so they stay aligned with the rest of the app.
const MLB_NAME_TO_ABBREV = {
  'arizona diamondbacks': 'ARI', 'diamondbacks': 'ARI', 'arizona': 'ARI', 'd-backs': 'ARI',
  'atlanta braves': 'ATL', 'braves': 'ATL', 'atlanta': 'ATL',
  'baltimore orioles': 'BAL', 'orioles': 'BAL', 'baltimore': 'BAL',
  'boston red sox': 'BOS', 'red sox': 'BOS', 'boston': 'BOS',
  'chicago cubs': 'CHC', 'cubs': 'CHC',
  'chicago white sox': 'CHW', 'white sox': 'CHW',
  'cincinnati reds': 'CIN', 'reds': 'CIN', 'cincinnati': 'CIN',
  'cleveland guardians': 'CLE', 'guardians': 'CLE', 'cleveland': 'CLE',
  'colorado rockies': 'COL', 'rockies': 'COL', 'colorado': 'COL',
  'detroit tigers': 'DET', 'tigers': 'DET', 'detroit': 'DET',
  'houston astros': 'HOU', 'astros': 'HOU', 'houston': 'HOU',
  'kansas city royals': 'KC', 'royals': 'KC', 'kansas city': 'KC',
  'los angeles angels': 'LAA', 'angels': 'LAA', 'la angels': 'LAA',
  'los angeles dodgers': 'LAD', 'dodgers': 'LAD', 'la dodgers': 'LAD',
  'miami marlins': 'MIA', 'marlins': 'MIA', 'miami': 'MIA',
  'milwaukee brewers': 'MIL', 'brewers': 'MIL', 'milwaukee': 'MIL',
  'minnesota twins': 'MIN', 'twins': 'MIN', 'minnesota': 'MIN',
  'new york mets': 'NYM', 'mets': 'NYM', 'ny mets': 'NYM',
  'new york yankees': 'NYY', 'yankees': 'NYY', 'ny yankees': 'NYY',
  'athletics': 'ATH', 'oakland athletics': 'ATH', 'oakland': 'ATH',
  'philadelphia phillies': 'PHI', 'phillies': 'PHI', 'philadelphia': 'PHI',
  'pittsburgh pirates': 'PIT', 'pirates': 'PIT', 'pittsburgh': 'PIT',
  'san diego padres': 'SD', 'padres': 'SD', 'san diego': 'SD',
  'san francisco giants': 'SF', 'giants': 'SF', 'san francisco': 'SF',
  'seattle mariners': 'SEA', 'mariners': 'SEA', 'seattle': 'SEA',
  'st. louis cardinals': 'STL', 'st louis cardinals': 'STL', 'cardinals': 'STL', 'st. louis': 'STL', 'st louis': 'STL',
  'tampa bay rays': 'TB', 'rays': 'TB', 'tampa bay': 'TB',
  'texas rangers': 'TEX', 'rangers': 'TEX', 'texas': 'TEX',
  'toronto blue jays': 'TOR', 'blue jays': 'TOR', 'toronto': 'TOR',
  'washington nationals': 'WSH', 'nationals': 'WSH', 'washington': 'WSH',
}
const NFL_NAME_TO_ABBREV = {
  'arizona cardinals': 'ARI', 'arizona': 'ARI',
  'atlanta falcons': 'ATL', 'falcons': 'ATL', 'atlanta': 'ATL',
  'baltimore ravens': 'BAL', 'ravens': 'BAL', 'baltimore': 'BAL',
  'buffalo bills': 'BUF', 'bills': 'BUF', 'buffalo': 'BUF',
  'carolina panthers': 'CAR', 'panthers': 'CAR', 'carolina': 'CAR',
  'chicago bears': 'CHI', 'bears': 'CHI', 'chicago': 'CHI',
  'cincinnati bengals': 'CIN', 'bengals': 'CIN', 'cincinnati': 'CIN',
  'cleveland browns': 'CLE', 'browns': 'CLE', 'cleveland': 'CLE',
  'dallas cowboys': 'DAL', 'cowboys': 'DAL', 'dallas': 'DAL',
  'denver broncos': 'DEN', 'broncos': 'DEN', 'denver': 'DEN',
  'detroit lions': 'DET', 'lions': 'DET', 'detroit': 'DET',
  'green bay packers': 'GB', 'packers': 'GB', 'green bay': 'GB',
  'houston texans': 'HOU', 'texans': 'HOU', 'houston': 'HOU',
  'indianapolis colts': 'IND', 'colts': 'IND', 'indianapolis': 'IND',
  'jacksonville jaguars': 'JAX', 'jaguars': 'JAX', 'jacksonville': 'JAX',
  'kansas city chiefs': 'KC', 'chiefs': 'KC', 'kansas city': 'KC',
  'los angeles chargers': 'LAC', 'chargers': 'LAC',
  'los angeles rams': 'LAR', 'rams': 'LAR',
  'las vegas raiders': 'LV', 'raiders': 'LV', 'las vegas': 'LV',
  'miami dolphins': 'MIA', 'dolphins': 'MIA', 'miami': 'MIA',
  'minnesota vikings': 'MIN', 'vikings': 'MIN', 'minnesota': 'MIN',
  'new england patriots': 'NE', 'patriots': 'NE', 'new england': 'NE',
  'new orleans saints': 'NO', 'saints': 'NO', 'new orleans': 'NO',
  'new york giants': 'NYG',
  'new york jets': 'NYJ', 'jets': 'NYJ',
  'philadelphia eagles': 'PHI', 'eagles': 'PHI', 'philadelphia': 'PHI',
  'pittsburgh steelers': 'PIT', 'steelers': 'PIT', 'pittsburgh': 'PIT',
  'san francisco 49ers': 'SF', '49ers': 'SF', 'san francisco': 'SF',
  'seattle seahawks': 'SEA', 'seahawks': 'SEA', 'seattle': 'SEA',
  'tampa bay buccaneers': 'TB', 'buccaneers': 'TB', 'tampa bay': 'TB',
  'tennessee titans': 'TEN', 'titans': 'TEN', 'tennessee': 'TEN',
  'washington commanders': 'WSH', 'commanders': 'WSH', 'washington': 'WSH',
}
// NYG and "Cardinals" are intentionally not in NFL aliases — both would
// be ambiguous (Giants vs Mets shorthand "giants"; Cardinals shared with
// MLB STL) so we lean on the full displayName key for those.

function resolveOpponentAbbrev(opponent, sport) {
  if (!opponent) return '?'
  // Trust ESPN's field when it's already a tidy 2-4 char code. Some events
  // nest the team under opponent.team; check that too.
  const directAbbr = (opponent.abbreviation || opponent.team?.abbreviation || '').trim()
  if (directAbbr && directAbbr.length <= 4) return directAbbr.toUpperCase()
  const map = sport === 'baseball_mlb' ? MLB_NAME_TO_ABBREV
    : sport === 'americanfootball_nfl' ? NFL_NAME_TO_ABBREV
    : null
  if (map) {
    const raw = [
      opponent.displayName, opponent.shortDisplayName, opponent.name,
      opponent.team?.displayName, opponent.team?.shortDisplayName, opponent.team?.name,
    ].filter(Boolean)
    for (const c of raw) {
      // Strip "@" / "vs" / "vs." prefixes ESPN sometimes injects into
      // event-context displayNames.
      const normalized = c.toLowerCase().trim().replace(/^(@|vs\.?)\s*/i, '').trim()
      const hit = map[normalized]
      if (hit) return hit
    }
  }
  return opponent.shortDisplayName || opponent.displayName || '?'
}

// Get player pool with salaries for tonight
router.get('/players', async (req, res) => {
  const { date } = req.query
  if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' })
  const data = await getNBAPlayerPool(date)
  res.json(data)
})

// Get my roster for tonight
router.get('/roster', async (req, res) => {
  const { league_id, date, season } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })
  const data = await getNBADFSRoster(league_id, req.user.id, date, parseInt(season || '2026'))
  res.json(data)
})

// Save/update roster
router.post('/roster', async (req, res) => {
  const { league_id, date, season, slots } = req.body
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })

  // Check league start date — can't submit roster for dates before league starts
  const { data: league } = await supabase
    .from('leagues')
    .select('starts_at')
    .eq('id', league_id)
    .single()

  if (league?.starts_at) {
    const leagueStart = new Date(league.starts_at).toISOString().split('T')[0]
    if (date < leagueStart) {
      return res.status(400).json({ error: 'Cannot submit a roster before the league start date' })
    }
  }

  // Per-player locking: only allow changes to slots where the player's game hasn't started
  // Get game start times for all players being submitted
  const now = new Date()
  const espnIds = (slots || []).map((s) => s.espn_player_id).filter(Boolean)

  // Check existing roster for locked players that can't be removed
  const existingRoster = await getNBADFSRoster(league_id, req.user.id, date, parseInt(season || '2026'))
  if (existingRoster?.nba_dfs_roster_slots?.length) {
    // Get game times for existing rostered players
    const existingIds = existingRoster.nba_dfs_roster_slots.map((s) => s.espn_player_id).filter(Boolean)
    const { data: existingSalaries } = await supabase
      .from('nba_dfs_salaries')
      .select('espn_player_id, game_starts_at')
      .eq('game_date', date)
      .in('espn_player_id', existingIds)

    const gameTimeMap = {}
    for (const s of existingSalaries || []) {
      gameTimeMap[s.espn_player_id] = s.game_starts_at
    }

    // Verify locked players aren't being removed
    for (const existingSlot of existingRoster.nba_dfs_roster_slots) {
      const gameTime = gameTimeMap[existingSlot.espn_player_id]
      if (gameTime && new Date(gameTime) <= now) {
        // This player is locked — must still be in the new roster at the same slot
        const matchingNew = (slots || []).find((s) => s.roster_slot === existingSlot.roster_slot)
        if (!matchingNew || matchingNew.espn_player_id !== existingSlot.espn_player_id) {
          return res.status(400).json({ error: `${existingSlot.player_name}'s game has started — cannot swap` })
        }
      }
    }
  }

  // Verify new players being added don't have games already started
  if (espnIds.length) {
    const { data: newSalaries } = await supabase
      .from('nba_dfs_salaries')
      .select('espn_player_id, player_name, game_starts_at')
      .eq('game_date', date)
      .in('espn_player_id', espnIds)

    for (const sal of newSalaries || []) {
      if (sal.game_starts_at && new Date(sal.game_starts_at) <= now) {
        // Only block if this player wasn't already on the roster at this slot
        const wasExisting = existingRoster?.nba_dfs_roster_slots?.some(
          (s) => s.espn_player_id === sal.espn_player_id
        )
        if (!wasExisting) {
          return res.status(400).json({ error: `${sal.player_name}'s game has already started` })
        }
      }
    }
  }

  const settings = await getFantasySettings(league_id)
  const salaryCap = settings.salary_cap || 60000

  const data = await saveNBADFSRoster(league_id, req.user.id, date, season || 2026, slots || [], salaryCap)
  res.json(data)
})

// Get standings
router.get('/standings', async (req, res) => {
  const { league_id } = req.query
  if (!league_id) return res.status(400).json({ error: 'league_id required' })
  const data = await getNBADFSStandings(league_id)
  res.json(data)
})

// Get nightly results
router.get('/nightly-results', async (req, res) => {
  const { league_id, date } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })
  const data = await getNBANightlyResults(league_id, date)
  res.json(data)
})

// Live scoring — all members' rosters with game states, points, and visibility masking
router.get('/live', async (req, res) => {
  const { league_id, date, season } = req.query
  if (!league_id || !date) return res.status(400).json({ error: 'league_id and date required' })
  const s = parseInt(season || '2026')
  const now = new Date()

  // Get all members
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', league_id)

  if (!members?.length) return res.json([])

  // Get all rosters for this date
  const { data: rosters } = await supabase
    .from('nba_dfs_rosters')
    .select('id, user_id, total_points, nba_dfs_roster_slots(roster_slot, player_name, espn_player_id, salary, points_earned)')
    .eq('league_id', league_id)
    .eq('game_date', date)
    .eq('season', s)

  const rosterMap = {}
  for (const r of rosters || []) {
    rosterMap[r.user_id] = r
  }

  // Get game times and statuses for all rostered players
  const allEspnIds = []
  for (const r of rosters || []) {
    for (const slot of r.nba_dfs_roster_slots || []) {
      if (slot.espn_player_id) allEspnIds.push(slot.espn_player_id)
    }
  }

  const gameStateMap = {} // espn_player_id -> { gameStartsAt, status }
  if (allEspnIds.length) {
    const { data: salaries } = await supabase
      .from('nba_dfs_salaries')
      .select('espn_player_id, game_starts_at, headshot_url, team, opponent')
      .eq('game_date', date)
      .in('espn_player_id', [...new Set(allEspnIds)])

    for (const sal of salaries || []) {
      const startTime = sal.game_starts_at ? new Date(sal.game_starts_at) : null
      let status = 'upcoming'
      if (startTime && startTime <= now) status = 'live'
      gameStateMap[sal.espn_player_id] = { gameStartsAt: sal.game_starts_at, status, headshot_url: sal.headshot_url, team: sal.team, opponent: sal.opponent }
    }
  }

  // Fetch live game period/clock by matching game_starts_at
  const { data: sportRow } = await supabase.from('sports').select('id').eq('key', 'basketball_nba').single()
  if (sportRow) {
    // Only match games from today (±1 day buffer for late-night games)
    const todayStart = new Date(date + 'T00:00:00-05:00')
    const todayEnd = new Date(todayStart.getTime() + 36 * 60 * 60 * 1000)
    const { data: liveGames } = await supabase
      .from('games')
      .select('starts_at, period, clock, status, home_team, away_team, live_home_score, live_away_score, home_score, away_score')
      .eq('sport_id', sportRow.id)
      .in('status', ['live', 'final'])
      .gte('starts_at', todayStart.toISOString())
      .lte('starts_at', todayEnd.toISOString())

    // Build abbreviation lookup from ESPN scoreboard for accurate matchups
    const teamAbbrevsInGames = {} // full team name → abbreviation
    const abbrevToGame = {} // team abbreviation → game data
    for (const game of liveGames || []) {
      // Extract abbreviations by matching against all known teams
      for (const [abbrev, nickname] of Object.entries({
        ATL: 'Hawks', BOS: 'Celtics', BKN: 'Nets', CHA: 'Hornets', CHI: 'Bulls',
        CLE: 'Cavaliers', DAL: 'Mavericks', DEN: 'Nuggets', DET: 'Pistons', GSW: 'Warriors',
        HOU: 'Rockets', IND: 'Pacers', LAC: 'Clippers', LAL: 'Lakers',
        MEM: 'Grizzlies', MIA: 'Heat', MIL: 'Bucks', MIN: 'Timberwolves', NOP: 'Pelicans',
        NYK: 'Knicks', OKC: 'Thunder', ORL: 'Magic', PHI: '76ers', PHX: 'Suns',
        POR: 'Trail Blazers', SAC: 'Kings', SAS: 'Spurs', TOR: 'Raptors', UTA: 'Jazz', WAS: 'Wizards',
      })) {
        if (game.home_team?.includes(nickname)) {
          abbrevToGame[abbrev] = { ...game, homeAbbrev: abbrev }
        }
        if (game.away_team?.includes(nickname)) {
          abbrevToGame[abbrev] = { ...game, awayAbbrev: abbrev }
        }
      }
    }

    // Also handle GS vs GSW, NO vs NOP, NY vs NYK, SA vs SAS
    const ABBREV_ALIASES = { GS: 'GSW', NO: 'NOP', NY: 'NYK', SA: 'SAS', WSH: 'WAS' }

    for (const [espnId, gs] of Object.entries(gameStateMap)) {
      if (gs.team) {
        const normalizedTeam = ABBREV_ALIASES[gs.team.toUpperCase()] || gs.team.toUpperCase()
        const match = abbrevToGame[normalizedTeam]
        if (match) {
          gs.status = match.status
          gs.period = match.period
          gs.clock = match.clock
          gs.homeScore = match.live_home_score ?? match.home_score ?? 0
          gs.awayScore = match.live_away_score ?? match.away_score ?? 0
          // Store abbreviations directly — parse from opponent field
          const oppRaw = gs.opponent || ''
          const isHome = oppRaw.startsWith('vs')
          const oppAbbrev = oppRaw.replace(/^(vs|@)\s*/, '').trim()
          gs.homeAbbrev = isHome ? normalizedTeam : oppAbbrev
          gs.awayAbbrev = isHome ? oppAbbrev : normalizedTeam
        }
      }
    }
  }

  // Fetch player stats for today (used for game status detection + stat breakdowns)
  const playerStatsMap = {}
  if (allEspnIds.length) {
    const { data: stats } = await supabase
      .from('nba_dfs_player_stats')
      .select('espn_player_id, fantasy_points, minutes_played, points, rebounds, assists, steals, blocks, turnovers, three_pointers_made')
      .eq('game_date', date)
      .eq('season', s)
      .in('espn_player_id', [...new Set(allEspnIds)])

    for (const stat of stats || []) {
      playerStatsMap[stat.espn_player_id] = {
        pts: stat.points || 0,
        reb: stat.rebounds || 0,
        ast: stat.assists || 0,
        stl: stat.steals || 0,
        blk: stat.blocks || 0,
        to: stat.turnovers || 0,
        threes: stat.three_pointers_made || 0,
        min: stat.minutes_played || 0,
        fpts: Number(stat.fantasy_points) || 0,
      }
      if (gameStateMap[stat.espn_player_id]) {
        gameStateMap[stat.espn_player_id].hasStats = true
      }
    }
  }

  // Fetch scoreboard to get actual live/final status
  const dateStr = date.replace(/-/g, '')
  let gameStatuses = {} // team abbreviation -> 'pre' | 'in' | 'post'
  try {
    const espnRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`)
    if (espnRes.ok) {
      const espnData = await espnRes.json()
      for (const event of espnData.events || []) {
        const comp = event.competitions?.[0]
        if (!comp) continue
        const statusType = comp.status?.type?.name || event.status?.type?.name
        let state = 'pre'
        if (['STATUS_IN_PROGRESS', 'STATUS_END_PERIOD', 'STATUS_HALFTIME', 'STATUS_OVERTIME'].includes(statusType)) state = 'in'
        else if (['STATUS_FINAL', 'STATUS_FULL_TIME'].includes(statusType)) state = 'post'

        for (const c of comp.competitors || []) {
          const abbrev = c.team?.abbreviation
          if (abbrev) gameStatuses[abbrev] = state
        }
      }
    }
  } catch { /* ignore */ }

  // Map team abbreviations to player game states
  // Get player teams from salaries
  if (allEspnIds.length) {
    const { data: playerTeams } = await supabase
      .from('nba_dfs_salaries')
      .select('espn_player_id, team')
      .eq('game_date', date)
      .in('espn_player_id', [...new Set(allEspnIds)])

    for (const pt of playerTeams || []) {
      const teamState = gameStatuses[pt.team]
      if (teamState && gameStateMap[pt.espn_player_id]) {
        gameStateMap[pt.espn_player_id].status = teamState === 'in' ? 'live' : teamState === 'post' ? 'final' : 'upcoming'
      }
    }
  }

  // Check if all games today are final
  const allTeamStates = Object.values(gameStatuses)
  const anyLive = allTeamStates.some((s) => s === 'in')
  const allFinal = allTeamStates.length > 0 && allTeamStates.every((s) => s === 'post')

  // Get first tip-off time today
  const { data: firstTipoff } = await supabase
    .from('nba_dfs_salaries')
    .select('game_starts_at')
    .eq('game_date', date)
    .not('game_starts_at', 'is', null)
    .order('game_starts_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // NBA game duration ~150 minutes
  const GAME_DURATION_MIN = 150

  // Fetch current injury statuses for all rostered players
  const injuryMap = {}
  if (allEspnIds.length) {
    try {
      const pool = await getNBAPlayerPool(date)
      for (const p of pool || []) {
        if (p.espn_player_id) injuryMap[p.espn_player_id] = p.injury_status || null
      }
    } catch { /* ignore */ }
  }

  // Canonical slot order so the live roster matches the roster tab
  const SLOT_ORDER = ['PG1', 'PG2', 'SG1', 'SG2', 'SF1', 'SF2', 'PF1', 'PF2', 'C']
  const slotOrderIdx = (s) => {
    const idx = SLOT_ORDER.indexOf(s)
    return idx === -1 ? 99 : idx
  }

  // Build response
  const result = members.map((m) => {
    const roster = rosterMap[m.user_id]
    const isMe = m.user_id === req.user.id
    let minutesRemaining = 0

    const slots = (roster?.nba_dfs_roster_slots || []).slice().sort((a, b) => slotOrderIdx(a.roster_slot) - slotOrderIdx(b.roster_slot)).map((slot) => {
      const gs = gameStateMap[slot.espn_player_id] || { status: 'upcoming' }
      const visible = isMe || allFinal || gs.status === 'live' || gs.status === 'final'

      // Estimate minutes remaining for this player
      if (gs.status === 'upcoming') {
        minutesRemaining += GAME_DURATION_MIN
      } else if (gs.status === 'live' && gs.gameStartsAt) {
        const elapsed = (now - new Date(gs.gameStartsAt)) / 60000
        minutesRemaining += Math.max(0, GAME_DURATION_MIN - elapsed)
      }
      // final = 0 remaining

      const hasGameStats = (gs.status === 'live' || gs.status === 'final') && visible
      return {
        roster_slot: slot.roster_slot,
        player_name: visible ? slot.player_name : '????',
        espn_player_id: visible ? slot.espn_player_id : null,
        headshot_url: visible ? (gs.headshot_url || null) : null,
        salary: visible ? slot.salary : null,
        points_earned: gs.status === 'live' || gs.status === 'final' ? Number(slot.points_earned) || 0 : 0,
        game_status: gs.status,
        game_period: gs.period || null,
        game_clock: gs.clock || null,
        team: visible ? (gs.team || null) : null,
        opponent: visible ? (gs.opponent || null) : null,
        home_team: gs.homeAbbrev || null,
        away_team: gs.awayAbbrev || null,
        home_score: gs.homeScore ?? null,
        away_score: gs.awayScore ?? null,
        stats: hasGameStats ? (playerStatsMap[slot.espn_player_id] || null) : null,
        injury_status: visible ? (injuryMap[slot.espn_player_id] || null) : null,
      }
    })

    const totalPoints = slots.reduce((sum, s) => sum + (s.points_earned || 0), 0)
    const hasLive = slots.some((s) => s.game_status === 'live')
    const allDone = slots.length > 0 && slots.every((s) => s.game_status === 'final')
    const userStatus = allDone ? 'final' : hasLive ? 'live' : 'upcoming'

    return {
      user: m.users,
      user_id: m.user_id,
      total_points: totalPoints,
      status: userStatus,
      has_roster: !!roster,
      minutes_remaining: Math.round(minutesRemaining),
      slots,
    }
  })

  // Sort by total points descending
  result.sort((a, b) => b.total_points - a.total_points)

  res.json({
    members: result,
    any_live: anyLive,
    all_final: allFinal,
    first_tipoff: firstTipoff?.game_starts_at || null,
  })
})

// Look up ESPN player ID by name (for connecting props to game logs)
router.get('/player/lookup', async (req, res) => {
  const { name, sport } = req.query
  if (!name) return res.status(400).json({ error: 'name required' })

  // Normalize: strip periods (C.J. → CJ) for matching
  const normalized = name.replace(/\./g, '')

  // NFL players live in nfl_players, not a DFS salaries table. When the
  // request is for NFL, look there first so the prop modal gets a real
  // espn_player_id and the recent-games gamelog can fire.
  if (sport === 'americanfootball_nfl') {
    let { data } = await supabase
      .from('nfl_players')
      .select('espn_id, full_name, headshot_url, team, position')
      .ilike('full_name', `%${name}%`)
      .not('team', 'is', null)
      .limit(1)
      .maybeSingle()

    if (!data && normalized !== name) {
      const r = await supabase
        .from('nfl_players')
        .select('espn_id, full_name, headshot_url, team, position')
        .ilike('full_name', `%${normalized}%`)
        .not('team', 'is', null)
        .limit(1)
        .maybeSingle()
      data = r.data
    }

    if (data) {
      return res.json({
        espn_player_id: data.espn_id,
        player_name: data.full_name,
        headshot_url: data.headshot_url,
        team: data.team,
        position: data.position,
      })
    }
  }

  // Try the salaries table that matches the sport first, then fall back to
  // the other two. WNBA was previously missing here, so WNBA prop modals
  // fell through to the headshot-only branch and never got an espn_player_id
  // — breaking the recent-games gamelog fetch.
  const TABLE_BY_SPORT = {
    basketball_nba: 'nba_dfs_salaries',
    basketball_wnba: 'wnba_dfs_salaries',
    baseball_mlb: 'mlb_dfs_salaries',
  }
  const primaryTable = TABLE_BY_SPORT[sport]
  const allTables = ['nba_dfs_salaries', 'wnba_dfs_salaries', 'mlb_dfs_salaries']
  const tableOrder = primaryTable
    ? [primaryTable, ...allTables.filter((t) => t !== primaryTable)]
    : allTables

  for (const table of tableOrder) {
    let { data } = await supabase
      .from(table)
      .select('espn_player_id, player_name, headshot_url, team, position')
      .ilike('player_name', `%${name}%`)
      .order('game_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data && normalized !== name) {
      const r = await supabase
        .from(table)
        .select('espn_player_id, player_name, headshot_url, team, position')
        .ilike('player_name', `%${normalized}%`)
        .order('game_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      data = r.data
    }

    if (data) return res.json(data)
  }

  // Fallback: look up headshot from ESPN cache for other sports
  const sportPath = ESPN_SPORT_PATHS[sport] || 'basketball/nba'
  const { refreshPlayerHeadshotCache, getPlayerHeadshotUrl } = await import('../services/espnService.js')
  await refreshPlayerHeadshotCache(sportPath)
  const headshot = getPlayerHeadshotUrl(name, sportPath)

  if (headshot) {
    return res.json({ player_name: name, headshot_url: headshot, team: null, position: null, espn_player_id: null })
  }

  return res.status(404).json({ error: 'Player not found' })
})

// ESPN sport paths for game logs
const ESPN_SPORT_PATHS = {
  basketball_nba: 'basketball/nba',
  basketball_wnba: 'basketball/wnba',
  baseball_mlb: 'baseball/mlb',
  americanfootball_nfl: 'football/nfl',
  icehockey_nhl: 'hockey/nhl',
}

// NBA stat columns for game log
const NBA_GAME_COLS = (statMap) => ({
  pts: parseInt(statMap.PTS) || 0,
  reb: parseInt(statMap.REB) || 0,
  ast: parseInt(statMap.AST) || 0,
  stl: parseInt(statMap.STL) || 0,
  blk: parseInt(statMap.BLK) || 0,
  to: parseInt(statMap.TO) || 0,
  min: parseInt(statMap.MIN) || 0,
  threes: statMap['3PT'] || '0',
  fg: statMap.FG || '0',
})

// MLB stat columns for game log
const MLB_GAME_COLS = (statMap) => ({
  ab: parseInt(statMap.AB) || 0,
  h: parseInt(statMap.H) || 0,
  r: parseInt(statMap.R) || 0,
  hr: parseInt(statMap.HR) || 0,
  rbi: parseInt(statMap.RBI) || 0,
  bb: parseInt(statMap.BB) || 0,
  so: parseInt(statMap.SO) || 0,
  sb: parseInt(statMap.SB) || 0,
  avg: statMap.AVG || '.000',
})

// Separate parser for MLB pitcher game logs — ESPN returns different
// columns (IP, ER, K, etc.) for pitchers than for hitters. We don't
// pull `result` here on purpose — the outer mapper already sets it
// from `detail.gameResult` (the team's W/L). Pitcher decision is
// often blank for no-decision starts; falling back to team result
// keeps the left column populated.
const MLB_PITCHER_GAME_COLS = (statMap) => ({
  ip: statMap.IP || '0.0',
  h: parseInt(statMap.H) || 0,
  r: parseInt(statMap.R) || 0,
  er: parseInt(statMap.ER) || 0,
  bb: parseInt(statMap.BB) || 0,
  k: parseInt(statMap.K || statMap.SO) || 0,
  hr: parseInt(statMap.HR) || 0,
  era: statMap.ERA || '0.00',
})

// NFL stat columns for game log
const NFL_GAME_COLS = (statMap) => ({
  pass_yds: parseInt(statMap['PYDS'] || statMap['Pass YDS']) || 0,
  pass_td: parseInt(statMap['PTD'] || statMap['Pass TD']) || 0,
  int: parseInt(statMap['INT']) || 0,
  rush_yds: parseInt(statMap['RYDS'] || statMap['Rush YDS']) || 0,
  rush_td: parseInt(statMap['RTD'] || statMap['Rush TD']) || 0,
  rec: parseInt(statMap['REC']) || 0,
  rec_yds: parseInt(statMap['RECYDS'] || statMap['Rec YDS']) || 0,
  rec_td: parseInt(statMap['RECTD'] || statMap['Rec TD']) || 0,
})

// Player game log — last 10 games (supports NBA, MLB, and NFL)
router.get('/player/:espnId/gamelog', async (req, res) => {
  const { espnId: rawId } = req.params
  const sport = req.query.sport || 'basketball_nba'
  const espnPath = ESPN_SPORT_PATHS[sport] || 'basketball/nba'

  // For NFL the path param may be a Sleeper id (single-stat contests like
  // Sacks/Ints/Tackles/Receptions key on sleeper_player_id). nfl_players
  // stores the ESPN equivalent in `espn_id`, so resolve it here. The
  // blurb lookup below still keys on the original path param because
  // admin blurbs for NFL are stored under the Sleeper id.
  let espnId = rawId
  if (sport === 'americanfootball_nfl') {
    const { data: nflRow } = await supabase
      .from('nfl_players')
      .select('espn_id')
      .eq('id', rawId)
      .maybeSingle()
    if (nflRow?.espn_id) espnId = nflRow.espn_id
  } else if (sport === 'baseball_mlb') {
    // Two-way players (Ohtani) have a -P suffix on the pitcher row so it
    // doesn't collide with the hitter row in mlb_dfs_salaries. ESPN's
    // gamelog API uses the real athlete ID with no suffix — strip it.
    espnId = rawId.replace(/-P$/, '')
  }

  // Helper — fetch one season's gamelog from ESPN. Returns parsed JSON
  // or null. Pulled out so we can backfill from prior season when the
  // current season is sparse (returning-from-IL players, early career,
  // offseason snapshots).
  async function fetchGamelogJson(year) {
    const param = year ? `?season=${year}` : ''
    try {
      const r = await fetch(`https://site.api.espn.com/apis/common/v3/sports/${espnPath}/athletes/${espnId}/gamelog${param}`)
      if (!r.ok) return null
      return await r.json()
    } catch {
      return null
    }
  }

  function eventsFromGamelog(data) {
    const out = []
    for (const seasonType of data?.seasonTypes || []) {
      for (const cat of seasonType.categories || []) {
        for (const ev of cat.events || []) out.push(ev)
      }
    }
    return out
  }

  try {
    const seasonYear = new Date().getFullYear()
    // NBA's gamelog endpoint returns the current season by default.
    // Other sports prefer an explicit season param.
    const useSeasonParam = sport !== 'basketball_nba'
    const response = await fetch(`https://site.api.espn.com/apis/common/v3/sports/${espnPath}/athletes/${espnId}/gamelog${useSeasonParam ? `?season=${seasonYear}` : ''}`)
    if (!response.ok) {
      // No gamelog but the row still wants blurbs — fall through with
      // empty games/averages so the modal can render notes alone.
      const blurbSport = ({
        basketball_nba: 'nba',
        basketball_wnba: 'wnba',
        baseball_mlb: 'mlb',
        americanfootball_nfl: 'nfl',
      })[sport] || null
      let blurbs = []
      if (blurbSport) {
        try {
          const { getPublishedBlurbsForPlayer } = await import('../services/playerBlurbService.js')
          blurbs = await getPublishedBlurbsForPlayer(rawId, 10, blurbSport)
        } catch {}
      }
      return res.json({ games: [], averages: null, sport, isPitcher: false, blurbs, blurb: blurbs[0] || null })
    }
    const data = await response.json()

    const labels = data.labels || []
    const eventsMap = { ...(data.events || {}) }
    // Pull games from EVERY season type — regular season, playoffs,
    // play-in, whatever ESPN exposes. The sort-by-date-desc below then
    // surfaces the actual most recent games to the top.
    const allGames = eventsFromGamelog(data)

    // Backfill from prior season ONLY when the current season is empty
    // (offseason, just-called-up rookie, returning-from-IL with no games
    // back yet). Previous threshold of <10 misled users mid-season — e.g.
    // an early-WNBA player with 5 GP this year showed 5 current + 5
    // prior-season games mashed together with no separator, contradicting
    // the "5 GP" in Season Averages.
    if (allGames.length === 0 && useSeasonParam) {
      const prior = await fetchGamelogJson(seasonYear - 1)
      if (prior) {
        Object.assign(eventsMap, prior.events || {})
        allGames.push(...eventsFromGamelog(prior))
      }
    }

    const isMLB = sport === 'baseball_mlb'
    const isNFL = sport === 'americanfootball_nfl'
    // Detect MLB pitchers by the presence of IP (innings pitched) in the
    // gamelog labels — ESPN uses pitching columns for pitchers, batting for
    // everyone else.
    const isPitcher = isMLB && labels.includes('IP')
    const colParser = isPitcher
      ? MLB_PITCHER_GAME_COLS
      : isMLB ? MLB_GAME_COLS
      : isNFL ? NFL_GAME_COLS
      : NBA_GAME_COLS

    // Sort by date descending so traded players show most recent games first
    allGames.sort((a, b) => {
      const dateA = eventsMap[a.eventId]?.gameDate || ''
      const dateB = eventsMap[b.eventId]?.gameDate || ''
      return dateB.localeCompare(dateA)
    })

    const games = allGames.slice(0, 10).map((ev) => {
      const detail = eventsMap[ev.eventId] || {}
      const statMap = {}
      labels.forEach((l, i) => { statMap[l] = ev.stats?.[i] })

      return {
        date: detail.gameDate || null,
        opponent: resolveOpponentAbbrev(detail.opponent, sport),
        result: detail.gameResult || null,
        ...colParser(statMap),
      }
    })

    // Season averages
    const seasonParam = useSeasonParam ? `?season=${seasonYear}` : ''
    const statsRes = await fetch(`https://site.api.espn.com/apis/common/v3/sports/${espnPath}/athletes/${espnId}/stats${seasonParam}`)
    let averages = null
    if (statsRes.ok) {
      const statsData = await statsRes.json()
      const avgs = statsData.categories?.find((c) => c.name === 'averages')
      if (avgs?.labels && avgs?.statistics?.length) {
        const sLabels = avgs.labels
        const latest = avgs.statistics[avgs.statistics.length - 1]
        const vals = latest.stats || []
        const get = (label) => { const idx = sLabels.indexOf(label); return idx >= 0 ? vals[idx] : '0' }

        if (isPitcher) {
          // Pull pitcher-specific season averages
          averages = {
            era: get('ERA'), whip: get('WHIP'),
            k: get('K') || get('SO'),
            ip: get('IP'),
            w: get('W'), l: get('L'),
            gs: get('GS') || get('GP'),
          }
        } else if (isMLB) {
          averages = {
            avg: get('AVG'), hr: get('HR'), rbi: get('RBI'),
            r: get('R'), sb: get('SB'), obp: get('OBP'),
            ops: get('OPS'), gp: get('GP'),
          }
        } else if (isNFL) {
          averages = {
            pass_yds: get('PYDS'), pass_td: get('PTD'), int: get('INT'),
            rush_yds: get('RYDS'), rush_td: get('RTD'),
            rec: get('REC'), rec_yds: get('RECYDS'), rec_td: get('RECTD'),
            gp: get('GP'),
          }
        } else {
          averages = {
            ppg: get('PTS'), rpg: get('REB'), apg: get('AST'),
            spg: get('STL'), bpg: get('BLK'), tpg: get('TO'),
            mpg: get('MIN'), gp: get('GP'),
          }
        }
      }
    }

    // Attach published blurbs scoped to this sport so the universal
    // PlayerDetailModal can render admin-written analysis alongside the
    // gamelog.
    const blurbSport = ({
      basketball_nba: 'nba',
      basketball_wnba: 'wnba',
      baseball_mlb: 'mlb',
      americanfootball_nfl: 'nfl',
    })[sport] || null
    let blurbs = []
    if (blurbSport) {
      try {
        const { getPublishedBlurbsForPlayer } = await import('../services/playerBlurbService.js')
        // Blurbs are keyed on the original path param (Sleeper id for NFL,
        // ESPN id for everyone else) to match how admin writes them.
        blurbs = await getPublishedBlurbsForPlayer(rawId, 10, blurbSport)
      } catch {}
    }

    res.json({ games, averages, sport, isPitcher, blurbs, blurb: blurbs[0] || null })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch game log' })
  }
})

export default router
