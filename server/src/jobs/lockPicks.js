import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { calculateRewardPoints, calculateRiskPoints, americanToMultiplier } from '../utils/scoring.js'

export async function lockPicks() {
  const now = new Date().toISOString()

  const { data: games, error: gamesError } = await supabase
    .from('games')
    .select('id, home_odds, away_odds')
    .eq('status', 'upcoming')
    .lte('starts_at', now)

  if (gamesError) {
    logger.error({ error: gamesError }, 'Failed to fetch games for lock')
    return
  }

  // NOT an early return on an empty set. The prop sweep further down covers
  // games that are ALREADY live — which is the common case, since the score
  // sync usually flips a game to live before this job sees it. Returning here
  // is what let post-kickoff props stay pickable indefinitely.
  const gameIds = (games || []).map((g) => g.id)
  if (gameIds.length) {
    await supabase
      .from('games')
      .update({ status: 'live', updated_at: now })
      .in('id', gameIds)
  }

  let locked = 0
  for (const game of games || []) {
    const { data: picks } = await supabase
      .from('picks')
      .select('id, picked_team, multiplier, odds_at_submission, risk_at_submission, reward_at_submission')
      .eq('game_id', game.id)
      .eq('status', 'pending')

    if (!picks?.length) continue

    for (const pick of picks) {
      // Odds lock at pick time — use submission values. Fall back to current
      // game odds only if submission odds are missing (legacy rows).
      const mult = pick.multiplier || 1
      let odds, risk, reward
      if (pick.odds_at_submission != null) {
        odds = pick.odds_at_submission
        risk = pick.risk_at_submission || (calculateRiskPoints(odds) * mult)
        reward = pick.reward_at_submission || (calculateRewardPoints(odds) * mult)
      } else {
        odds = pick.picked_team === 'home' ? game.home_odds : game.away_odds
        risk = odds ? calculateRiskPoints(odds) * mult : 0
        reward = odds ? calculateRewardPoints(odds) * mult : 0
      }

      const { error } = await supabase
        .from('picks')
        .update({
          status: 'locked',
          odds_at_pick: odds,
          risk_points: risk,
          reward_points: reward,
          updated_at: now,
        })
        .eq('id', pick.id)

      if (error) {
        logger.error({ error, pickId: pick.id }, 'Failed to lock pick')
      } else {
        locked++
      }
    }
  }

  // Lock survivor picks for these games
  let survivorLocked = 0
  for (const game of games) {
    const { data: survivorPicks } = await supabase
      .from('survivor_picks')
      .select('id')
      .eq('game_id', game.id)
      .eq('status', 'pending')

    if (survivorPicks?.length) {
      await supabase
        .from('survivor_picks')
        .update({ status: 'locked', updated_at: now })
        .eq('game_id', game.id)
        .eq('status', 'pending')

      survivorLocked += survivorPicks.length
    }
  }

  // Lock league picks for these games
  let leaguePicksLocked = 0
  for (const game of games) {
    const { data: leaguePicks } = await supabase
      .from('league_picks')
      .select('id, picked_team, odds_at_submission, risk_at_submission, reward_at_submission')
      .eq('game_id', game.id)
      .eq('status', 'pending')

    if (!leaguePicks?.length) continue

    for (const pick of leaguePicks) {
      let odds, risk, reward
      if (pick.odds_at_submission != null) {
        odds = pick.odds_at_submission
        risk = pick.risk_at_submission || (odds ? calculateRiskPoints(odds) : 0)
        reward = pick.reward_at_submission || (odds ? calculateRewardPoints(odds) : 0)
      } else {
        odds = pick.picked_team === 'home' ? game.home_odds : game.away_odds
        risk = odds ? calculateRiskPoints(odds) : 0
        reward = odds ? calculateRewardPoints(odds) : 0
      }

      const { error } = await supabase
        .from('league_picks')
        .update({
          status: 'locked',
          odds_at_pick: odds,
          risk_points: risk,
          reward_points: reward,
          updated_at: now,
        })
        .eq('id', pick.id)

      if (error) {
        logger.error({ error, pickId: pick.id }, 'Failed to lock league pick')
      } else {
        leaguePicksLocked++
      }
    }
  }

  // Sweep props on games that are ALREADY under way.
  //
  // `games` above holds only games still marked 'upcoming', because that is
  // what this job flips to live. But the props load path keeps upserting new
  // lines from the odds feed after kickoff, and those land as 'published' on
  // a game this job will never look at again — leaving them pickable mid-game.
  //
  // So the prop sweep runs over the started set too, not just the ones being
  // transitioned this tick. Cheap: it only matches rows still 'published'.
  const { data: startedGames } = await supabase
    .from('games')
    .select('id')
    .in('status', ['live', 'final'])
    .lte('starts_at', now)
    .gte('starts_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

  const gamesNeedingPropLock = [
    ...games,
    ...(startedGames || []).filter((g) => !games.some((x) => x.id === g.id)),
  ]

  // Lock published player props and their pending picks for these games
  let propsLocked = 0
  let propPicksLocked = 0
  for (const game of gamesNeedingPropLock) {
    // Lock published props for this game
    const { data: props } = await supabase
      .from('player_props')
      .select('id, over_odds, under_odds')
      .eq('game_id', game.id)
      .eq('status', 'published')

    if (!props?.length) continue

    const propIds = props.map((p) => p.id)
    await supabase
      .from('player_props')
      .update({ status: 'locked', updated_at: now })
      .in('id', propIds)

    propsLocked += props.length

    // Lock pending prop picks and snapshot odds
    for (const prop of props) {
      const { data: propPicks } = await supabase
        .from('prop_picks')
        .select('id, picked_side, odds_at_submission, risk_at_submission, reward_at_submission')
        .eq('prop_id', prop.id)
        .eq('status', 'pending')

      if (!propPicks?.length) continue

      for (const pick of propPicks) {
        let odds, risk, reward
        if (pick.odds_at_submission != null) {
          odds = pick.odds_at_submission
          risk = pick.risk_at_submission || (odds ? calculateRiskPoints(odds) : 0)
          reward = pick.reward_at_submission || (odds ? calculateRewardPoints(odds) : 0)
        } else {
          odds = pick.picked_side === 'over' ? prop.over_odds : prop.under_odds
          risk = odds ? calculateRiskPoints(odds) : 0
          reward = odds ? calculateRewardPoints(odds) : 0
        }

        const { error } = await supabase
          .from('prop_picks')
          .update({
            status: 'locked',
            odds_at_pick: odds,
            risk_points: risk,
            reward_points: reward,
            updated_at: now,
          })
          .eq('id', pick.id)

        if (error) {
          logger.error({ error, pickId: pick.id }, 'Failed to lock prop pick')
        } else {
          propPicksLocked++
        }
      }
    }
  }

  // Lock parlay legs for these games
  let parlayLegsLocked = 0
  for (const game of games) {
    const { data: legs } = await supabase
      .from('parlay_legs')
      .select('id, picked_team, parlay_id, odds_at_submission')
      .eq('game_id', game.id)
      .eq('status', 'pending')

    if (!legs?.length) continue

    for (const leg of legs) {
      // Use submission-time odds if available, fall back to current game odds
      const odds = leg.odds_at_submission != null
        ? leg.odds_at_submission
        : (leg.picked_team === 'home' ? game.home_odds : game.away_odds)
      const multiplierAtLock = odds ? 1 + americanToMultiplier(odds) : 2

      const { error } = await supabase
        .from('parlay_legs')
        .update({
          status: 'locked',
          odds_at_lock: odds,
          multiplier_at_lock: multiplierAtLock,
          updated_at: now,
        })
        .eq('id', leg.id)

      if (error) {
        logger.error({ error, legId: leg.id }, 'Failed to lock parlay leg')
      } else {
        parlayLegsLocked++
      }

      // Update parent parlay to locked status
      await supabase
        .from('parlays')
        .update({ status: 'locked', updated_at: now })
        .eq('id', leg.parlay_id)
        .eq('status', 'pending')
    }
  }

  if (locked > 0 || survivorLocked > 0 || leaguePicksLocked > 0 || propsLocked > 0 || propPicksLocked > 0 || parlayLegsLocked > 0) {
    logger.info({ locked, survivorLocked, leaguePicksLocked, propsLocked, propPicksLocked, parlayLegsLocked, games: gameIds.length }, 'Picks locked')
  }
}
