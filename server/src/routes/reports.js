import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { logger } from '../utils/logger.js'
import { sendReportNotification } from '../services/reportService.js'

const router = Router()

router.use(requireAuth)

// Submit a report
router.post('/', async (req, res) => {
  const { reported_user_id, target_type, target_id, reason, details } = req.body

  if (!reported_user_id || !target_type || !reason) {
    return res.status(400).json({ error: 'reported_user_id, target_type, and reason are required' })
  }

  if (reported_user_id === req.user.id) {
    return res.status(400).json({ error: 'You cannot report yourself' })
  }

  const trimmedDetails = details?.trim().slice(0, 500) || null

  const { data, error } = await supabase
    .from('reports')
    .insert({
      reporter_id: req.user.id,
      reported_user_id,
      target_type,
      target_id: target_id || null,
      reason,
      details: trimmedDetails,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'You have already reported this content' })
    }
    logger.error({ error, userId: req.user.id }, 'Failed to create report')
    throw error
  }

  // Send email notification to admin (fire and forget)
  sendReportNotification(data, req.user.id).catch((err) => {
    logger.error({ err }, 'Failed to send report notification email')
  })

  logger.info({ reportId: data.id, reporterId: req.user.id, targetType: target_type }, 'Report submitted')
  res.status(201).json(data)
})

// Check if user has already reported specific content
router.get('/check', async (req, res) => {
  const { target_type, target_id } = req.query
  if (!target_type) {
    return res.status(400).json({ error: 'target_type is required' })
  }

  const query = supabase
    .from('reports')
    .select('id')
    .eq('reporter_id', req.user.id)
    .eq('target_type', target_type)

  if (target_id) {
    query.eq('target_id', target_id)
  } else {
    query.is('target_id', null)
  }

  const { data } = await query.maybeSingle()
  res.json({ reported: !!data })
})

export default router
