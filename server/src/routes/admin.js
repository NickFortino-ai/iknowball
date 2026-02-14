import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { syncOdds } from '../jobs/syncOdds.js'
import { scoreGames } from '../jobs/scoreGames.js'
import {
  syncPropsForGame,
  getAllPropsForGame,
  featureProp,
  unfeatureProp,
  settleProps,
  getFeaturedProps,
} from '../services/propService.js'
import {
  createTemplate,
  getTemplates,
  getTemplateDetails,
  updateTemplate,
  saveTemplateMatchups,
  deleteTemplate,
  getTemplateResults,
  enterTemplateResult,
  undoTemplateResult,
} from '../services/bracketService.js'

const router = Router()

// All admin routes require auth + admin
router.use(requireAuth, requireAdmin)

// System actions
router.post('/sync-odds', async (req, res) => {
  await syncOdds()
  res.json({ message: 'Odds sync complete' })
})

router.post('/score-games', async (req, res) => {
  await scoreGames()
  res.json({ message: 'Game scoring complete' })
})

// Props management
router.post('/props/sync', async (req, res) => {
  const { gameId, markets } = req.body
  if (!gameId) {
    return res.status(400).json({ error: 'gameId is required' })
  }
  const result = await syncPropsForGame(gameId, markets)
  res.json(result)
})

router.get('/props/game/:gameId', async (req, res) => {
  const props = await getAllPropsForGame(req.params.gameId)
  res.json(props)
})

router.get('/props/featured', async (req, res) => {
  const props = await getFeaturedProps()
  res.json(props)
})

router.post('/props/feature', async (req, res) => {
  const { propId, featuredDate } = req.body
  if (!propId || !featuredDate) {
    return res.status(400).json({ error: 'propId and featuredDate are required' })
  }
  const result = await featureProp(propId, featuredDate)
  res.json(result)
})

router.post('/props/:propId/unfeature', async (req, res) => {
  const result = await unfeatureProp(req.params.propId)
  res.json(result)
})

router.post('/props/settle', async (req, res) => {
  const { settlements } = req.body
  if (!settlements?.length) {
    return res.status(400).json({ error: 'settlements array is required' })
  }
  const results = await settleProps(settlements)
  res.json(results)
})

// ============================================
// Bracket Templates
// ============================================

router.get('/bracket-templates', async (req, res) => {
  const templates = await getTemplates({ sport: req.query.sport })
  res.json(templates)
})

router.get('/bracket-templates/:id', async (req, res) => {
  const template = await getTemplateDetails(req.params.id)
  res.json(template)
})

router.post('/bracket-templates', async (req, res) => {
  const { name, sport, team_count, description, rounds, regions } = req.body
  if (!name || !sport || !team_count) {
    return res.status(400).json({ error: 'name, sport, and team_count are required' })
  }
  const template = await createTemplate(req.user.id, { name, sport, team_count, description, rounds, regions })
  res.status(201).json(template)
})

router.patch('/bracket-templates/:id', async (req, res) => {
  const template = await updateTemplate(req.params.id, req.user.id, req.body)
  res.json(template)
})

router.post('/bracket-templates/:id/matchups', async (req, res) => {
  const { matchups } = req.body
  if (!matchups) {
    return res.status(400).json({ error: 'matchups array is required' })
  }
  const result = await saveTemplateMatchups(req.params.id, req.user.id, matchups)
  res.json(result)
})

router.delete('/bracket-templates/:id', async (req, res) => {
  await deleteTemplate(req.params.id, req.user.id)
  res.status(204).end()
})

// Template Results
router.get('/bracket-templates/:id/results', async (req, res) => {
  const results = await getTemplateResults(req.params.id)
  res.json(results)
})

router.post('/bracket-templates/:id/results', async (req, res) => {
  const { template_matchup_id, winner } = req.body
  if (!template_matchup_id || !winner) {
    return res.status(400).json({ error: 'template_matchup_id and winner are required' })
  }
  const result = await enterTemplateResult(req.params.id, template_matchup_id, winner)
  res.json(result)
})

router.delete('/bracket-templates/:id/results/:matchupId', async (req, res) => {
  await undoTemplateResult(req.params.id, req.params.matchupId)
  res.status(204).end()
})

export default router
