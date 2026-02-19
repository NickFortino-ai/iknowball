import { useState } from 'react'
import { useGames } from '../hooks/useGames'
import { useSyncOdds, useScoreGames, useRecalculatePoints, useSendEmailBlast, useSendTargetedEmail, useAdminFeaturedProps, useUnfeatureProp, useSettleProps } from '../hooks/useAdmin'
import { useAuth } from '../hooks/useAuth'
import PropSyncPanel from '../components/admin/PropSyncPanel'
import BracketTemplateManager from '../components/admin/BracketTemplateManager'
import FuturesAdminPanel from '../components/admin/FuturesAdminPanel'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { toast } from '../components/ui/Toast'

const sportTabs = [
  { label: 'NBA', key: 'basketball_nba' },
  { label: 'NCAAB', key: 'basketball_ncaab' },
  { label: 'WNBA', key: 'basketball_wnba' },
  { label: 'MLB', key: 'baseball_mlb' },
  { label: 'NFL', key: 'americanfootball_nfl' },
  { label: 'NCAAF', key: 'americanfootball_ncaaf' },
]

export default function AdminPage() {
  const { profile } = useAuth()
  const [adminSection, setAdminSection] = useState('props') // props | brackets | email | futures
  const [activeSport, setActiveSport] = useState(0)
  const [selectedGame, setSelectedGame] = useState(null)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailMode, setEmailMode] = useState('all') // 'all' | 'targeted'
  const [targetUsernames, setTargetUsernames] = useState('')

  const sportKey = sportTabs[activeSport].key
  const { data: games, isLoading: gamesLoading } = useGames(sportKey, 'upcoming', 7)
  const { data: featuredProps } = useAdminFeaturedProps()
  const unfeatureProp = useUnfeatureProp()
  const settleProps = useSettleProps()

  const syncOdds = useSyncOdds()
  const scoreGames = useScoreGames()
  const recalculatePoints = useRecalculatePoints()
  const sendEmailBlast = useSendEmailBlast()
  const sendTargetedEmail = useSendTargetedEmail()

  if (!profile?.is_admin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-display text-3xl mb-4">Access Denied</h1>
        <p className="text-text-muted">You need admin access to view this page.</p>
      </div>
    )
  }

  async function handleSyncOdds() {
    try {
      await syncOdds.mutateAsync()
      toast('Odds synced successfully', 'success')
    } catch (err) {
      toast(err.message || 'Sync failed', 'error')
    }
  }

  async function handleScoreGames() {
    try {
      await scoreGames.mutateAsync()
      toast('Games scored successfully', 'success')
    } catch (err) {
      toast(err.message || 'Scoring failed', 'error')
    }
  }

  async function handleSendEmail() {
    if (emailMode === 'targeted') {
      const usernames = targetUsernames.split(',').map((u) => u.trim()).filter(Boolean)
      if (!usernames.length) return toast('Enter at least one username', 'error')
      if (!confirm(`Send this email to ${usernames.length} user(s)?\n\n${usernames.join(', ')}\n\nSubject: ${emailSubject}`)) return
      try {
        const result = await sendTargetedEmail.mutateAsync({ subject: emailSubject, body: emailBody, usernames })
        let msg = `Email sent to ${result.sent} user(s)`
        if (result.failed) msg += ` (${result.failed} failed)`
        if (result.notFound?.length) msg += `. Not found: ${result.notFound.join(', ')}`
        toast(msg, result.sent > 0 ? 'success' : 'error')
        setEmailSubject('')
        setEmailBody('')
        setTargetUsernames('')
      } catch (err) {
        toast(err.message || 'Targeted email failed', 'error')
      }
    } else {
      if (!confirm(`Send this email to ALL users?\n\nSubject: ${emailSubject}`)) return
      try {
        const result = await sendEmailBlast.mutateAsync({ subject: emailSubject, body: emailBody })
        toast(`Email sent to ${result.sent} users${result.failed ? ` (${result.failed} failed)` : ''}`, 'success')
        setEmailSubject('')
        setEmailBody('')
      } catch (err) {
        toast(err.message || 'Email blast failed', 'error')
      }
    }
  }

  async function handleRecalculatePoints() {
    try {
      const result = await recalculatePoints.mutateAsync()
      toast(`Recalculated — ${result.corrections.length} users corrected`, 'success')
    } catch (err) {
      toast(err.message || 'Recalculation failed', 'error')
    }
  }

  async function handleUnfeature(propId) {
    try {
      await unfeatureProp.mutateAsync(propId)
      toast('Prop removed from featured', 'success')
    } catch (err) {
      toast(err.message || 'Failed to unfeature', 'error')
    }
  }

  async function handleSettle(propId, outcome) {
    try {
      const results = await settleProps.mutateAsync([{ propId, outcome }])
      const totalScored = results.reduce((sum, r) => sum + r.scored, 0)
      toast(`Settled as ${outcome} — scored ${totalScored} picks`, 'success')
    } catch (err) {
      toast(err.message || 'Settlement failed', 'error')
    }
  }

  const upcomingGames = games || []

  // Build 7-day schedule: map each date to its featured prop (if any)
  const scheduleDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
    const prop = (featuredProps || []).find((p) => p.featured_date === dateStr) || null
    return { dateStr, label, prop }
  })

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-4">Admin Panel</h1>

      {/* Top-level section tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setAdminSection('props')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            adminSection === 'props'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          Props Manager
        </button>
        <button
          onClick={() => setAdminSection('brackets')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            adminSection === 'brackets'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          Brackets
        </button>
        <button
          onClick={() => setAdminSection('futures')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            adminSection === 'futures'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          Futures
        </button>
        <button
          onClick={() => setAdminSection('email')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            adminSection === 'email'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          Email Blast
        </button>
      </div>

      {adminSection === 'email' && (
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
          <h2 className="font-display text-xl mb-4">Send Email</h2>
          <p className="text-text-muted text-sm mb-4">
            From: admin@iknowball.club
          </p>
          <div className="space-y-4">
            <div className="flex bg-bg-primary rounded-lg border border-border p-1">
              {['all', 'targeted'].map((mode) => (
                <button
                  key={mode}
                  onClick={() => setEmailMode(mode)}
                  className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
                    emailMode === mode ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-card-hover'
                  }`}
                >
                  {mode === 'all' ? 'All Users' : 'Targeted'}
                </button>
              ))}
            </div>
            {emailMode === 'targeted' && (
              <div>
                <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Usernames (comma-separated)</label>
                <input
                  type="text"
                  value={targetUsernames}
                  onChange={(e) => setTargetUsernames(e.target.value)}
                  placeholder="user1, user2, user3"
                  className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Subject</label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Email subject line..."
                className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Body (HTML supported)</label>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Write your email here... HTML tags like <b>, <a>, <p> are supported."
                rows={10}
                className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-y"
              />
            </div>
            <button
              onClick={handleSendEmail}
              disabled={(sendEmailBlast.isPending || sendTargetedEmail.isPending) || !emailSubject.trim() || !emailBody.trim() || (emailMode === 'targeted' && !targetUsernames.trim())}
              className="bg-accent hover:bg-accent/90 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {(sendEmailBlast.isPending || sendTargetedEmail.isPending)
                ? 'Sending...'
                : emailMode === 'targeted'
                  ? 'Send to Selected Users'
                  : 'Send to All Users'}
            </button>
          </div>
        </div>
      )}

      {adminSection === 'brackets' && <BracketTemplateManager />}

      {adminSection === 'futures' && <FuturesAdminPanel />}

      {adminSection === 'props' && <>
      {/* Featured Schedule — 7-day overview */}
      <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
        <h2 className="font-semibold text-sm mb-3">Featured Schedule</h2>
        <div className="space-y-1">
          {scheduleDays.map(({ dateStr, label, prop }) => (
            <div key={dateStr} className={`flex items-center gap-3 p-2.5 rounded-lg ${
              prop ? 'bg-accent/5 border border-accent/20' : 'bg-bg-secondary/50'
            }`}>
              <div className="w-20 shrink-0 text-xs font-semibold text-text-secondary">{label}</div>
              {prop ? (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {prop.player_name} — {prop.market_label} ({prop.line})
                    </div>
                    <div className="text-xs text-text-muted truncate">
                      {prop.games?.away_team} @ {prop.games?.home_team}
                    </div>
                  </div>
                  {/* Settle buttons for published/locked */}
                  {(prop.status === 'published' || prop.status === 'locked') && (
                    <div className="flex gap-1">
                      {['over', 'under', 'push'].map((outcome) => (
                        <button
                          key={outcome}
                          onClick={() => handleSettle(prop.id, outcome)}
                          disabled={settleProps.isPending}
                          className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50 ${
                            outcome === 'over'
                              ? 'bg-correct/20 text-correct hover:bg-correct/30'
                              : outcome === 'under'
                                ? 'bg-incorrect/20 text-incorrect hover:bg-incorrect/30'
                                : 'bg-text-muted/20 text-text-muted hover:bg-text-muted/30'
                          }`}
                        >
                          {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Outcome badge for settled */}
                  {prop.outcome && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      prop.outcome === 'over' ? 'bg-correct/20 text-correct'
                        : prop.outcome === 'under' ? 'bg-incorrect/20 text-incorrect'
                        : 'bg-text-muted/20 text-text-muted'
                    }`}>
                      {prop.outcome.toUpperCase()}
                    </span>
                  )}
                  <button
                    onClick={() => handleUnfeature(prop.id)}
                    disabled={unfeatureProp.isPending}
                    className="text-xs text-incorrect hover:underline shrink-0"
                  >
                    Unfeature
                  </button>
                </>
              ) : (
                <span className="text-xs text-text-muted">—</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Props Manager */}
      <h2 className="font-display text-xl mb-4">Sync & Feature Props</h2>

      {/* Sport Tabs */}
      <div className="flex gap-2 mb-4">
        {sportTabs.map((tab, i) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveSport(i)
              setSelectedGame(null)
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeSport === i
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Game List — upcoming only */}
        <div className="lg:col-span-1">
          {gamesLoading ? (
            <LoadingSpinner />
          ) : upcomingGames.length > 0 ? (
            <div className="space-y-1">
              {upcomingGames.map((game) => (
                <GameListItem
                  key={game.id}
                  game={game}
                  isSelected={selectedGame?.id === game.id}
                  onClick={() => setSelectedGame(game)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center text-text-muted text-sm py-8">No upcoming games</div>
          )}
        </div>

        {/* Props Panel */}
        <div className="lg:col-span-2">
          {selectedGame ? (
            <div>
              <h3 className="font-semibold text-sm mb-4">
                {selectedGame.away_team} @ {selectedGame.home_team}
              </h3>
              <PropSyncPanel game={selectedGame} sportKey={sportKey} />
            </div>
          ) : (
            <div className="text-center text-text-muted text-sm py-16">
              Select a game to sync & feature props
            </div>
          )}
        </div>
      </div>

      {/* System Actions — manual overrides, rarely needed */}
      <div className="bg-bg-card rounded-xl border border-border p-4 mt-8">
        <h2 className="text-xs text-text-muted uppercase tracking-wider mb-3">Manual Overrides</h2>
        <div className="flex gap-3">
          <button
            onClick={handleSyncOdds}
            disabled={syncOdds.isPending}
            className="bg-bg-card-hover hover:bg-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {syncOdds.isPending ? 'Syncing...' : 'Sync Odds'}
          </button>
          <button
            onClick={handleScoreGames}
            disabled={scoreGames.isPending}
            className="bg-bg-card-hover hover:bg-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {scoreGames.isPending ? 'Scoring...' : 'Score Games'}
          </button>
          <button
            onClick={handleRecalculatePoints}
            disabled={recalculatePoints.isPending}
            className="bg-bg-card-hover hover:bg-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {recalculatePoints.isPending ? 'Recalculating...' : 'Recalculate Points'}
          </button>
        </div>
      </div>
      </>}
    </div>
  )
}

function GameListItem({ game, isSelected, onClick }) {
  const time = new Date(game.starts_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-colors ${
        isSelected
          ? 'bg-accent/10 border-accent'
          : 'bg-bg-card border-border hover:bg-bg-card-hover'
      }`}
    >
      <div className="text-sm font-medium truncate">
        {game.away_team} @ {game.home_team}
      </div>
      <div className="text-xs text-text-muted mt-0.5">{time}</div>
    </button>
  )
}
