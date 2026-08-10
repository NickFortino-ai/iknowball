import { useState } from 'react'
import { useTouchdownPlayers, useSubmitTouchdownPick } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'
import InjuryBadge from '../ui/InjuryBadge'
import PlayerDetailModal from '../ui/PlayerDetailModal'

const POSITION_FILTERS = ['All', 'RB', 'WR', 'TE']

export default function TouchdownPicker({ league, pickWeek, onPick }) {
  const [posFilter, setPosFilter] = useState('All')
  const [search, setSearch] = useState('')
  const { data: response, isLoading } = useTouchdownPlayers(league.id, posFilter, search || undefined)
  const submitPick = useSubmitTouchdownPick()
  const [detailPlayer, setDetailPlayer] = useState(null)

  // Response shape is { players, period, not_open_yet?, opens_at? }
  // — see server route. Backward compat: if a legacy build returns
  // a bare array, treat it as players.
  const players = Array.isArray(response) ? response : (response?.players || [])
  const notOpenYet = response?.not_open_yet
  const opensAt = response?.opens_at

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

      {/* Pre-league state: league hasn't reached its first period yet.
          Show a friendly message with the open date instead of a
          list the user can't pick from. */}
      {notOpenYet ? (
        <div className="text-center py-8">
          <div className="text-sm text-text-primary mb-1 font-semibold">Not open yet</div>
          <div className="text-xs text-text-secondary">
            {opensAt
              ? `Picks open ${new Date(opensAt).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`
              : 'Waiting for the league schedule to be set'}
          </div>
        </div>
      ) : (
        <>
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
          ) : !players.length ? (
            <p className="text-sm text-text-muted text-center py-4">No players found</p>
          ) : (
            <>
              <div className="flex items-center px-3 py-1.5 mb-1">
                <div className="flex-1" />
                <span className="text-[10px] text-text-muted uppercase tracking-wider">Season TD</span>
              </div>
              {/* Row list — divide-y for a faint separator, hover
                  highlight on desktop (mimics scoreboard row style). */}
              <div className="max-h-[400px] overflow-y-auto scrollbar-hide divide-y divide-white/5">
                {players.map((player) => (
                  <div
                    key={player.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      player.used || player.on_bye
                        ? 'opacity-40'
                        : 'hover:bg-accent/10'
                    }`}
                  >
                    {/* Headshot is its own tappable — opens the player
                        detail modal without triggering a pick. */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDetailPlayer(player) }}
                      className="shrink-0"
                      aria-label={`View ${player.full_name} details`}
                    >
                      {player.headshot_url ? (
                        <img
                          src={player.headshot_url}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover bg-bg-secondary"
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-bg-secondary flex items-center justify-center text-xs text-text-muted font-bold">
                          {player.position}
                        </div>
                      )}
                    </button>
                    {/* Main body — clicking selects the player */}
                    <button
                      type="button"
                      onClick={() => handlePick(player)}
                      disabled={player.used || player.on_bye || submitPick.isPending}
                      className="flex-1 min-w-0 text-left disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-text-primary truncate">{player.full_name}</span>
                        <InjuryBadge status={player.injury_status} />
                        {player.used && (
                          <span className="text-[10px] font-bold text-text-muted">USED</span>
                        )}
                        {player.on_bye && !player.used && (
                          <span className="text-[10px] font-bold text-text-muted">BYE</span>
                        )}
                      </div>
                      <div className="text-xs text-text-muted">
                        {player.position} · {player.team || 'FA'}
                        {player.matchup && (
                          <>
                            {' · '}
                            <span>{player.matchup.is_home ? 'vs' : '@'} {player.matchup.opponent}</span>
                          </>
                        )}
                      </div>
                    </button>
                    <span className="font-display text-base text-white whitespace-nowrap shrink-0">{player.season_tds || 0}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {detailPlayer && (
        <PlayerDetailModal
          player={detailPlayer}
          sport="americanfootball_nfl"
          onClose={() => setDetailPlayer(null)}
        />
      )}
    </div>
  )
}
