import { useState } from 'react'
import { useGames } from '../hooks/useGames'
import { useSyncOdds, useSyncInjuries, useScoreGames, useRecalculatePoints, useRecalculateRecords, useSyncNBASalaries, useSyncMLBSalaries, useSendEmailBlast, useSendTargetedEmail, useSendTemplateBracketEmail, useBracketTemplates, useBracketTemplateUserCount, useEmailLogs, useAdminFeaturedProps, useVoidProp, useSettleProps, useAdminPendingCounts, useAdminLeagueSearch } from '../hooks/useAdmin'
import { useAuth } from '../hooks/useAuth'
import { useSearchUsers } from '../hooks/useInvitations'
import PropSyncPanel from '../components/admin/PropSyncPanel'
import BracketTemplateManager from '../components/admin/BracketTemplateManager'
import FuturesAdminPanel from '../components/admin/FuturesAdminPanel'
import ReportsPanel from '../components/admin/ReportsPanel'
import ModerationPanel from '../components/admin/ModerationPanel'
import PlayerPositionPanel from '../components/admin/PlayerPositionPanel'
import BackdropSubmissionsPanel from '../components/admin/BackdropSubmissionsPanel'
import PlayerBlurbsPanel from '../components/admin/PlayerBlurbsPanel'
import AdminToolsPanel from '../components/admin/AdminToolsPanel'
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
  const [scheduleMode, setScheduleMode] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [leagueSearch, setLeagueSearch] = useState('')
  const [showLeagueSearch, setShowLeagueSearch] = useState(false)

  const { data: userSearchResults } = useSearchUsers(userSearch)
  const { data: leagueSearchResults } = useAdminLeagueSearch(leagueSearch)
  const sportKey = sportTabs[activeSport].key
  const { data: games, isLoading: gamesLoading } = useGames(sportKey, 'upcoming', 7)
  const { data: featuredProps } = useAdminFeaturedProps()
  const voidProp = useVoidProp()
  const settleProps = useSettleProps()

  const syncOdds = useSyncOdds()
  const syncInjuries = useSyncInjuries()
  const scoreGames = useScoreGames()
  const recalculatePoints = useRecalculatePoints()
  const recalculateRecords = useRecalculateRecords()
  const syncNBASalaries = useSyncNBASalaries()
  const syncMLBSalaries = useSyncMLBSalaries()
  const sendEmailBlast = useSendEmailBlast()
  const sendTargetedEmail = useSendTargetedEmail()
  const sendTemplateBracketEmail = useSendTemplateBracketEmail()
  const { data: emailTemplates } = useBracketTemplates()
  const { data: templateUserCount } = useBracketTemplateUserCount(selectedTemplateId)
  const { data: emailLogs } = useEmailLogs()
  const { data: pendingCounts } = useAdminPendingCounts()

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

  async function handleSyncInjuries() {
    try {
      const data = await syncInjuries.mutateAsync()
      toast(data.message || 'Injury sync complete', 'success')
    } catch (err) {
      toast(err.message || 'Injury sync failed', 'error')
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
    const scheduled_at = scheduleMode && scheduledAt ? new Date(scheduledAt).toISOString() : undefined
    const scheduleLabel = scheduled_at ? `\n\nScheduled for: ${new Date(scheduledAt).toLocaleString()}` : ''

    if (emailMode === 'template') {
      const selectedTemplate = emailTemplates?.find((t) => t.id === selectedTemplateId)
      if (!selectedTemplateId || !selectedTemplate) return toast('Select a template', 'error')
      const userCount = templateUserCount?.count || 0
      if (!confirm(`${scheduled_at ? 'Schedule' : 'Send'} this email to all ${userCount} user(s) in leagues using "${selectedTemplate.name}"?\n\nSubject: ${emailSubject}${scheduleLabel}`)) return
      try {
        const result = await sendTemplateBracketEmail.mutateAsync({ subject: emailSubject, body: emailBody, templateId: selectedTemplateId, scheduled_at })
        toast(result.scheduled ? `Email scheduled for ${new Date(scheduledAt).toLocaleString()}` : `Email sent to ${result.sent} user(s)${result.failed ? ` (${result.failed} failed)` : ''}`, 'success')
        setEmailSubject('')
        setEmailBody('')
        setScheduleMode(false)
        setScheduledAt('')
      } catch (err) {
        toast(err.message || 'Template email failed', 'error')
      }
    } else if (emailMode === 'targeted') {
      const usernames = targetUsers.map((u) => u.username)
      if (!usernames.length) return toast('Select at least one user', 'error')
      if (!confirm(`${scheduled_at ? 'Schedule' : 'Send'} this email to ${usernames.length} user(s)?\n\n${usernames.join(', ')}\n\nSubject: ${emailSubject}${scheduleLabel}`)) return
      try {
        const result = await sendTargetedEmail.mutateAsync({ subject: emailSubject, body: emailBody, usernames, scheduled_at })
        if (result.scheduled) {
          toast(`Email scheduled for ${new Date(scheduledAt).toLocaleString()}`, 'success')
        } else {
          let msg = `Email sent to ${result.sent} user(s)`
          if (result.failed) msg += ` (${result.failed} failed)`
          if (result.notFound?.length) msg += `. Not found: ${result.notFound.join(', ')}`
          toast(msg, result.sent > 0 ? 'success' : 'error')
        }
        setEmailSubject('')
        setEmailBody('')
        setTargetUsers([])
        setScheduleMode(false)
        setScheduledAt('')
      } catch (err) {
        toast(err.message || 'Targeted email failed', 'error')
      }
    } else {
      if (!confirm(`${scheduled_at ? 'Schedule' : 'Send'} this email to ALL users?\n\nSubject: ${emailSubject}${scheduleLabel}`)) return
      try {
        const result = await sendEmailBlast.mutateAsync({ subject: emailSubject, body: emailBody, scheduled_at })
        toast(result.scheduled ? `Email scheduled for ${new Date(scheduledAt).toLocaleString()}` : `Email sent to ${result.sent} users${result.failed ? ` (${result.failed} failed)` : ''}`, 'success')
        setEmailSubject('')
        setEmailBody('')
        setScheduleMode(false)
        setScheduledAt('')
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

  // Build 7-day schedule: map each date to its featured props
  const scheduleDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
    const dayProps = (featuredProps || []).filter((p) => p.featured_date === dateStr)
    return { dateStr, label, props: dayProps }
  })

  // Build previous 7 days
  const previousDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (i + 1))
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const label = i === 0 ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
    const dayProps = (featuredProps || []).filter((p) => p.featured_date === dateStr)
    return { dateStr, label, props: dayProps }
  })
  const [showPrevious, setShowPrevious] = useState(false)
  const [propsView, setPropsView] = useState('set') // 'set' | 'settle'

  // Unsettled featured props sorted oldest first
  const unsettledProps = (featuredProps || [])
    .filter((p) => p.status === 'locked' || p.status === 'published')
    .sort((a, b) => new Date(a.featured_date) - new Date(b.featured_date))

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-4">Admin Panel</h1>

      {/* Top-level section tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide pt-2 -mt-2">
        {[
          { key: 'props', label: 'Props Manager' },
          { key: 'brackets', label: 'Brackets' },
          { key: 'futures', label: 'Futures' },
          { key: 'email', label: 'Email Blast' },
          { key: 'reports', label: 'Reports', badge: pendingCounts?.reports },
          { key: 'moderation', label: 'Moderation' },
          { key: 'backdrops', label: 'Backdrops', badge: pendingCounts?.backdrops },
          { key: 'positions', label: 'Positions' },
          { key: 'playerblurbs', label: 'Player Blurbs' },
          { key: 'tools', label: 'Tools' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setAdminSection(tab.key)}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors relative ${
              adminSection === tab.key
                ? 'bg-accent text-white'
                : 'bg-bg-primary/50 backdrop-blur-sm border border-text-primary/20 text-text-primary hover:bg-bg-primary/70'
            }`}
          >
            {tab.label}
            {tab.badge > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
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
                        className="inline-flex items-center gap-1.5 bg-bg-primary/30 backdrop-blur-sm border border-text-primary/15 text-text-primary text-xs font-medium pl-1 pr-2 py-1 rounded-full"
                      >
                        <Avatar user={user} size="xs" />
                        {user.display_name || user.username}
                        <button
                          type="button"
                          onClick={() => setTargetUsers((prev) => prev.filter((u) => u.id !== user.id))}
                          className="ml-0.5 text-text-muted hover:text-white transition-colors leading-none text-sm"
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
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-text-muted uppercase tracking-wider">Body (HTML supported)</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setShowLeagueSearch(!showLeagueSearch); setLeagueSearch('') }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border border-text-primary/20 text-text-secondary hover:text-accent hover:border-accent"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    Insert League Link
                  </button>
                  {showLeagueSearch && (
                    <div className="absolute right-0 top-full mt-1 w-72 bg-bg-card border border-border rounded-xl shadow-lg z-20 p-2">
                      <input
                        type="text"
                        value={leagueSearch}
                        onChange={(e) => setLeagueSearch(e.target.value)}
                        placeholder="Search leagues by name..."
                        autoFocus
                        className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent mb-1"
                      />
                      {leagueSearch.length >= 2 && leagueSearchResults?.length > 0 && (
                        <div className="max-h-48 overflow-y-auto space-y-0.5">
                          {leagueSearchResults.map((league) => (
                            <button
                              key={league.id}
                              type="button"
                              onClick={() => {
                                const link = `<a href="https://iknowball.club/leagues/${league.id}" style="display:inline-block;background:#f97316;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Join ${league.name}</a>`
                                setEmailBody((prev) => prev ? `${prev}\n\n${link}` : link)
                                setShowLeagueSearch(false)
                                setLeagueSearch('')
                                toast.success(`Link to "${league.name}" inserted`)
                              }}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-bg-card-hover transition-colors"
                            >
                              <div className="text-sm font-medium text-text-primary">{league.name}</div>
                              <div className="text-xs text-text-muted">{league.sport} &middot; {league.format} &middot; {league.status}</div>
                            </button>
                          ))}
                        </div>
                      )}
                      {leagueSearch.length >= 2 && leagueSearchResults?.length === 0 && (
                        <div className="text-sm text-text-muted px-3 py-2">No leagues found</div>
                      )}
                      {leagueSearch.length < 2 && (
                        <div className="text-xs text-text-muted px-3 py-1.5">Type at least 2 characters...</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Write your email here... HTML tags like <b>, <a>, <p> are supported."
                rows={10}
                className="w-full bg-bg-primary border border-border rounded-lg px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-y"
              />
            </div>
            {/* Schedule toggle */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setScheduleMode(!scheduleMode)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                  scheduleMode ? 'bg-bg-primary/50 border-accent text-accent' : 'bg-bg-primary/50 border-text-primary/20 text-text-secondary'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Schedule Send
              </button>
              {scheduleMode && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="bg-bg-primary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
                />
              )}
            </div>
            <button
              onClick={handleSendEmail}
              disabled={
                (sendEmailBlast.isPending || sendTargetedEmail.isPending || sendTemplateBracketEmail.isPending)
                || !emailSubject.trim() || !emailBody.trim()
                || (emailMode === 'targeted' && !targetUsers.length)
                || (emailMode === 'template' && !selectedTemplateId)
                || (scheduleMode && !scheduledAt)
              }
              className="bg-accent hover:bg-accent/90 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {(sendEmailBlast.isPending || sendTargetedEmail.isPending || sendTemplateBracketEmail.isPending)
                ? 'Sending...'
                : scheduleMode
                  ? 'Schedule Email'
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
                    <div className="flex gap-1.5 shrink-0">
                      {log.email_status === 'scheduled' && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400">
                          Scheduled {log.scheduled_at ? new Date(log.scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        log.type === 'blast' ? 'bg-accent/10 text-accent'
                          : log.type === 'template_blast' ? 'bg-purple-500/10 text-purple-400'
                          : 'bg-blue-500/10 text-blue-400'
                      }`}>
                        {log.type === 'blast' ? 'All Users' : log.type === 'template_blast' ? 'Template' : 'Targeted'}
                      </span>
                    </div>
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

      {adminSection === 'backdrops' && <BackdropSubmissionsPanel />}

      {adminSection === 'positions' && <PlayerPositionPanel />}

      {adminSection === 'playerblurbs' && <PlayerBlurbsPanel />}

      {adminSection === 'tools' && <AdminToolsPanel />}

      {adminSection === 'props' && <>
      {/* Set / Settle toggle */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'set', label: 'Set' },
          { key: 'settle', label: `Settle${unsettledProps.length ? ` (${unsettledProps.length})` : ''}` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setPropsView(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${
              propsView === tab.key
                ? 'bg-bg-primary/50 border-accent text-accent'
                : 'bg-bg-primary/50 border-text-primary/20 text-text-secondary hover:border-text-primary/40'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Settle view — all unsettled featured props, oldest first */}
      {propsView === 'settle' && (
        <div className="bg-bg-primary rounded-xl border border-text-primary/20 p-4 mb-6">
          <h2 className="font-semibold text-sm mb-3">Unsettled Props</h2>
          {!unsettledProps.length ? (
            <p className="text-sm text-text-muted">All featured props are settled.</p>
          ) : (
            <div className="space-y-3">
              {unsettledProps.map((prop) => (
                <div key={prop.id} className="rounded-xl bg-bg-secondary/50 border border-border p-4">
                  <div className="text-base font-semibold text-text-primary mb-1">
                    {prop.player_name}
                  </div>
                  <div className="text-sm text-accent font-medium mb-2">
                    {prop.market_label} — {prop.line}
                  </div>
                  <div className="text-xs text-text-muted mb-3">
                    {prop.games?.away_team} @ {prop.games?.home_team} · {new Date(prop.featured_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {['over', 'under', 'push', 'void'].map((action) => (
                      <button
                        key={action}
                        onClick={() => action === 'void' ? handleVoid(prop.id) : handleSettle(prop.id, action)}
                        disabled={settleProps.isPending || voidProp.isPending}
                        className={`py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                          action === 'over'
                            ? 'bg-correct/20 text-correct hover:bg-correct/30 border border-correct/30'
                            : action === 'under'
                              ? 'bg-incorrect/20 text-incorrect hover:bg-incorrect/30 border border-incorrect/30'
                              : action === 'push'
                                ? 'bg-text-muted/20 text-text-muted hover:bg-text-muted/30 border border-text-muted/30'
                                : 'bg-bg-primary text-text-muted hover:text-incorrect border border-text-primary/20'
                        }`}
                      >
                        {action.charAt(0).toUpperCase() + action.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {propsView === 'set' && <>
      {/* Featured Schedule — 7-day overview */}
      <div className="bg-bg-primary rounded-xl border border-text-primary/20 p-4 mb-6">
        <h2 className="font-semibold text-sm mb-3">Featured Schedule</h2>
        <div className="space-y-1">
          {scheduleDays.map(({ dateStr, label, props: dayProps }) => (
            <div key={dateStr} className={`p-2.5 rounded-lg ${
              dayProps.length ? 'bg-accent/5 border border-accent/20' : 'bg-bg-secondary/50'
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-20 shrink-0 text-xs font-semibold text-text-secondary">{label}</div>
                {!dayProps.length && <span className="text-xs text-text-muted">—</span>}
              </div>
              {dayProps.map((prop) => {
                const nameParts = prop.player_name?.split(' ') || []
                const shortName = nameParts.length >= 2
                  ? `${nameParts[0][0]}. ${nameParts.slice(1).join(' ')}`
                  : prop.player_name
                return (
                <div key={prop.id} className="flex items-center gap-2 py-1.5 first:pt-0 ml-0 sm:ml-20 border-t border-white/10 first:border-t-0">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {shortName} — {prop.market_label} ({prop.line})
                    </span>
                    <span className="text-xs text-text-muted ml-2">
                      {prop.games?.away_team} @ {prop.games?.home_team}
                    </span>
                  </div>
                  {prop.outcome && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      prop.outcome === 'over' ? 'bg-correct/20 text-correct'
                        : prop.outcome === 'under' ? 'bg-incorrect/20 text-incorrect'
                        : 'bg-text-muted/20 text-text-muted'
                    }`}>
                      {prop.outcome.toUpperCase()}
                    </span>
                  )}
                  {prop.status === 'voided' && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-text-muted/20 text-text-muted">VOIDED</span>
                  )}
                  {(prop.status === 'published' || prop.status === 'locked') && !prop.outcome && (
                    <span className="text-xs text-text-muted">Pending</span>
                  )}
                </div>
                )
              })}
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowPrevious(!showPrevious)}
          className="text-xs text-accent hover:text-accent-hover mt-2"
        >
          {showPrevious ? 'Hide previous props' : 'See previous props'}
        </button>
        {showPrevious && (
          <div className="space-y-1 mt-2">
            {previousDays.map(({ dateStr, label, props: dayProps }) => (
              <div key={dateStr} className={`p-2.5 rounded-lg ${
                dayProps.length ? 'bg-bg-secondary/50 border border-border' : 'bg-bg-secondary/30'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="w-20 shrink-0 text-xs font-semibold text-text-secondary">{label}</div>
                  {!dayProps.length && <span className="text-xs text-text-muted">—</span>}
                </div>
                {dayProps.map((prop) => {
                  const nameParts = prop.player_name?.split(' ') || []
                  const shortName = nameParts.length >= 2
                    ? `${nameParts[0][0]}. ${nameParts.slice(1).join(' ')}`
                    : prop.player_name
                  return (
                    <div key={prop.id} className="flex items-center gap-2 py-1.5 first:pt-0 ml-0 sm:ml-20 border-t border-white/10 first:border-t-0">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate">
                          {shortName} — {prop.market_label} ({prop.line})
                        </span>
                        <span className="text-xs text-text-muted ml-2">
                          {prop.games?.away_team} @ {prop.games?.home_team}
                        </span>
                      </div>
                      {prop.outcome && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          prop.outcome === 'over' ? 'bg-correct/20 text-correct'
                            : prop.outcome === 'under' ? 'bg-incorrect/20 text-incorrect'
                            : 'bg-text-muted/20 text-text-muted'
                        }`}>
                          {prop.outcome.toUpperCase()}
                        </span>
                      )}
                      {(prop.status === 'published' || prop.status === 'locked') && !prop.outcome && (
                        <span className="text-xs text-text-muted">Pending</span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
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
      <div className="bg-bg-primary rounded-xl border border-text-primary/20 p-4 mt-8">
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
            onClick={handleSyncInjuries}
            disabled={syncInjuries.isPending}
            className="shrink-0 bg-bg-card-hover hover:bg-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {syncInjuries.isPending ? 'Syncing...' : 'Sync Injuries'}
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
          <button
            onClick={async () => {
              const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
              try {
                await syncNBASalaries.mutateAsync(today)
                toast('NBA salary generation started — runs in background', 'success')
              } catch (err) { toast(err.message || 'Failed', 'error') }
            }}
            disabled={syncNBASalaries.isPending}
            className="shrink-0 bg-bg-card-hover hover:bg-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {syncNBASalaries.isPending ? 'Syncing...' : 'Sync NBA Salaries'}
          </button>
          <button
            onClick={async () => {
              const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
              try {
                await syncMLBSalaries.mutateAsync(today)
                toast('MLB salary generation started — runs in background', 'success')
              } catch (err) { toast(err.message || 'Failed', 'error') }
            }}
            disabled={syncMLBSalaries.isPending}
            className="shrink-0 bg-bg-card-hover hover:bg-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {syncMLBSalaries.isPending ? 'Syncing...' : 'Sync MLB Salaries'}
          </button>
        </div>
      </div>
      </>}
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
          : 'bg-bg-primary border-text-primary/20 hover:bg-bg-card-hover'
      }`}
    >
      <div className="text-sm font-medium truncate">
        {game.away_team} @ {game.home_team}
      </div>
      <div className="text-xs text-text-muted mt-0.5">{time}</div>
    </button>
  )
}
