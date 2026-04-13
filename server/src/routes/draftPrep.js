import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import {
  getDraftPrepRankings,
  setDraftPrepRankings,
  resetDraftPrepRankings,
  getSyncPreferences,
  syncLeague,
  unsyncLeague,
  syncAllLeagues,
  getAdpList,
  getMatchingLeagues,
} from '../services/draftPrepService.js'

const router = Router()

// ── Rankings ─────────────────────────────────────────────────────────

router.get('/rankings', requireAuth, async (req, res) => {
  try {
    const { scoring = 'half_ppr', config } = req.query
    if (!config) return res.status(400).json({ error: 'config is required' })
    // Parse rosterSlots from config hash for seeding (reconstruct from hash)
    const rosterSlots = parseConfigHash(config)
    const data = await getDraftPrepRankings(req.user.id, config, scoring, rosterSlots)
    res.json(data)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.put('/rankings', requireAuth, async (req, res) => {
  try {
    const { scoringFormat, configHash, playerIds } = req.body
    if (!configHash) return res.status(400).json({ error: 'configHash is required' })
    const result = await setDraftPrepRankings(req.user.id, configHash, scoringFormat || 'half_ppr', playerIds)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/rankings/reset', requireAuth, async (req, res) => {
  try {
    const { scoringFormat, configHash } = req.body
    if (!configHash) return res.status(400).json({ error: 'configHash is required' })
    const rosterSlots = parseConfigHash(configHash)
    const result = await resetDraftPrepRankings(req.user.id, configHash, scoringFormat || 'half_ppr', rosterSlots)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// ── Sync ─────────────────────────────────────────────────────────────

router.get('/sync', requireAuth, async (req, res) => {
  try {
    const data = await getSyncPreferences(req.user.id)
    res.json(data)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/sync', requireAuth, async (req, res) => {
  try {
    const { leagueId } = req.body
    if (!leagueId) return res.status(400).json({ error: 'leagueId is required' })
    const result = await syncLeague(req.user.id, leagueId)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.delete('/sync/:leagueId', requireAuth, async (req, res) => {
  try {
    const result = await unsyncLeague(req.user.id, req.params.leagueId)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/sync-all', requireAuth, async (req, res) => {
  try {
    const { mode, configHash, scoringFormat } = req.body
    const result = await syncAllLeagues(req.user.id, mode || 'all', configHash, scoringFormat)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// ── ADP ──────────────────────────────────────────────────────────────

router.get('/adp', requireAuth, async (req, res) => {
  try {
    const { scoring = 'half_ppr', position } = req.query
    const data = await getAdpList(scoring, position)
    res.json(data)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// ── Matching Leagues ─────────────────────────────────────────────────

router.get('/matching-leagues', requireAuth, async (req, res) => {
  try {
    const { config, scoring = 'half_ppr' } = req.query
    if (!config) return res.status(400).json({ error: 'config is required' })
    const data = await getMatchingLeagues(req.user.id, config, scoring)
    res.json(data)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// ── Helper: parse roster config hash back to slots object ────────────

function parseConfigHash(hash) {
  const slots = {}
  for (const token of hash.split('-')) {
    const match = token.match(/^(\d+)(.+)$/)
    if (match) slots[match[2]] = parseInt(match[1], 10)
  }
  return slots
}

export default router
