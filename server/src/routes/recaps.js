import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { getLatestRecap, getRecapArchive } from '../services/recapService.js'

const router = Router()

async function checkAdmin(userId) {
  const { data } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single()
  return !!data?.is_admin
}

router.get('/latest', requireAuth, async (req, res) => {
  const isAdmin = await checkAdmin(req.user.id)
  const recap = await getLatestRecap({ isAdmin })
  res.json(recap)
})

router.get('/archive', requireAuth, async (req, res) => {
  const isAdmin = await checkAdmin(req.user.id)
  const recaps = await getRecapArchive({ isAdmin })
  res.json(recaps)
})

export default router
