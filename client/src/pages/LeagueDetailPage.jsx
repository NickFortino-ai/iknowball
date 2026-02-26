import { useState, useRef, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useLeague, useLeagueStandings, useUpdateLeague, useDeleteLeague } from '../hooks/useLeagues'
import { useAuth } from '../hooks/useAuth'
import MembersList from '../components/leagues/MembersList'
import InvitePlayerModal from '../components/leagues/InvitePlayerModal'
import PickemView from '../components/leagues/PickemView'
import SurvivorView from '../components/leagues/SurvivorView'
import SquaresView from '../components/leagues/SquaresView'
import BracketView from '../components/leagues/BracketView'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { toast } from '../components/ui/Toast'

function getLeagueTabs(league) {
  if (league.format === 'pickem' && league.use_league_picks) {
    return ['Picks', 'Standings', 'Members']
  }
  const TABS = {
    pickem: ['Standings', 'Members'],
    survivor: ['Board', 'Members'],
    squares: ['Board', 'Members'],
    bracket: ['Bracket', 'Members'],
  }
  return TABS[league.format] || ['Members']
}

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  squares: 'Squares',
  bracket: 'Bracket',
}

const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  americanfootball_ncaaf: 'NCAAF',
  basketball_wnba: 'WNBA',
  all: 'All Sports',
}

const DAILY_ELIGIBLE_SPORTS = new Set(['basketball_nba', 'basketball_ncaab', 'basketball_wnba', 'baseball_mlb', 'all'])

