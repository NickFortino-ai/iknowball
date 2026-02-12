import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { syncOdds } from '../jobs/syncOdds.js'
import { scoreGames } from '../jobs/scoreGames.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  const { sport, status } = req.query

  let query = supabase
    .from('games')
    .select('*, sports!inner(key, name)')
    .order('starts_at', { ascending: true })

  if (sport) {
    query = query.eq('sports.key', sport)
  }
  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error

  res.json(data)
})

router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('games')
    .select('*, sports(key, name)')
    .eq('id', req.params.id)
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Game not found' })
  }

  res.json(data)
})

// Dev/admin endpoints
router.post('/admin/sync-odds', async (req, res) => {
  await syncOdds()
  res.json({ message: 'Odds sync complete' })
})

router.post('/admin/score-games', async (req, res) => {
  await scoreGames()
  res.json({ message: 'Game scoring complete' })
})

export default router
