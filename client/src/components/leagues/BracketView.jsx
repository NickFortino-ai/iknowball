import { useState } from 'react'
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
import BracketResultEntry from './BracketResultEntry'
import LoadingSpinner from '../ui/LoadingSpinner'
import EmptyState from '../ui/EmptyState'

export default function BracketView({ league, isCommissioner }) {
  const { profile } = useAuth()
  const { data: tournament, isLoading: tournamentLoading } = useBracketTournament(league.id)
  const { data: myEntry } = useBracketEntry(league.id)
  const { data: entries } = useBracketEntries(league.id)

  const [showPicker, setShowPicker] = useState(false)
  const [viewingUserId, setViewingUserId] = useState(null)
  const [viewTab, setViewTab] = useState('bracket') // bracket | standings | results

  const { data: viewedEntry } = useViewBracketEntry(
    league.id,
    viewingUserId && viewingUserId !== profile?.id ? viewingUserId : null
  )

  if (tournamentLoading) return <LoadingSpinner />
  if (!tournament) return <EmptyState title="No tournament" message="Tournament data not available" />

  const isLocked = tournament.status !== 'open' || new Date(tournament.locks_at) <= new Date()
  const hasSubmitted = !!myEntry
  const rounds = tournament.bracket_templates?.rounds || []

  // Show picker if user chose to fill bracket
  if (showPicker && !isLocked) {
    return (
      <BracketPicker
        league={league}
        tournament={tournament}
        matchups={tournament.matchups}
        existingPicks={myEntry?.picks}
        onClose={() => setShowPicker(false)}
      />
    )
  }

  const displayPicks = viewingUserId === profile?.id
    ? myEntry?.picks
    : viewedEntry?.picks || null

  return (
    <div>
      {/* Status banner */}
      {!isLocked && (
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-4 text-center">
          <div className="text-sm text-text-secondary mb-2">
            {hasSubmitted ? 'Your bracket has been submitted!' : 'Fill out your bracket before the lock.'}
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
            {hasSubmitted ? 'Edit Bracket' : 'Fill Your Bracket'}
          </button>
        </div>
      )}

      {isLocked && !hasSubmitted && (
        <div className="bg-incorrect/10 border border-incorrect/30 rounded-xl p-4 mb-4 text-center">
          <div className="text-sm text-incorrect font-semibold">You did not submit a bracket</div>
          <div className="text-xs text-text-muted mt-1">The bracket is now locked</div>
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
        {isCommissioner && isLocked && (
          <button
            onClick={() => setViewTab('results')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              viewTab === 'results' ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            Enter Results
          </button>
        )}
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
            picks={viewingUserId ? displayPicks : null}
            rounds={rounds}
          />
        </div>
      )}

      {viewTab === 'standings' && (
        <BracketStandings entries={entries} />
      )}

      {viewTab === 'results' && isCommissioner && (
        <BracketResultEntry
          league={league}
          matchups={tournament.matchups}
          tournament={tournament}
        />
      )}
    </div>
  )
}
