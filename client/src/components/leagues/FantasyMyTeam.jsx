import { useState } from 'react'
import { useFantasyRoster, useAvailablePlayers } from '../../hooks/useLeagues'
import LoadingSpinner from '../ui/LoadingSpinner'

const POSITION_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF']

export default function FantasyMyTeam({ league }) {
  const { data: roster, isLoading: rosterLoading } = useFantasyRoster(league.id)
  const [searchQuery, setSearchQuery] = useState('')
  const [posFilter, setPosFilter] = useState('All')
  const [showPlayers, setShowPlayers] = useState(false)

  const { data: availablePlayers } = useAvailablePlayers(
    showPlayers ? league.id : null,
    searchQuery || undefined,
    posFilter !== 'All' ? posFilter : undefined
  )

  if (rosterLoading) return <LoadingSpinner />

  const hasRoster = roster && roster.length > 0

  return (
    <div className="space-y-4">
      {/* My Roster */}
      {hasRoster ? (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">My Roster</h3>
          </div>
          {roster.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-0">
              {r.nfl_players?.headshot_url && (
                <img
                  src={r.nfl_players.headshot_url}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary truncate">{r.nfl_players?.full_name}</div>
                <div className="text-xs text-text-muted">{r.nfl_players?.position} · {r.nfl_players?.team || 'FA'}</div>
              </div>
              <span className="text-xs text-text-muted uppercase">{r.slot}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6">
          <div className="text-2xl mb-2">{'\uD83C\uDFC8'}</div>
          <p className="text-sm text-text-secondary">No players on your roster yet. Complete the draft to build your team.</p>
        </div>
      )}

      {/* Browse Players */}
      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <button
          onClick={() => setShowPlayers(!showPlayers)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <h3 className="text-sm font-semibold text-text-primary">Browse Players</h3>
          <svg className={`w-4 h-4 text-text-muted transition-transform ${showPlayers ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showPlayers && (
          <div>
            <div className="px-4 pb-3 border-b border-border">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search players..."
                className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="flex gap-1 mt-2 overflow-x-auto">
                {POSITION_FILTERS.map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setPosFilter(pos)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                      posFilter === pos ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {(availablePlayers || []).map((player) => (
                <div key={player.id} className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-0">
                  {player.headshot_url && (
                    <img
                      src={player.headshot_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{player.full_name}</div>
                    <div className="text-xs text-text-muted">{player.position} · {player.team || 'FA'}</div>
                  </div>
                  <span className="text-xs text-text-muted">#{player.search_rank}</span>
                </div>
              ))}
              {availablePlayers?.length === 0 && (
                <div className="text-center text-sm text-text-muted py-8">No players found</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
