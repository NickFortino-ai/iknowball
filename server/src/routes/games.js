import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  const { sport, status, days } = req.query

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
  if (days) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + Number(days))
    query = query.lte('starts_at', cutoff.toISOString())
  }

  const { data, error } = await query
  if (error) throw error

  res.json(data)
})

router.get('/active-sports', requireAuth, async (req, res) => {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + 3)

  const { data, error } = await supabase
    .from('games')
    .select('sport_id, sports!inner(key, name)')
    .eq('status', 'upcoming')
    .lte('starts_at', cutoff.toISOString())

  if (error) throw error

  const counts = {}
  for (const game of data) {
    const key = game.sports.key
    if (!counts[key]) {
      counts[key] = { key, name: game.sports.name, count: 0 }
    }
    counts[key].count++
  }

  res.json(Object.values(counts))
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

export default router
