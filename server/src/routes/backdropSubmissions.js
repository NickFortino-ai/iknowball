import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { submitBackdrop } from '../services/backdropSubmissionService.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only JPG, PNG, and WebP images are allowed'))
    }
  },
})

router.post('/submit', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image provided' })

  const leagueId = req.body.league_id || null
  const submission = await submitBackdrop(
    req.user.id,
    leagueId,
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype
  )

  res.status(201).json(submission)
})

export default router
