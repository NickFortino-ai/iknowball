// Player-blurb routes. Extracted from admin.js so we can gate them
// with requireBlurbWriter (is_admin OR is_writer) instead of admin.js's
// mount-level requireAdmin. Any admin still has full access; a
// designated writer gets access only to these routes.
//
// Authorship (written_by) is populated on create and on publish. It is
// returned only to admins/writers via these endpoints — the public
// player-detail modal fetches through getPublishedBlurbsForPlayer,
// which selects a fixed field list that does NOT include written_by,
// so authorship is never surfaced to end users.

import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { requireBlurbWriter } from '../middleware/requireBlurbWriter.js'
import { logger } from '../utils/logger.js'

const router = Router()
router.use(requireAuth, requireBlurbWriter)

// List players for the blurbs panel (ranked by season points, with blurb status)
router.get('/players', async (req, res) => {
  const season = Number(req.query.season) || new Date().getFullYear()
  const position = req.query.position || null
  const sport = (req.query.sport || 'nfl').toLowerCase()

  const { getTopPlayersByPosition, getPlayersForSport } = await import('../services/playerBlurbService.js')

  let players
  if (sport === 'nfl') {
    const byPosition = await getTopPlayersByPosition(season, { unlimited: true })
    if (position && position !== 'all') {
      players = byPosition[position.toUpperCase()] || []
    } else {
      players = Object.values(byPosition).flat().sort((a, b) => b.seasonPoints - a.seasonPoints)
    }
  } else {
    players = await getPlayersForSport(sport)
    if (position && position !== 'all') {
      players = players.filter((p) => (p.position || '').toUpperCase() === position.toUpperCase())
    }
  }

  const idToCanonical = new Map()
  const allBlurbLookupIds = []
  for (const p of players) {
    const ids = (p.aliasIds && p.aliasIds.length) ? p.aliasIds : [p.id]
    for (const aid of ids) {
      idToCanonical.set(aid, p.id)
      allBlurbLookupIds.push(aid)
    }
  }
  if (allBlurbLookupIds.length) {
    const CHUNK = 400
    const allBlurbs = []
    for (let i = 0; i < allBlurbLookupIds.length; i += CHUNK) {
      const chunk = allBlurbLookupIds.slice(i, i + CHUNK)
      const { data: chunkBlurbs } = await supabase
        .from('player_blurbs')
        .select('player_id, status, id, content, published_at, written_by, writer:written_by(username, display_name)')
        .eq('sport', sport)
        .in('player_id', chunk)
        .in('status', ['draft', 'published'])
      if (chunkBlurbs) allBlurbs.push(...chunkBlurbs)
    }
    const blurbMap = {}
    const lastPublishedAt = {}
    for (const b of allBlurbs) {
      const canonical = idToCanonical.get(b.player_id) || b.player_id
      if (!blurbMap[canonical] || b.status === 'draft') blurbMap[canonical] = b
      if (b.status === 'published' && b.published_at) {
        const prev = lastPublishedAt[canonical]
        if (!prev || new Date(b.published_at) > new Date(prev)) {
          lastPublishedAt[canonical] = b.published_at
        }
      }
    }
    for (const p of players) {
      p.blurb = blurbMap[p.id] || null
      p.last_published_at = lastPublishedAt[p.id] || null
    }
    const attached = players.filter((p) => p.blurb).length
    const orphans = allBlurbs.filter((b) => !idToCanonical.get(b.player_id))
    logger.info({
      sport, position, playerCount: players.length,
      lookupIdCount: allBlurbLookupIds.length,
      chunkCount: Math.ceil(allBlurbLookupIds.length / CHUNK),
      blurbsFound: allBlurbs.length, attached,
      orphanBlurbs: orphans.map((b) => ({ player_id: b.player_id, status: b.status })),
    }, 'blurbs attach diagnostic')
  }

  res.json(players)
})

// Generate AI blurbs for selected player IDs (admin/writer)
router.post('/generate', async (req, res) => {
  const { playerIds, season, week } = req.body
  if (!playerIds?.length) return res.status(400).json({ error: 'playerIds required' })
  const { generateBlurbs } = await import('../services/playerBlurbService.js')
  try {
    const result = await generateBlurbs(playerIds, season || new Date().getFullYear(), week || 1)
    res.json(result)
  } catch (err) {
    logger.error({ err }, 'Blurb generation failed')
    res.status(500).json({ error: err.message })
  }
})

// Create a manual blurb — stamps written_by with the caller
router.post('/', async (req, res) => {
  const { player_id, content, season, week, sport } = req.body
  if (!player_id || !content) return res.status(400).json({ error: 'player_id and content required' })
  const { data, error } = await supabase
    .from('player_blurbs')
    .insert({
      player_id,
      content,
      status: 'draft',
      season: season || new Date().getFullYear(),
      week,
      generated_by: 'manual',
      sport: (sport || 'nfl').toLowerCase(),
      written_by: req.user.id,
    })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Update a blurb's content
router.patch('/:id', async (req, res) => {
  const { content } = req.body
  if (!content) return res.status(400).json({ error: 'content required' })
  const { data, error } = await supabase
    .from('player_blurbs')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Publish a single blurb (archives previous published for same player).
// Also stamps written_by so an AI-generated blurb that a writer approves
// gets credited to the writer — helps attribution for anything they
// didn't compose from scratch but chose to ship.
router.post('/:id/publish', async (req, res) => {
  const { publishBlurb } = await import('../services/playerBlurbService.js')
  try {
    await supabase
      .from('player_blurbs')
      .update({ written_by: req.user.id })
      .eq('id', req.params.id)
      .is('written_by', null)
    const result = await publishBlurb(req.params.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// Publish all draft blurbs at once
router.post('/publish-all', async (req, res) => {
  const { publishAllDrafts } = await import('../services/playerBlurbService.js')
  try {
    const result = await publishAllDrafts()
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get blurb history for a player (admin/writer view — includes author)
router.get('/player/:playerId/history', async (req, res) => {
  const { data } = await supabase
    .from('player_blurbs')
    .select('*, writer:written_by(username, display_name)')
    .eq('player_id', req.params.playerId)
    .order('created_at', { ascending: false })
  res.json(data || [])
})

// Delete a blurb
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('player_blurbs')
    .delete()
    .eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ deleted: true })
})

export default router
