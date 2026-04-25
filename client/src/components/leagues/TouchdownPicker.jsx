import { useState } from 'react'
import { useTouchdownPlayers, useSubmitTouchdownPick } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'

const POSITION_FILTERS = ['All', 'RB', 'WR', 'TE', 'QB']

export default function TouchdownPicker({ league, pickWeek, onPick }) {
  const [posFilter, setPosFilter] = useState('All')
  const [search, setSearch] = useState('')
  const { data: players, isLoading } = useTouchdownPlayers(league.id, posFilter, search || undefined)
  const submitPick = useSubmitTouchdownPick()

  async function handlePick(player) {
    if (player.used) {
      toast(`You've already used ${player.full_name}`, 'error')
      return
    }
    try {
      await submitPick.mutateAsync({
        leagueId: league.id,
        weekId: pickWeek.id,
        playerId: player.id,
      })
      onPick?.(player.full_name)
      toast(`${player.full_name} selected!`, 'success')
    } catch (err) {
      toast(err.message || 'Failed to submit pick', 'error')
    }
  }

  return (
    <div className="rounded-xl border border-text-primary/20 p-4 mb-6 relative z-10 bg-bg-card/50 md:bg-bg-card/30 backdrop-blur-sm">
      <h3 className="font-display text-sm text-text-primary mb-3">Pick a Player to Score a TD</h3>

      {/* Position filter */}
      <div className="flex gap-1.5 mb-3">
        {POSITION_FILTERS.map((pos) => (
          <button
            key={pos}
            onClick={() => setPosFilter(pos)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              posFilter === pos ? 'bg-accent text-white' : 'bg-bg-primary/40 text-text-secondary hover:bg-bg-primary/60 border border-text-primary/20'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search players..."
        className="w-full bg-bg-primary/40 border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent mb-3"
      />

      {/* Player list */}
      {isLoading ? (
        <LoadingSpinner />
      ) : !players?.length ? (
        <p className="text-sm text-text-muted text-center py-4">No players found</p>
      ) : (
        <div className="max-h-[400px] overflow-y-auto space-y-1 scrollbar-hide">
          {players.map((player) => (
            <button
              key={player.id}
              onClick={() => handlePick(player)}
              disabled={player.used || player.on_bye || submitPick.isPending}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                player.used || player.on_bye
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:bg-accent/10 cursor-pointer'
              }`}
            >
              {player.headshot_url ? (
                <img
                  src={player.headshot_url}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-bg-secondary shrink-0 flex items-center justify-center text-xs text-text-muted font-bold">
                  {player.position}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-text-primary truncate">{player.full_name}</span>
                  {player.injury_status && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      player.injury_status === 'Out' ? 'bg-incorrect/20 text-incorrect'
                      : player.injury_status === 'Questionable' ? 'bg-yellow-500/20 text-yellow-500'
                      : 'bg-text-primary/10 text-text-muted'
                    }`}>
                      {player.injury_status === 'Day-To-Day' ? 'DTD' : player.injury_status.charAt(0)}
                    </span>
                  )}
                  {player.used && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-text-muted/20 text-text-muted">Used</span>
                  )}
                  {player.on_bye && !player.used && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-text-primary/10 text-text-muted">BYE</span>
                  )}
                </div>
                <div className="text-xs text-text-muted">{player.position} · {player.team || 'FA'}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
