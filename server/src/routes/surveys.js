import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import {
  ENTRY_QUESTIONS,
  EXIT_QUESTIONS,
  TOP_NOTE,
  sportLabel,
  getQuestionsFor,
} from '../services/surveyService.js'

const router = Router()
router.use(requireAuth)

// Tell the client whether the modal should appear for this user in this
// league, and which survey to show. Returns:
//   { surveyType: 'entry' | 'exit' | null, questions, sportLabel, topNote }
router.get('/status', async (req, res) => {
  const { league_id } = req.query
  if (!league_id) return res.status(400).json({ error: 'league_id required' })

  const { data: league } = await supabase
    .from('leagues')
    .select('id, sport, survey_enabled, starts_at, ends_at')
    .eq('id', league_id)
    .maybeSingle()
  if (!league || !league.survey_enabled) return res.json({ surveyType: null })

  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', league_id)
    .eq('user_id', req.user.id)
    .maybeSingle()
  if (!member) return res.json({ surveyType: null })

  const { data: rows } = await supabase
    .from('user_surveys')
    .select('survey_type, submitted_at, dismissed_at')
    .eq('user_id', req.user.id)
    .eq('league_id', league_id)
  const byType = {}
  for (const r of rows || []) byType[r.survey_type] = r

  const now = Date.now()
  const endsAt = league.ends_at ? new Date(league.ends_at).getTime() : null
  const hasEnded = endsAt && endsAt <= now

  let surveyType = null
  if (hasEnded) {
    const exit = byType.exit
    if (!exit || (!exit.submitted_at && !exit.dismissed_at)) surveyType = 'exit'
  } else {
    const entry = byType.entry
    if (!entry || (!entry.submitted_at && !entry.dismissed_at)) surveyType = 'entry'
  }

  if (!surveyType) return res.json({ surveyType: null })

  return res.json({
    surveyType,
    questions: getQuestionsFor(surveyType),
    sportLabel: sportLabel(league.sport),
    topNote: TOP_NOTE,
  })
})

// Validate that the responses object covers every required question for
// the survey type, with a recognized value per question. Returns null on
// success, or an error string on failure.
function validateResponses(surveyType, responses) {
  if (!responses || typeof responses !== 'object') return 'responses required'
  const questions = surveyType === 'exit' ? EXIT_QUESTIONS : ENTRY_QUESTIONS
  for (const q of questions) {
    const v = responses[q.id]
    if (v === undefined || v === null || v === '') return `missing answer for ${q.id}`
    if (q.type === 'scale') {
      const n = Number(v)
      if (!Number.isFinite(n) || n < q.min || n > q.max) return `bad value for ${q.id}`
    } else {
      const ok = (q.options || []).some((o) => o.value === v)
      if (!ok) return `bad value for ${q.id}`
    }
  }
  return null
}

router.post('/submit', async (req, res) => {
  const { league_id, survey_type, responses } = req.body
  if (!league_id || !survey_type) return res.status(400).json({ error: 'league_id and survey_type required' })
  if (survey_type !== 'entry' && survey_type !== 'exit') return res.status(400).json({ error: 'bad survey_type' })

  const err = validateResponses(survey_type, responses)
  if (err) return res.status(400).json({ error: err })

  const { error: upsertErr } = await supabase
    .from('user_surveys')
    .upsert({
      user_id: req.user.id,
      league_id,
      survey_type,
      responses,
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'user_id,league_id,survey_type' })

  if (upsertErr) {
    logger.error({ err: upsertErr, userId: req.user.id, league_id, survey_type }, 'Failed to save survey response')
    return res.status(500).json({ error: 'failed to save' })
  }
  res.json({ ok: true })
})

router.post('/dismiss', async (req, res) => {
  const { league_id, survey_type } = req.body
  if (!league_id || !survey_type) return res.status(400).json({ error: 'league_id and survey_type required' })
  if (survey_type !== 'entry' && survey_type !== 'exit') return res.status(400).json({ error: 'bad survey_type' })

  const { error: upsertErr } = await supabase
    .from('user_surveys')
    .upsert({
      user_id: req.user.id,
      league_id,
      survey_type,
      dismissed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,league_id,survey_type' })

  if (upsertErr) {
    logger.error({ err: upsertErr, userId: req.user.id, league_id, survey_type }, 'Failed to dismiss survey')
    return res.status(500).json({ error: 'failed to dismiss' })
  }
  res.json({ ok: true })
})

export default router
