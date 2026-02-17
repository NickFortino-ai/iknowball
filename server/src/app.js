import express from 'express'
import cors from 'cors'
import { env } from './config/env.js'
import { errorHandler } from './middleware/errorHandler.js'
import webhooksRouter from './routes/webhooks.js'
import healthRouter from './routes/health.js'
import usersRouter from './routes/users.js'
import gamesRouter from './routes/games.js'
import picksRouter from './routes/picks.js'
import leaderboardRouter from './routes/leaderboard.js'
import leaguesRouter from './routes/leagues.js'
import adminRouter from './routes/admin.js'
import propsRouter from './routes/props.js'
import parlaysRouter from './routes/parlays.js'
import paymentsRouter from './routes/payments.js'
import connectionsRouter from './routes/connections.js'
import socialRouter from './routes/social.js'
import notificationsRouter from './routes/notifications.js'
import pushRouter from './routes/push.js'

const app = express()

const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim())
app.use(cors({ origin: allowedOrigins, credentials: true }))

// Webhooks must be mounted before express.json() — Stripe needs raw body
app.use('/api/webhooks', webhooksRouter)

app.use(express.json())

app.use('/api/health', healthRouter)
app.use('/api/users', usersRouter)
app.use('/api/games', gamesRouter)
app.use('/api/picks', picksRouter)
app.use('/api/parlays', parlaysRouter)
app.use('/api/leaderboard', leaderboardRouter)
app.use('/api/leagues', leaguesRouter)
app.use('/api/admin', adminRouter)
app.use('/api/props', propsRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/connections', connectionsRouter)
app.use('/api/social', socialRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/push', pushRouter)

app.use(errorHandler)

export default app
