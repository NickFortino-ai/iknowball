import { useState } from 'react'
import { useGames } from '../hooks/useGames'
import { useSyncOdds, useScoreGames, useRecalculatePoints, useRecalculateRecords, useSendEmailBlast, useSendTargetedEmail, useSendTemplateBracketEmail, useBracketTemplates, useBracketTemplateUserCount, useEmailLogs, useAdminFeaturedProps, useVoidProp, useSettleProps } from '../hooks/useAdmin'
import { useAuth } from '../hooks/useAuth'
import { useSearchUsers } from '../hooks/useInvitations'
import PropSyncPanel from '../components/admin/PropSyncPanel'
import BracketTemplateManager from '../components/admin/BracketTemplateManager'
import FuturesAdminPanel from '../components/admin/FuturesAdminPanel'
import ReportsPanel from '../components/admin/ReportsPanel'
import ModerationPanel from '../components/admin/ModerationPanel'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { toast } from '../components/ui/Toast'
import Avatar from '../components/ui/Avatar'

const sportTabs = [
  { label: 'NBA', key: 'basketball_nba' },
  { label: 'NCAAB', key: 'basketball_ncaab' },
  { label: 'WNCAAB', key: 'basketball_wncaab' },
  { label: 'WNBA', key: 'basketball_wnba' },
  { label: 'MLB', key: 'baseball_mlb' },
  { label: 'NFL', key: 'americanfootball_nfl' },
  { label: 'NCAAF', key: 'americanfootball_ncaaf' },
]

