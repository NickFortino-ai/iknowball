import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  const { sport } = req.query
  if (!sport) {
    return res.status(400).json({ error: 'sport query param is required' })
  }

  const { data: sportRow } = await supabase
    .from('sports')
    .select('id')
    .eq('key', sport)
    .single()

  if (!sportRow) return res.json([])

  const { data: games, error } = await supabase
    .from('games')
    .select('home_team, away_team')
    .eq('sport_id', sportRow.id)

  if (error) return res.json([])

  const teamSet = new Set()
  for (const g of games || []) {
    if (g.home_team) teamSet.add(g.home_team)
    if (g.away_team) teamSet.add(g.away_team)
  }

  res.json([...teamSet].sort())
})

export default router
