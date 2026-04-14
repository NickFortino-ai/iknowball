import { Router } from 'express'
import { decodeToken, unsubscribeUser } from '../services/emailService.js'

const router = Router()

// Shared handler — accepts token from query (GET click) or body (POST
// one-click per RFC 8058 List-Unsubscribe-Post).
async function handleUnsubscribe(req, res) {
  const token = req.query?.token || req.body?.token
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
}

// Public — no auth required. Both GET (user click) and POST (Gmail/
// Yahoo one-click via List-Unsubscribe header) hit the same logic.
router.get('/unsubscribe', handleUnsubscribe)
router.post('/unsubscribe', handleUnsubscribe)

export default router