export default function AdminPage() {
  const { profile } = useAuth()
  const [adminSection, setAdminSection] = useState('props') // props | brackets | email | futures | reports | moderation
  const [activeSport, setActiveSport] = useState(0)
  const [selectedGame, setSelectedGame] = useState(null)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailMode, setEmailMode] = useState('all') // 'all' | 'targeted' | 'template'
  const [targetUsers, setTargetUsers] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  const { data: userSearchResults } = useSearchUsers(userSearch)
  const sportKey = sportTabs[activeSport].key
  const { data: games, isLoading: gamesLoading } = useGames(sportKey, 'upcoming', 7)
  const { data: featuredProps } = useAdminFeaturedProps()
  const voidProp = useVoidProp()
  const settleProps = useSettleProps()

  const syncOdds = useSyncOdds()
  const scoreGames = useScoreGames()
  const recalculatePoints = useRecalculatePoints()
  const recalculateRecords = useRecalculateRecords()
  const sendEmailBlast = useSendEmailBlast()
  const sendTargetedEmail = useSendTargetedEmail()
  const sendTemplateBracketEmail = useSendTemplateBracketEmail()
  const { data: emailTemplates } = useBracketTemplates()
  const { data: templateUserCount } = useBracketTemplateUserCount(selectedTemplateId)
  const { data: emailLogs } = useEmailLogs()

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
      const data = await syncOdds.mutateAsync()
      const results = data.results || []
      const total = results.reduce((sum, r) => sum + r.synced, 0)
      const errors = results.filter(r => r.status === 'api_error')
      console.table(results)
      let msg = `Synced ${total} games`
      if (errors.length > 0) msg += ` (${errors.map(e => e.sport).join(', ')} failed)`
      toast(msg, errors.length > 0 ? 'info' : 'success')
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
    if (emailMode === 'template') {
      const selectedTemplate = emailTemplates?.find((t) => t.id === selectedTemplateId)
      if (!selectedTemplateId || !selectedTemplate) return toast('Select a template', 'error')
      const userCount = templateUserCount?.count || 0
      if (!confirm(`Send this email to all ${userCount} user(s) in leagues using "${selectedTemplate.name}"?\n\nSubject: ${emailSubject}`)) return
      try {
        const result = await sendTemplateBracketEmail.mutateAsync({ subject: emailSubject, body: emailBody, templateId: selectedTemplateId })
        toast(`Email sent to ${result.sent} user(s)${result.failed ? ` (${result.failed} failed)` : ''}`, result.sent > 0 ? 'success' : 'error')
        setEmailSubject('')
        setEmailBody('')
      } catch (err) {
        toast(err.message || 'Template email failed', 'error')
      }
    } else if (emailMode === 'targeted') {
      const usernames = targetUsers.map((u) => u.username)
      if (!usernames.length) return toast('Select at least one user', 'error')
      if (!confirm(`Send this email to ${usernames.length} user(s)?\n\n${usernames.join(', ')}\n\nSubject: ${emailSubject}`)) return
      try {
        const result = await sendTargetedEmail.mutateAsync({ subject: emailSubject, body: emailBody, usernames })
        let msg = `Email sent to ${result.sent} user(s)`
        if (result.failed) msg += ` (${result.failed} failed)`
        if (result.notFound?.length) msg += `. Not found: ${result.notFound.join(', ')}`
        toast(msg, result.sent > 0 ? 'success' : 'error')
        setEmailSubject('')
        setEmailBody('')
        setTargetUsers([])
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

  async function handleRecalculateRecords() {
    try {
      const result = await recalculateRecords.mutateAsync()
      toast(`Records recalculated — ${result.updated} updated`, 'success')
    } catch (err) {
      toast(err.message || 'Record recalculation failed', 'error')
    }
  }

  async function handleVoid(propId) {
    if (!window.confirm('Void this prop? All picks will be cancelled and any points reversed.')) return
    try {
      const result = await voidProp.mutateAsync(propId)
      toast(`Prop voided — reverted ${result.voidedCount} picks`, 'success')
    } catch (err) {
      toast(err.message || 'Failed to void prop', 'error')
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
      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setAdminSection('props')}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            adminSection === 'props'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          Props Manager
        </button>
        <button
          onClick={() => setAdminSection('brackets')}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            adminSection === 'brackets'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          Brackets
        </button>
        <button
          onClick={() => setAdminSection('futures')}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            adminSection === 'futures'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          Futures
        </button>
        <button
          onClick={() => setAdminSection('email')}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            adminSection === 'email'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          Email Blast
        </button>
        <button
          onClick={() => setAdminSection('reports')}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            adminSection === 'reports'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          Reports
        </button>
        <button
          onClick={() => setAdminSection('moderation')}
          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            adminSection === 'moderation'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          Moderation
        </button>
      </div>

      {adminSection === 'email' && (<>
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
          <h2 className="font-display text-xl mb-4">Send Email</h2>
          <p className="text-text-muted text-sm mb-4">
            From: admin@iknowball.club
          </p>
          <div className="space-y-4">
            <div className="flex bg-bg-primary rounded-lg border border-border p-1">
              {[
                { value: 'all', label: 'All Users' },
                { value: 'targeted', label: 'Targeted' },
                { value: 'template', label: 'Template' },
              ].map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setEmailMode(mode.value)}
                  className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
                    emailMode === mode.value ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg-card-hover'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {emailMode === 'template' && (
              <div>
                <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Bracket Template</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
                >
                  <option value="">Select a template...</option>
                  {(emailTemplates || []).map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.team_count} teams)</option>
                  ))}
                </select>
                {selectedTemplateId && templateUserCount && (
                  <div className="text-xs text-text-secondary mt-1.5">
                    {templateUserCount.count} user{templateUserCount.count !== 1 ? 's' : ''} in leagues using this template
                  </div>
                )}
              </div>
            )}
            {emailMode === 'targeted' && (
              <div>
                <label className="block text-xs text-text-muted uppercase tracking-wider mb-1">Recipients</label>
                <div className="bg-bg-primary border border-border rounded-lg px-3 py-2 focus-within:border-accent">
                  {/* Selected user chips */}
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {targetUsers.map((user) => (
                      <span
                        key={user.id}
                        className="inline-flex items-center gap-1 bg-accent/15 text-accent text-xs font-medium pl-1.5 pr-1 py-0.5 rounded-full"
                      >
                        <span className="w-4 h-4 rounded-full bg-bg-primary flex items-center justify-center text-[10px] shrink-0">
                          {user.avatar_emoji || user.username[0].toUpperCase()}
                        </span>
                        {user.display_name || user.username}
                        <button
                          type="button"
                          onClick={() => setTargetUsers((prev) => prev.filter((u) => u.id !== user.id))}
                          className="ml-0.5 hover:text-white transition-colors leading-none text-sm"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                  {/* Search input */}
                  <div className="relative">
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder={targetUsers.length ? 'Add another user...' : 'Search by username or name...'}
                      className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none py-1"
                    />
                    {/* Dropdown results */}
                    {userSearch.length >= 2 && userSearchResults?.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-10 overflow-hidden max-h-48 overflow-y-auto">
                        {userSearchResults
                          .filter((user) => !targetUsers.some((t) => t.id === user.id))
                          .map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => {
                                setTargetUsers((prev) => [...prev, user])
                                setUserSearch('')
                              }}
                              className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-bg-card-hover transition-colors"
                            >
                              <Avatar user={user} size="md" />
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{user.display_name || user.username}</div>
                                <div className="text-xs text-text-muted">@{user.username}</div>
                              </div>
                            </button>
                          ))}
                      </div>
                    )}
                    {userSearch.length >= 2 && userSearchResults?.length === 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border rounded-xl shadow-lg z-10 px-4 py-2.5 text-sm text-text-muted">
                        No users found
                      </div>
                    )}
                  </div>
                </div>
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
              disabled={
                (sendEmailBlast.isPending || sendTargetedEmail.isPending || sendTemplateBracketEmail.isPending)
                || !emailSubject.trim() || !emailBody.trim()
                || (emailMode === 'targeted' && !targetUsers.length)
                || (emailMode === 'template' && !selectedTemplateId)
              }
              className="bg-accent hover:bg-accent/90 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {(sendEmailBlast.isPending || sendTargetedEmail.isPending || sendTemplateBracketEmail.isPending)
                ? 'Sending...'
                : emailMode === 'template'
                  ? `Send to ${emailTemplates?.find((t) => t.id === selectedTemplateId)?.name || 'Template'} Users`
                  : emailMode === 'targeted'
                    ? 'Send to Selected Users'
                    : 'Send to All Users'}
            </button>
          </div>
        </div>

        {/* Sent Emails Log */}
        {emailLogs?.length > 0 && (
          <div className="bg-bg-card rounded-xl border border-border p-4">
            <h2 className="font-display text-xl mb-4">Sent Emails</h2>
            <div className="space-y-3">
              {emailLogs.map((log) => (
                <div key={log.id} className="bg-bg-primary rounded-lg p-3 border border-border">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text-primary truncate">{log.subject}</div>
                      <div className="text-xs text-text-muted mt-0.5">
                        {new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded ${
                      log.type === 'blast' ? 'bg-accent/10 text-accent'
                        : log.type === 'template_blast' ? 'bg-purple-500/10 text-purple-400'
                        : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {log.type === 'blast' ? 'All Users' : log.type === 'template_blast' ? 'Template' : 'Targeted'}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs mb-2">
                    <span className="text-correct">{log.sent} sent</span>
                    {log.failed > 0 && <span className="text-incorrect">{log.failed} failed</span>}
                    {log.recipients_not_found?.length > 0 && (
                      <span className="text-yellow-400">{log.recipients_not_found.length} not found</span>
                    )}
                  </div>
                  {log.recipients_sent?.length > 0 && (
                    <div className="text-xs text-text-secondary mb-1">
                      <span className="text-text-muted">Sent to: </span>
                      {log.recipients_sent.join(', ')}
                    </div>
                  )}
                  {log.recipients_not_found?.length > 0 && (
                    <div className="text-xs text-yellow-400">
                      <span className="text-text-muted">Not found: </span>
                      {log.recipients_not_found.join(', ')}
                    </div>
                  )}
                  {log.recipients_failed?.length > 0 && (
                    <div className="text-xs text-incorrect">
                      <span className="text-text-muted">Failed: </span>
                      {log.recipients_failed.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </>)}

      {adminSection === 'brackets' && <BracketTemplateManager />}

      {adminSection === 'futures' && <FuturesAdminPanel />}

      {adminSection === 'reports' && <ReportsPanel />}

      {adminSection === 'moderation' && <ModerationPanel />}

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
                  {/* Voided badge */}
                  {prop.status === 'voided' && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-text-muted/20 text-text-muted">
                      VOIDED
                    </span>
                  )}
                  {prop.status !== 'voided' && (
                    <button
                      onClick={() => handleVoid(prop.id)}
                      disabled={voidProp.isPending}
                      className="text-xs text-incorrect hover:underline shrink-0"
                    >
                      Void
                    </button>
                  )}
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
      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
        {sportTabs.map((tab, i) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveSport(i)
              setSelectedGame(null)
            }}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
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
        <div className="flex gap-3 overflow-x-auto scrollbar-hide">
          <button
            onClick={handleSyncOdds}
            disabled={syncOdds.isPending}
            className="shrink-0 bg-bg-card-hover hover:bg-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {syncOdds.isPending ? 'Syncing...' : 'Sync Odds'}
          </button>
          <button
            onClick={handleScoreGames}
            disabled={scoreGames.isPending}
            className="shrink-0 bg-bg-card-hover hover:bg-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {scoreGames.isPending ? 'Scoring...' : 'Score Games'}
          </button>
          <button
            onClick={handleRecalculatePoints}
            disabled={recalculatePoints.isPending}
            className="shrink-0 bg-bg-card-hover hover:bg-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {recalculatePoints.isPending ? 'Recalculating...' : 'Recalculate Points'}
          </button>
          <button
            onClick={handleRecalculateRecords}
            disabled={recalculateRecords.isPending}
            className="shrink-0 bg-bg-card-hover hover:bg-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {recalculateRecords.isPending ? 'Recalculating...' : 'Recalculate Records'}
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
