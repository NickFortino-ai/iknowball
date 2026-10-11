// Trivia question authoring and review.
//
// Historical trivia cannot be derived from our data — the database holds the
// current season and the one before it, and nothing earlier. So these
// questions are WRITTEN, and this is where they are written and reviewed.
//
// Same posture as player blurbs: drafts are created freely, publishing is a
// deliberate act, and nothing unreviewed is ever served to a player.
import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { logger } from '../utils/logger.js'

const router = Router()
router.use(requireAuth, requireAdmin)

const VALID_STATUS = ['draft', 'published', 'archived']

/**
 * Validate one question. Returns an error string, or null when it is sound.
 *
 * A trivia question with no single right answer is worse than no question, so
 * these are refused at the door rather than discovered by a player:
 *   - at least two choices, and no duplicates among them
 *   - answer_index actually points at one of them
 */
function validate(q) {
  if (!q?.question || !String(q.question).trim()) return 'question text is required'
  const choices = Array.isArray(q.choices) ? q.choices.map((c) => String(c).trim()).filter(Boolean) : []
  if (choices.length < 2) return 'at least two choices are required'
  if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) return 'choices must be distinct'
  const idx = Number(q.answer_index)
  if (!Number.isInteger(idx) || idx < 0 || idx >= choices.length) return 'answer_index must point at one of the choices'
  return null
}

// List, filtered by status and/or sport.
router.get('/', async (req, res, next) => {
  try {
    const { status, sport } = req.query
    let q = supabase
      .from('trivia_questions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    if (status && VALID_STATUS.includes(status)) q = q.eq('status', status)
    if (sport) q = q.eq('sport', sport)
    const { data, error } = await q
    if (error) throw error

    // Counts by status so the panel can show the size of the review queue
    // without a second call.
    const { data: all } = await supabase.from('trivia_questions').select('status, sport')
    const byStatus = {}
    const publishedBySport = {}
    for (const r of all || []) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1
      if (r.status === 'published') publishedBySport[r.sport] = (publishedBySport[r.sport] || 0) + 1
    }
    res.json({ questions: data || [], byStatus, publishedBySport })
  } catch (err) {
    next(err)
  }
})

// Create one or many. Bulk is the point — writing historical questions is a
// batch activity, and one-at-a-time would make seeding the game miserable.
router.post('/', async (req, res, next) => {
  try {
    const incoming = Array.isArray(req.body?.questions) ? req.body.questions : [req.body]
    if (!incoming.length) return res.status(400).json({ error: 'questions required' })

    const rows = []
    const rejected = []
    incoming.forEach((q, i) => {
      const problem = validate(q)
      if (problem) { rejected.push({ index: i, question: q?.question || '', problem }); return }
      rows.push({
        sport: String(q.sport || 'all'),
        question: String(q.question).trim(),
        choices: q.choices.map((c) => String(c).trim()).filter(Boolean),
        answer_index: Number(q.answer_index),
        explanation: q.explanation ? String(q.explanation).trim() : null,
        difficulty: Math.min(5, Math.max(1, Number(q.difficulty) || 2)),
        source: q.source === 'ai' ? 'ai' : 'manual',
        // Drafts by default. Publishing is a separate, deliberate act even
        // for the admin who wrote them — a typo in an answer is invisible
        // until someone gets marked wrong for being right.
        status: 'draft',
        created_by: req.user.id,
      })
    })

    let inserted = []
    if (rows.length) {
      const { data, error } = await supabase.from('trivia_questions').insert(rows).select('id')
      if (error) throw error
      inserted = data || []
    }

    logger.info({ inserted: inserted.length, rejected: rejected.length }, 'Trivia questions created')
    res.status(201).json({ inserted: inserted.length, rejected })
  } catch (err) {
    next(err)
  }
})

// Edit a question. Re-validated, because an edit can break an answer index
// just as easily as a create can.
router.patch('/:id', async (req, res, next) => {
  try {
    const { data: existing } = await supabase
      .from('trivia_questions').select('*').eq('id', req.params.id).maybeSingle()
    if (!existing) return res.status(404).json({ error: 'Question not found' })

    const merged = {
      question: req.body.question ?? existing.question,
      choices: req.body.choices ?? existing.choices,
      answer_index: req.body.answer_index ?? existing.answer_index,
    }
    const problem = validate(merged)
    if (problem) return res.status(400).json({ error: problem })

    const update = {
      question: String(merged.question).trim(),
      choices: merged.choices.map((c) => String(c).trim()).filter(Boolean),
      answer_index: Number(merged.answer_index),
      updated_at: new Date().toISOString(),
    }
    if (req.body.sport !== undefined) update.sport = String(req.body.sport)
    if (req.body.explanation !== undefined) update.explanation = req.body.explanation || null
    if (req.body.difficulty !== undefined) {
      update.difficulty = Math.min(5, Math.max(1, Number(req.body.difficulty) || 2))
    }
    if (req.body.status !== undefined) {
      if (!VALID_STATUS.includes(req.body.status)) return res.status(400).json({ error: 'invalid status' })
      update.status = req.body.status
      update.reviewed_by = req.user.id
      update.reviewed_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('trivia_questions').update(update).eq('id', req.params.id).select().single()
    if (error) throw error
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// Publish or archive a batch — the review queue's main action.
router.post('/bulk-status', async (req, res, next) => {
  try {
    const { ids, status } = req.body || {}
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids required' })
    if (!VALID_STATUS.includes(status)) return res.status(400).json({ error: 'invalid status' })

    const { data, error } = await supabase
      .from('trivia_questions')
      .update({
        status,
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
      .select('id')
    if (error) throw error
    res.json({ updated: (data || []).length, status })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase.from('trivia_questions').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ deleted: true })
  } catch (err) {
    next(err)
  }
})

export default router
