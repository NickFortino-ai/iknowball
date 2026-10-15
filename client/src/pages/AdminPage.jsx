import { useState } from 'react'
import { useGames } from '../hooks/useGames'
import { useSyncOdds, useSyncInjuries, useScoreGames, useRecalculatePoints, useRecalculateRecords, useSyncNflPlayers, useSyncNBASalaries, useSyncMLBSalaries, useSyncWNBASalaries, useSyncNFLSalaries, useEnrichEspnIds, useSyncWeeklyProjections, useSendEmailBlast, useSendTargetedEmail, useSendTemplateBracketEmail, useBracketTemplates, useBracketTemplateUserCount, useEmailLogs, useAdminPendingCounts, useAdminLeagueSearch } from '../hooks/useAdmin'
import { useAuth } from '../hooks/useAuth'
import { useSearchUsers } from '../hooks/useInvitations'
import BracketTemplateManager from '../components/admin/BracketTemplateManager'
import FuturesAdminPanel from '../components/admin/FuturesAdminPanel'
import ReportsPanel from '../components/admin/ReportsPanel'
import SupportPanel from '../components/admin/SupportPanel'
import ModerationPanel from '../components/admin/ModerationPanel'
import PlayerPositionPanel from '../components/admin/PlayerPositionPanel'
import BackdropSubmissionsPanel from '../components/admin/BackdropSubmissionsPanel'
import NFLSalariesEditor from '../components/admin/NFLSalariesEditor'
import WnbaSalariesEditor from '../components/admin/WnbaSalariesEditor'
import NbaSalariesEditor from '../components/admin/NbaSalariesEditor'
import MlbSalariesEditor from '../components/admin/MlbSalariesEditor'
import PlayerBlurbsPanel from '../components/admin/PlayerBlurbsPanel'
import TriviaPanel from '../components/admin/TriviaPanel'
import WritersPanel from '../components/admin/WritersPanel'
import AdminToolsPanel from '../components/admin/AdminToolsPanel'
import DashboardPanel from '../components/admin/DashboardPanel'
import RichEmailEditor from '../components/admin/RichEmailEditor'
import SeasonDatesPanel from '../components/admin/SeasonDatesPanel'
import UserSurveysPanel from '../components/admin/UserSurveysPanel'
import AppConfigPanel from '../components/admin/AppConfigPanel'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { toast } from '../components/ui/Toast'
import Avatar from '../components/ui/Avatar'
import { todaySportsDay } from '../lib/sportsDay'

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
  // Helper admins see everything except the dashboard (revenue/growth/promo
  // codes). Default their landing tab to props so they don't land on a
  // blocked section.
  const isHelperAdmin = profile?.admin_role === 'helper'
  // Helper admins used to land on 'props' — that was the job before props
  // went self-serve. The section is gone, so they start on Trivia, which is
  // the review queue a helper is actually needed for now.
  const [adminSection, setAdminSection] = useState(isHelperAdmin ? 'trivia' : 'dashboard')
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

  const syncOdds = useSyncOdds()
  const syncInjuries = useSyncInjuries()
  const scoreGames = useScoreGames()
  const recalculatePoints = useRecalculatePoints()
  const recalculateRecords = useRecalculateRecords()
  const syncNflPlayers = useSyncNflPlayers()
  const syncNBASalaries = useSyncNBASalaries()
  const syncMLBSalaries = useSyncMLBSalaries()
  const syncWNBASalaries = useSyncWNBASalaries()
  const syncNFLSalaries = useSyncNFLSalaries()
  const enrichEspnIds = useEnrichEspnIds()
  const syncWeeklyProjections = useSyncWeeklyProjections()
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

  const upcomingGames = games || []

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-4">Admin Panel</h1>

      {/* Top-level section tabs */}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-6">
        {[
          { key: 'dashboard', label: 'Dashboard', badge: pendingCounts?.stuckLeagues },
          { key: 'brackets', label: 'Brackets' },
          { key: 'futures', label: 'Futures' },
          { key: 'email', label: 'Email' },
          { key: 'reports', label: 'Reports', badge: pendingCounts?.reports },
          { key: 'support', label: 'Support', badge: pendingCounts?.support },
          { key: 'moderation', label: 'Moderation' },
          { key: 'backdrops', label: 'Backdrops', badge: pendingCounts?.backdrops },
          { key: 'positions', label: 'Positions' },
          { key: 'playerblurbs', label: 'Blurbs' },
          { key: 'trivia', label: 'Trivia' },
          { key: 'writers', label: 'Writers' },
          { key: 'seasons', label: 'Seasons' },
          { key: 'tools', label: 'Tools' },
          { key: 'overrides', label: 'Sync & Recompute' },
          { key: 'nflSalaries', label: 'NFL Salaries' },
          { key: 'nbaSalaries', label: 'NBA Salaries' },
          { key: 'mlbSalaries', label: 'MLB Salaries' },
          { key: 'wnbaSalaries', label: 'WNBA Salaries' },
          { key: 'surveys', label: 'Surveys' },
          { key: 'config', label: 'Config' },
        ].filter((tab) => !(isHelperAdmin && (tab.key === 'dashboard' || tab.key === 'email' || tab.key === 'writers'))).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setAdminSection(tab.key)}
            className={`relative px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-center ${
              adminSection === tab.key
                ? 'bg-accent text-white border border-accent shadow-lg shadow-accent/20'
                : 'bg-bg-primary/60 backdrop-blur-sm border border-text-primary/20 text-text-primary hover:bg-bg-primary/80 hover:border-text-primary/40 hover:scale-[1.03]'
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
                                // /join/{invite_code} lets non-members join
                                // and takes members straight to the league.
                                // /leagues/{id} was blank for non-members.
                                const url = league.invite_code
                                  ? `https://iknowball.club/join/${league.invite_code}`
                                  : `https://iknowball.club/leagues/${league.id}`
                                const link = `<a href="${url}" style="display:inline-block;background:#f97316;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Join ${league.name}</a>`
                                setEmailBody((prev) => prev ? `${prev}<p>${link}</p>` : `<p>${link}</p>`)
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
              <div className="bg-bg-primary border border-border rounded-lg px-3 py-2 focus-within:border-accent">
                <RichEmailEditor
                  value={emailBody}
                  onChange={setEmailBody}
                  placeholder="Write your email here… Paste from Google Docs or Notion — formatting is preserved."
                />
              </div>
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
      {adminSection === 'support' && <SupportPanel />}

      {adminSection === 'moderation' && <ModerationPanel />}

      {adminSection === 'backdrops' && <BackdropSubmissionsPanel />}

      {adminSection === 'positions' && <PlayerPositionPanel />}

      {adminSection === 'playerblurbs' && <PlayerBlurbsPanel />}
      {adminSection === 'trivia' && <TriviaPanel />}
      {adminSection === 'writers' && <WritersPanel />}

      {adminSection === 'seasons' && <SeasonDatesPanel />}

      {adminSection === 'surveys' && <UserSurveysPanel />}
      {adminSection === 'config' && <AppConfigPanel />}

      {adminSection === 'nflSalaries' && <NFLSalariesEditor />}
      {adminSection === 'nbaSalaries' && <NbaSalariesEditor />}
      {adminSection === 'mlbSalaries' && <MlbSalariesEditor />}
      {adminSection === 'wnbaSalaries' && <WnbaSalariesEditor />}

      {adminSection === 'tools' && <AdminToolsPanel />}

      {adminSection === 'dashboard' && <DashboardPanel />}


      {adminSection === 'overrides' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={handleSyncOdds}
            disabled={syncOdds.isPending}
            className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm p-4 text-sm font-semibold text-text-primary hover:bg-bg-primary/80 transition-colors disabled:opacity-50 text-center"
          >
            {syncOdds.isPending ? 'Syncing...' : 'Sync Odds'}
          </button>
          <button
            onClick={handleSyncInjuries}
            disabled={syncInjuries.isPending}
            className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm p-4 text-sm font-semibold text-text-primary hover:bg-bg-primary/80 transition-colors disabled:opacity-50 text-center"
          >
            {syncInjuries.isPending ? 'Syncing...' : 'Sync Injuries'}
          </button>
          <button
            onClick={handleScoreGames}
            disabled={scoreGames.isPending}
            className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm p-4 text-sm font-semibold text-text-primary hover:bg-bg-primary/80 transition-colors disabled:opacity-50 text-center"
          >
            {scoreGames.isPending ? 'Scoring...' : 'Score Games'}
          </button>
          <button
            onClick={handleRecalculatePoints}
            disabled={recalculatePoints.isPending}
            className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm p-4 text-sm font-semibold text-text-primary hover:bg-bg-primary/80 transition-colors disabled:opacity-50 text-center"
          >
            {recalculatePoints.isPending ? 'Recalculating...' : 'Recalculate Points'}
          </button>
          <button
            onClick={handleRecalculateRecords}
            disabled={recalculateRecords.isPending}
            className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm p-4 text-sm font-semibold text-text-primary hover:bg-bg-primary/80 transition-colors disabled:opacity-50 text-center"
          >
            {recalculateRecords.isPending ? 'Recalculating...' : 'Recalculate Records'}
          </button>
          <button
            onClick={async () => {
              try {
                const result = await syncNflPlayers.mutateAsync()
                toast(`NFL players synced — ${result.upserted || 0} updated`, 'success')
              } catch (err) { toast(err.message || 'Failed', 'error') }
            }}
            disabled={syncNflPlayers.isPending}
            className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm p-4 text-sm font-semibold text-text-primary hover:bg-bg-primary/80 transition-colors disabled:opacity-50 text-center"
          >
            {syncNflPlayers.isPending ? 'Syncing...' : 'Sync NFL Players'}
          </button>
          <button
            onClick={async () => {
              try {
                await enrichEspnIds.mutateAsync()
                toast('ESPN ID enrichment started — runs in background (~30-60s)', 'success')
              } catch (err) { toast(err.message || 'Failed', 'error') }
            }}
            disabled={enrichEspnIds.isPending}
            className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm p-4 text-sm font-semibold text-text-primary hover:bg-bg-primary/80 transition-colors disabled:opacity-50 text-center"
          >
            {enrichEspnIds.isPending ? 'Enriching...' : 'Enrich NFL ESPN IDs'}
          </button>
          <button
            onClick={async () => {
              const weekStr = window.prompt('NFL week? (1-18)', '1')
              if (!weekStr) return
              const week = parseInt(weekStr, 10)
              if (!Number.isInteger(week) || week < 1 || week > 22) {
                toast('Invalid week — must be 1-18 (or up to 22 for playoffs)', 'error')
                return
              }
              const seasonStr = window.prompt('NFL season? (e.g. 2025 or 2026)', '2026')
              if (!seasonStr) return
              const season = parseInt(seasonStr, 10)
              if (!Number.isInteger(season) || season < 2020 || season > 2030) {
                toast('Invalid season', 'error')
                return
              }
              try {
                const r = await syncWeeklyProjections.mutateAsync({ week, season })
                toast(`Projections synced — week ${week}/${season}, ${r.updated || 0} rows`, 'success')
              } catch (err) { toast(err.message || 'Failed', 'error') }
            }}
            disabled={syncWeeklyProjections.isPending}
            className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm p-4 text-sm font-semibold text-text-primary hover:bg-bg-primary/80 transition-colors disabled:opacity-50 text-center"
          >
            {syncWeeklyProjections.isPending ? 'Syncing...' : 'Sync NFL Projections'}
          </button>
          <button
            onClick={async () => {
              const today = todaySportsDay()
              try {
                await syncNBASalaries.mutateAsync(today)
                toast('NBA salary generation started — runs in background', 'success')
              } catch (err) { toast(err.message || 'Failed', 'error') }
            }}
            disabled={syncNBASalaries.isPending}
            className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm p-4 text-sm font-semibold text-text-primary hover:bg-bg-primary/80 transition-colors disabled:opacity-50 text-center"
          >
            {syncNBASalaries.isPending ? 'Syncing...' : 'Sync NBA Salaries'}
          </button>
          <button
            onClick={async () => {
              const today = todaySportsDay()
              try {
                await syncMLBSalaries.mutateAsync(today)
                toast('MLB salary generation started — runs in background', 'success')
              } catch (err) { toast(err.message || 'Failed', 'error') }
            }}
            disabled={syncMLBSalaries.isPending}
            className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm p-4 text-sm font-semibold text-text-primary hover:bg-bg-primary/80 transition-colors disabled:opacity-50 text-center"
          >
            {syncMLBSalaries.isPending ? 'Syncing...' : 'Sync MLB Salaries'}
          </button>
          <button
            onClick={async () => {
              const today = todaySportsDay()
              const dateStr = window.prompt('WNBA salary date (YYYY-MM-DD)?', today)
              if (!dateStr) return
              try {
                await syncWNBASalaries.mutateAsync(dateStr)
                toast('WNBA salary generation started — runs in background', 'success')
              } catch (err) { toast(err.message || 'Failed', 'error') }
            }}
            disabled={syncWNBASalaries.isPending}
            className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm p-4 text-sm font-semibold text-text-primary hover:bg-bg-primary/80 transition-colors disabled:opacity-50 text-center"
          >
            {syncWNBASalaries.isPending ? 'Syncing...' : 'Sync WNBA Salaries'}
          </button>
          <button
            onClick={async () => {
              const weekStr = window.prompt('NFL week? (1-18)', '1')
              if (!weekStr) return
              const week = parseInt(weekStr, 10)
              if (!Number.isInteger(week) || week < 1 || week > 22) {
                toast('Invalid week — must be 1-18 (or up to 22 for playoffs)', 'error')
                return
              }
              const seasonStr = window.prompt('NFL season? (e.g. 2025 or 2026)', '2026')
              if (!seasonStr) return
              const season = parseInt(seasonStr, 10)
              if (!Number.isInteger(season) || season < 2020 || season > 2030) {
                toast('Invalid season', 'error')
                return
              }
              try {
                await syncNFLSalaries.mutateAsync({ week, season })
                toast(`NFL salary generation started for week ${week}, ${season} — runs in background`, 'success')
              } catch (err) { toast(err.message || 'Failed', 'error') }
            }}
            disabled={syncNFLSalaries.isPending}
            className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm p-4 text-sm font-semibold text-text-primary hover:bg-bg-primary/80 transition-colors disabled:opacity-50 text-center"
          >
            {syncNFLSalaries.isPending ? 'Syncing...' : 'Sync NFL Salaries'}
          </button>
        </div>
      )}
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
