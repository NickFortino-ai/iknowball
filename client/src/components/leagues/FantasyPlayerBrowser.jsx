import { useState } from 'react'
import { useAvailablePlayers } from '../../hooks/useLeagues'

const POSITION_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF']

export default function FantasyPlayerBrowser({ league }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [posFilter, setPosFilter] = useState('All')

  const { data: players, isLoading } = useAvailablePlayers(
    league.id,
    searchQuery || undefined,
    posFilter !== 'All' ? posFilter : undefined
  )

  return (
    <div className="rounded-xl border border-text-primary/20 overflow-hidden">
      <div className="p-3 border-b border-border">
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
      <div className="max-h-[60vh] overflow-y-auto">
        {isLoading ? (
          <div className="text-center text-sm text-text-muted py-8">Loading...</div>
        ) : (players || []).map((player) => (
          <div key={player.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
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
            <span className="text-xs text-text-muted shrink-0">#{player.search_rank}</span>
          </div>
        ))}
        {!isLoading && players?.length === 0 && (
          <div className="text-center text-sm text-text-muted py-8">No players found</div>
        )}
      </div>
    </div>
  )
}
