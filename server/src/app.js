import express from 'express'
import cors from 'cors'
import { env } from './config/env.js'
import { errorHandler } from './middleware/errorHandler.js'
import healthRouter from './routes/health.js'
import usersRouter from './routes/users.js'
import gamesRouter from './routes/games.js'
import picksRouter from './routes/picks.js'
import leaderboardRouter from './routes/leaderboard.js'
import leaguesRouter from './routes/leagues.js'
import adminRouter from './routes/admin.js'
import propsRouter from './routes/props.js'

const app = express()

app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
app.use(express.json())

app.use('/api/health', healthRouter)
app.use('/api/users', usersRouter)
app.use('/api/games', gamesRouter)
app.use('/api/picks', picksRouter)
app.use('/api/leaderboard', leaderboardRouter)
app.use('/api/leagues', leaguesRouter)
app.use('/api/admin', adminRouter)
app.use('/api/props', propsRouter)

app.use(errorHandler)

export default app
