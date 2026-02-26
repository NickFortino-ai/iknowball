import { Router } from 'express'
import { decodeToken, unsubscribeUser } from '../services/emailService.js'

const router = Router()

// Public — no auth required
router.get('/unsubscribe', async (req, res) => {
  const { token } = req.query
  if (!token) {
    return res.status(400).json({ error: 'Missing token' })
  }

  try {
    const userId = decodeToken(token)
    await unsubscribeUser(userId)
    res.json({ message: 'You have been unsubscribed from I KNOW BALL emails.' })
  } catch {
    res.status(400).json({ error: 'Invalid unsubscribe link' })
  }
})

export default router
