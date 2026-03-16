import { useState, useMemo } from 'react'
import {
  useBracketTournament,
  useBracketEntry,
  useBracketEntries,
  useViewBracketEntry,
} from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import BracketDisplay from './BracketDisplay'
import BracketPicker from './BracketPicker'
import BracketStandings from './BracketStandings'
import LoadingSpinner from '../ui/LoadingSpinner'
import EmptyState from '../ui/EmptyState'

export default function BracketView({ league }) {
  const { profile } = useAuth()
  const { data: tournament, isLoading: tournamentLoading } = useBracketTournament(league.id)
  const { data: myEntry } = useBracketEntry(league.id)
  const { data: entries } = useBracketEntries(league.id)

  // Check for saved draft
  const savedDraft = useMemo(() => {
    try {
      const raw = localStorage.getItem(`bracket-draft-${league.id}`)
      if (!raw) return null
      const draft = JSON.parse(raw)
      const pickCount = draft?.picks ? Object.keys(draft.picks).length : 0
      return pickCount > 0 ? { ...draft, pickCount } : null
    } catch { return null }
  }, [league.id])

  const [showPicker, setShowPicker] = useState(!!savedDraft)
  const [viewingUserId, setViewingUserId] = useState(null)
  const [viewTab, setViewTab] = useState('bracket') // bracket | standings

  const { data: viewedEntry } = useViewBracketEntry(
    league.id,
    viewingUserId && viewingUserId !== profile?.id ? viewingUserId : null
  )

  if (tournamentLoading) return <LoadingSpinner />
  if (!tournament) return <EmptyState title="No tournament" message="Tournament data not available" />

  const isLocked = tournament.status !== 'open' || new Date(tournament.locks_at) <= new Date()
  const hasSubmitted = !!myEntry
  const rounds = tournament.bracket_templates?.rounds || []

  // Check if bracket is populated (first-round matchups have teams)
  const firstRoundMatchups = (tournament.matchups || []).filter((m) => m.round_number === 1 || m.round_number === 0)
  const isBracketPopulated = firstRoundMatchups.length > 0 && firstRoundMatchups.some(
    (m) => m.team_top || m.team_bottom
  )

  const picksAvailableAt = tournament.bracket_templates?.picks_available_at
  const picksAvailableNow = !picksAvailableAt || new Date(picksAvailableAt) <= new Date()

  // State A: Bracket not populated yet
  if (!isBracketPopulated) {
    const templateName = tournament.bracket_templates?.name
    const locksAtDate = tournament.locks_at
      ? new Date(tournament.locks_at).toLocaleString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric',
          hour: 'numeric', minute: '2-digit',
        })
      : null

    return (
      <div className="bg-bg-card rounded-xl border border-border p-6 text-center">
        <div className="text-4xl mb-3">&#x1F3C0;</div>
        <h3 className="font-display text-lg text-text-primary mb-2">
          Welcome to the {templateName || 'Tournament'} Challenge!
        </h3>
        <p className="text-sm text-text-muted mb-3">
          The tournament bracket hasn't been set yet.
        </p>
        {picksAvailableAt && (
          <p className="text-sm text-text-muted mb-1">
            Your bracket will be available to fill out starting{' '}
            <span className="text-text-secondary font-semibold">
              {new Date(picksAvailableAt).toLocaleString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </span>
          </p>
        )}
        {locksAtDate && (
          <p className="text-sm text-text-muted">
            Brackets must be completed by{' '}
            <span className="text-text-secondary font-semibold">{locksAtDate}</span>
          </p>
        )}
      </div>
    )
  }

  // State B: Bracket populated but picks not available yet
  const picksBlocked = !picksAvailableNow && !isLocked

  // Show picker if user chose to fill bracket (only if picks are available)
  if (showPicker && !isLocked && picksAvailableNow) {
    return (
      <BracketPicker
        league={league}
        tournament={tournament}
        matchups={tournament.matchups}
        existingPicks={myEntry?.picks}
        existingTiebreakerScore={myEntry?.tiebreaker_score}
        onClose={() => setShowPicker(false)}
      />
    )
  }

  const displayPicks = viewingUserId === profile?.id
    ? myEntry?.picks
    : viewedEntry?.picks || null

  return (
    <div>
      {/* Picks not available yet banner */}
      {picksBlocked && (
        <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 mb-4 text-center">
          <div className="text-sm text-text-secondary font-semibold mb-1">
            Picks open {new Date(picksAvailableAt).toLocaleString('en-US', {
              month: 'long', day: 'numeric', year: 'numeric',
              hour: 'numeric', minute: '2-digit',
            })}
          </div>
          <div className="text-xs text-text-muted">Review the bracket in the meantime!</div>
        </div>
      )}

      {/* Status banner */}
      {!isLocked && !picksBlocked && (
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-4 text-center">
          <div className="text-sm text-text-secondary mb-2">
            {hasSubmitted
              ? 'Your bracket has been submitted!'
              : savedDraft
                ? `You have a bracket in progress (${savedDraft.pickCount} picks made)`
                : 'Fill out your bracket before the lock.'}
          </div>
          <div className="text-xs text-text-muted mb-3">
            Locks: {new Date(tournament.locks_at).toLocaleString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </div>
          <button
            onClick={() => setShowPicker(true)}
            className="px-6 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            {hasSubmitted ? 'Edit Bracket' : savedDraft ? 'Continue Bracket' : 'Fill Your Bracket'}
          </button>
        </div>
      )}

      {isLocked && !hasSubmitted && (
        <div className="bg-bg-card border border-border rounded-xl p-5 mb-4 text-center">
          <div className="text-sm text-text-primary font-semibold mb-2">Bracket not submitted in time</div>
          <div className="text-xs text-text-muted leading-relaxed">
            You didn't get your bracket in before this tournament locked. But don't worry — I KNOW BALL has plenty of ways to compete and showcase your sports prediction powers!
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setViewTab('bracket')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            viewTab === 'bracket' ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          Bracket
        </button>
        <button
          onClick={() => setViewTab('standings')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            viewTab === 'standings' ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          Standings
        </button>
      </div>

      {viewTab === 'bracket' && (
        <div>
          {/* User bracket selector (after lock) */}
          {isLocked && entries?.length > 0 && (
            <div className="mb-4">
              <div className="flex gap-1 overflow-x-auto pb-1">
                <button
                  onClick={() => setViewingUserId(null)}
                  className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    !viewingUserId ? 'bg-accent/20 text-accent' : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
                  }`}
                >
                  Master
                </button>
                {entries.map((e) => (
                  <button
                    key={e.user_id}
                    onClick={() => setViewingUserId(e.user_id)}
                    className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      viewingUserId === e.user_id ? 'bg-accent/20 text-accent' : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
                    }`}
                  >
                    {e.user_id === profile?.id ? 'My Bracket' : e.users?.display_name || e.users?.username}
                  </button>
                ))}
              </div>
            </div>
          )}

          <BracketDisplay
            matchups={tournament.matchups}
            picks={viewingUserId ? displayPicks : (myEntry?.picks || null)}
            rounds={rounds}
            regions={tournament.bracket_templates?.regions}
          />
        </div>
      )}

      {viewTab === 'standings' && (
        <BracketStandings
          entries={entries}
          championshipTotalScore={tournament?.championship_total_score}
          onViewBracket={isLocked ? (userId) => {
            setViewingUserId(userId)
            setViewTab('bracket')
          } : null}
        />
      )}
    </div>
  )
}
