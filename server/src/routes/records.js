import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getAllRecords, getRecordHistory } from '../services/recordService.js'
import { supabase } from '../config/supabase.js'

const router = Router()

// GET /api/records — all records with holders + sub-records
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const data = await getAllRecords()
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/records/history — recent record breaks
router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100)
    const data = await getRecordHistory(limit)
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/records/pick/:pickId — fetch a single pick with game data (for record detail)
router.get('/pick/:pickId', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('picks')
      .select('*, games(*, sports(key, name))')
      .eq('id', req.params.pickId)
      .single()
    if (error || !data) return res.status(404).json({ error: 'Pick not found' })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/records/parlay/:parlayId — fetch a single parlay with legs (for record detail)
router.get('/parlay/:parlayId', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('parlays')
      .select('*, parlay_legs(*, games(home_team, away_team, sports(key, name)))')
      .eq('id', req.params.parlayId)
      .single()
    if (error || !data) return res.status(404).json({ error: 'Parlay not found' })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/records/futures-pick/:pickId — fetch a single futures pick with market data
router.get('/futures-pick/:pickId', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('futures_picks')
      .select('*, futures_markets(*)')
      .eq('id', req.params.pickId)
      .single()
    if (error || !data) return res.status(404).json({ error: 'Futures pick not found' })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/records/history/:id/detail — full detail for a record break (for modal)
router.get('/history/:id/detail', requireAuth, async (req, res, next) => {
  try {
    const { data: entry, error } = await supabase
      .from('record_history')
      .select('*, records(display_name, category)')
      .eq('id', req.params.id)
      .single()

    if (error || !entry) return res.status(404).json({ error: 'Record not found' })

    let meta = entry.metadata || {}
    const key = entry.record_key

    // If this history row is for the CURRENT holder of the record, prefer the
    // live metadata from `records` (which is always up-to-date) over the frozen
    // historical snapshot. Older snapshot rows can lag behind after a streak
    // extends — e.g. a "broken at 20" row keeps 20 pickIds even after the
    // streak grows to 22.
    const { data: liveRecord } = await supabase
      .from('records')
      .select('record_holder_id, record_metadata')
      .eq('record_key', key)
      .maybeSingle()
    if (liveRecord && liveRecord.record_holder_id === entry.new_holder_id && liveRecord.record_metadata) {
      meta = liveRecord.record_metadata
    }

    const result = { record: entry, type: 'stats', detail: null }

    // Streak records: fetch the constituent picks
    if (meta.pickIds?.length) {
      const { data: picks } = await supabase
        .from('picks')
        .select('id, user_id, picked_team, is_correct, points_earned, odds_at_pick, games(home_team, away_team, starts_at, sports(key, name))')
        .in('id', meta.pickIds)

      // Check if streak is still active: any loss after the last pick in the streak?
      let isActive = false
      if (picks?.length) {
        const lastPickTime = picks[picks.length - 1]?.games?.starts_at
        if (lastPickTime) {
          const { data: laterLoss } = await supabase
            .from('picks')
            .select('id')
            .eq('user_id', entry.new_holder_id)
            .eq('status', 'settled')
            .eq('is_correct', false)
            .gt('updated_at', lastPickTime)
            .limit(1)
            .maybeSingle()
          isActive = !laterLoss
        }
      }

      // Sort client-side since nested foreign-table .order can silently misbehave
      const sortedPicks = (picks || []).slice().sort((a, b) => {
        const ta = a.games?.starts_at ? new Date(a.games.starts_at).getTime() : 0
        const tb = b.games?.starts_at ? new Date(b.games.starts_at).getTime() : 0
        return ta - tb
      })

      result.type = 'streak'
      result.detail = { picks: sortedPicks, isActive }
    }
    // Parlay streak: fetch the constituent parlays
    else if (meta.parlayIds?.length) {
      const { data: parlays } = await supabase
        .from('parlays')
        .select('id, user_id, risk_points, reward_points, points_earned, leg_count, is_correct, updated_at')
        .in('id', meta.parlayIds)
        .order('updated_at', { ascending: true })

      result.type = 'parlay_streak'
      result.detail = { parlays: parlays || [] }
    }
    // Prop streak: fetch the constituent prop picks
    else if (meta.propPickIds?.length) {
      const { data: propPicks } = await supabase
        .from('prop_picks')
        .select('id, user_id, player_name, market_label, line, is_correct, points_earned, updated_at')
        .in('id', meta.propPickIds)
        .order('updated_at', { ascending: true })

      result.type = 'prop_streak'
      result.detail = { propPicks: propPicks || [] }
    }
    // Single pick record (biggest underdog hit)
    else if (meta.pickId) {
      const { data: pick } = await supabase
        .from('picks')
        .select('*, games(*, sports(key, name))')
        .eq('id', meta.pickId)
        .single()

      result.type = 'pick'
      result.detail = { pick }
    }
    // Single parlay record (biggest parlay, most legs)
    else if (meta.parlayId) {
      const { data: parlay } = await supabase
        .from('parlays')
        .select('*, parlay_legs(*, games(home_team, away_team, sports(key, name)))')
        .eq('id', meta.parlayId)
        .single()

      result.type = 'parlay'
      result.detail = { parlay }
    }
    // Single futures pick record
    else if (meta.futuresPickId) {
      const { data: futuresPick } = await supabase
        .from('futures_picks')
        .select('*, futures_markets(*)')
        .eq('id', meta.futuresPickId)
        .single()

      result.type = 'futures'
      result.detail = { futuresPick }
    }

    res.json(result)
  } catch (err) {
    next(err)
  }
})

export default router