function toDateInputValue(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function LeagueSettingsEditor({ league, updateLeague }) {
  const settings = league.settings || {}
  const isDaily = league.settings?.pick_frequency === 'daily'

  async function save(newSettings) {
    try {
      await updateLeague.mutateAsync({
        leagueId: league.id,
        settings: { ...settings, ...newSettings },
      })
      toast('Settings saved', 'success')
    } catch (err) {
      toast(err.message || 'Failed to save settings', 'error')
    }
  }

  async function saveDate(field, value) {
    if (!value) return
    try {
      await updateLeague.mutateAsync({
        leagueId: league.id,
        [field]: new Date(value + 'T00:00:00').toISOString(),
      })
      toast('Date saved', 'success')
    } catch (err) {
      toast(err.message || 'Failed to save date', 'error')
    }
  }

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4 mb-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm text-text-secondary">League Settings</h3>
        <span className="text-[10px] text-text-muted">Editable until first game starts</span>
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-muted mb-1">Start Date</label>
          <input
            type="date"
            defaultValue={toDateInputValue(league.starts_at)}
            onBlur={(e) => saveDate('starts_at', e.target.value)}
            className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">End Date</label>
          <input
            type="date"
            defaultValue={toDateInputValue(league.ends_at)}
            onBlur={(e) => saveDate('ends_at', e.target.value)}
            className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {league.format === 'pickem' && (
        <>
          {DAILY_ELIGIBLE_SPORTS.has(league.sport) && (
            <div>
              <label className="block text-xs text-text-muted mb-2">Pick Frequency</label>
              <div className="flex gap-2">
                {[
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'daily', label: 'Daily' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => save({ pick_frequency: opt.value })}
                    disabled={updateLeague.isPending}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      (settings.pick_frequency || 'weekly') === opt.value ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs text-text-muted mb-1">
              Games per {isDaily ? 'day' : 'week'} <span className="text-text-muted">(empty = all)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                defaultValue={settings.games_per_week || ''}
                placeholder="All games"
                min={1}
                className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                onBlur={(e) => {
                  const val = e.target.value ? parseInt(e.target.value, 10) : null
                  if (val !== (settings.games_per_week || null)) {
                    save({ games_per_week: val })
                  }
                }}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-2">Lock Odds</label>
            <div className="flex gap-2">
              {[
                { value: 'game_start', label: 'At Game Start' },
                { value: 'submission', label: 'At Submission' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => save({ lock_odds_at: opt.value })}
                  disabled={updateLeague.isPending}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    (settings.lock_odds_at || 'game_start') === opt.value ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {league.format === 'survivor' && (
        <>
          <div>
            <label className="block text-xs text-text-muted mb-2">Lives</label>
            <div className="flex gap-2">
              {[1, 2].map((n) => (
                <button
                  key={n}
                  onClick={() => save({ lives: n })}
                  disabled={updateLeague.isPending}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    (settings.lives || 1) === n ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'
                  }`}
                >
                  {n} {n === 1 ? 'Life' : 'Lives'}
                </button>
              ))}
            </div>
          </div>
          {DAILY_ELIGIBLE_SPORTS.has(league.sport) && (
            <div>
              <label className="block text-xs text-text-muted mb-2">Pick Frequency</label>
              <div className="flex gap-2">
                {[
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'daily', label: 'Daily' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => save({ pick_frequency: opt.value })}
                    disabled={updateLeague.isPending}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      (settings.pick_frequency || 'weekly') === opt.value ? 'bg-accent text-white' : 'bg-bg-primary text-text-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-muted">
              If all eliminated in same {isDaily ? 'day' : 'week'}, all survive
            </label>
            <button
              onClick={() => save({ all_eliminated_survive: !settings.all_eliminated_survive })}
              disabled={updateLeague.isPending}
              className={`w-10 h-6 rounded-full transition-colors ${
                settings.all_eliminated_survive ? 'bg-accent' : 'bg-bg-primary'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${
                settings.all_eliminated_survive ? 'translate-x-4' : ''
              }`} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function LeagueDetailPage() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { data: league, isLoading } = useLeague(id)
  const { data: standings } = useLeagueStandings(id)
  const [activeTab, setActiveTab] = useState(0)
  const [showInviteModal, setShowInviteModal] = useState(searchParams.get('invite') === '1')
  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const noteRef = useRef(null)
  const updateLeague = useUpdateLeague()
  const deleteLeague = useDeleteLeague()

  useEffect(() => {
    if (editingNote && noteRef.current) {
      noteRef.current.focus()
    }
  }, [editingNote])

  if (isLoading) return <div className="max-w-2xl mx-auto px-4 py-6"><LoadingSpinner /></div>
  if (!league) return null

  const tabs = getLeagueTabs(league)
  const isCommissioner = league.commissioner_id === profile?.id

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <Link to="/leagues" className="text-xs text-text-muted hover:text-text-secondary transition-colors">
          &larr; My Leagues
        </Link>
        <h1 className="font-display text-3xl mt-2">{league.name}</h1>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-accent/20 text-accent">
            {FORMAT_LABELS[league.format]}
          </span>
          <span className="text-xs text-text-muted">{SPORT_LABELS[league.sport]}</span>
          <span className="text-xs text-text-muted">{league.members?.length || 0} members</span>
          {isCommissioner && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-tier-hof/20 text-tier-hof">
              Commissioner
            </span>
          )}
        </div>
      </div>

      {/* Invite Code & Invite Player */}
      <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs text-text-muted">Invite Code</div>
            <div className="font-display text-xl tracking-widest">{league.invite_code}</div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {isCommissioner && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
              >
                Invite Player
              </button>
            )}
            <button
              onClick={async () => {
                const url = `${window.location.origin}/join/${league.invite_code}`
                if (navigator.share) {
                  try {
                    await navigator.share({ title: `Join ${league.name}`, url })
                  } catch {
                    // user cancelled share sheet
                  }
                } else {
                  await navigator.clipboard.writeText(url)
                  toast('Invite link copied!', 'success')
                }
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-bg-card-hover text-text-secondary hover:text-text-primary transition-colors"
            >
              Share
            </button>
          </div>
        </div>
      </div>

      {showInviteModal && (
        <InvitePlayerModal leagueId={league.id} inviteCode={league.invite_code} leagueName={league.name} onClose={() => {
          setShowInviteModal(false)
          if (searchParams.has('invite')) {
            searchParams.delete('invite')
            setSearchParams(searchParams, { replace: true })
          }
        }} />
      )}

      {/* Commissioner's Note */}
      {editingNote ? (
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
          <div className="text-xs font-semibold text-text-muted mb-2">Commissioner's Note</div>
          <textarea
            ref={noteRef}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            maxLength={1000}
            rows={4}
            className="w-full bg-bg-surface border border-border rounded-lg p-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="Write a note for your league members..."
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-text-muted">{noteText.length}/1000</span>
            <div className="flex gap-2">
              <button
                onClick={() => setEditingNote(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await updateLeague.mutateAsync({
                      leagueId: league.id,
                      commissioner_note: noteText || null,
                    })
                    setEditingNote(false)
                    toast('Note saved', 'success')
                  } catch {
                    toast('Failed to save note', 'error')
                  }
                }}
                disabled={updateLeague.isPending}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {updateLeague.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : league.commissioner_note ? (
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-text-muted">Commissioner's Note</span>
            {isCommissioner && (
              <button
                onClick={() => { setNoteText(league.commissioner_note); setEditingNote(true) }}
                className="text-xs text-accent hover:text-accent-hover transition-colors"
              >
                Edit
              </button>
            )}
          </div>
          <p className="text-sm text-text-secondary whitespace-pre-wrap">{league.commissioner_note}</p>
        </div>
      ) : isCommissioner ? (
        <div className="mb-6">
          <button
            onClick={() => { setNoteText(''); setEditingNote(true) }}
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            + Add a note for your league members
          </button>
        </div>
      ) : null}

      {/* Settings (commissioner only, before first game starts) */}
      {isCommissioner && league.settings_editable && (
        <LeagueSettingsEditor league={league} updateLeague={updateLeague} />
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === i
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tabs[activeTab] === 'Members' && (
        <MembersList
          members={league.members}
          commissionerId={league.commissioner_id}
          leagueId={league.id}
          isCommissioner={isCommissioner}
        />
      )}

      {tabs[activeTab] === 'Picks' && league.format === 'pickem' && league.use_league_picks && (
        <PickemView league={league} standings={standings} mode="picks" />
      )}

      {tabs[activeTab] === 'Standings' && league.format === 'pickem' && (
        <PickemView league={league} standings={standings} mode="standings" />
      )}

      {tabs[activeTab] === 'Board' && league.format === 'survivor' && (
        <SurvivorView league={league} />
      )}

      {tabs[activeTab] === 'Board' && league.format === 'squares' && (
        <SquaresView league={league} isCommissioner={isCommissioner} />
      )}

      {tabs[activeTab] === 'Bracket' && league.format === 'bracket' && (
        <BracketView league={league} />
      )}

      {/* Delete League */}
      {isCommissioner && (
        <div className="mt-12 pt-6 border-t border-border">
          <button
            onClick={async () => {
              if (!window.confirm('Are you sure? All data will be erased.')) return
              try {
                await deleteLeague.mutateAsync(league.id)
                toast('League deleted', 'success')
                navigate('/leagues')
              } catch (err) {
                toast(err.message || 'Failed to delete league', 'error')
              }
            }}
            disabled={deleteLeague.isPending}
            className="text-xs text-text-muted hover:text-incorrect transition-colors disabled:opacity-50"
          >
            {deleteLeague.isPending ? 'Deleting...' : 'Delete League'}
          </button>
        </div>
      )}
    </div>
  )
}
