import { useGameIntel } from '../../hooks/useGames'
import LoadingSpinner from '../ui/LoadingSpinner'

export default function GameDetailModal({ gameId, onClose }) {
  const { data, isLoading } = useGameIntel(gameId)

  if (!gameId) return null

  const game = data?.game
  const isMLB = game?.sports?.key === 'baseball_mlb'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-primary border border-text-primary/20 w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
        >
          &times;
        </button>

        {isLoading ? (
          <LoadingSpinner />
        ) : !game ? (
          <p className="text-text-muted text-center">Game not found</p>
        ) : (
          <div className="space-y-5">
            {/* Matchup header */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-4">
                <div className="flex-1 text-right">
                  <div className="font-display text-lg">{game.away_team}</div>
                  {data.awayRecord && (
                    <div className="text-xs text-text-muted">{data.awayRecord}</div>
                  )}
                </div>
                <div className="text-xs text-text-muted font-semibold">@</div>
                <div className="flex-1 text-left">
                  <div className="font-display text-lg">{game.home_team}</div>
                  {data.homeRecord && (
                    <div className="text-xs text-text-muted">{data.homeRecord}</div>
                  )}
                </div>
              </div>
              <div className="text-xs text-text-muted mt-2">
                {new Date(game.starts_at).toLocaleString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric',
                  hour: 'numeric', minute: '2-digit',
                  timeZone: 'America/New_York',
                })} ET
              </div>
            </div>

            {/* Recent form */}
            {(data.awayLast10 || data.homeLast10) && (
              <div className="bg-bg-primary border border-text-primary/20 rounded-xl p-4">
                <h3 className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-3">Last 10 Games</h3>
                <div className="flex justify-between">
                  <div className="text-center flex-1">
                    <div className="text-sm font-bold text-text-primary">{data.awayLast10 || '—'}</div>
                    <div className="text-xs text-text-muted mt-0.5">{game.away_team.split(' ').pop()}</div>
                  </div>
                  <div className="w-px bg-text-primary/10" />
                  <div className="text-center flex-1">
                    <div className="text-sm font-bold text-text-primary">{data.homeLast10 || '—'}</div>
                    <div className="text-xs text-text-muted mt-0.5">{game.home_team.split(' ').pop()}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Probable pitchers (MLB only) */}
            {isMLB && (data.awayPitcher || data.homePitcher) && (
              <div className="bg-bg-primary border border-text-primary/20 rounded-xl p-4">
                <h3 className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-3">Probable Pitchers</h3>
                <div className="space-y-3">
                  {data.awayPitcher && (
                    <div className="flex items-center gap-3">
                      {data.awayPitcher.headshot && (
                        <img src={data.awayPitcher.headshot} alt="" className="w-10 h-10 rounded-full object-cover bg-bg-secondary" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-text-primary">{data.awayPitcher.name}</div>
                        <div className="text-xs text-text-muted">{game.away_team.split(' ').pop()}</div>
                        {data.awayPitcher.stats && (
                          <div className="text-xs text-text-secondary mt-0.5">{data.awayPitcher.stats}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {data.awayPitcher && data.homePitcher && <div className="h-px bg-text-primary/10" />}
                  {data.homePitcher && (
                    <div className="flex items-center gap-3">
                      {data.homePitcher.headshot && (
                        <img src={data.homePitcher.headshot} alt="" className="w-10 h-10 rounded-full object-cover bg-bg-secondary" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-text-primary">{data.homePitcher.name}</div>
                        <div className="text-xs text-text-muted">{game.home_team.split(' ').pop()}</div>
                        {data.homePitcher.stats && (
                          <div className="text-xs text-text-secondary mt-0.5">{data.homePitcher.stats}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Odds */}
            {(game.away_odds || game.home_odds) && (
              <div className="bg-bg-primary border border-text-primary/20 rounded-xl p-4">
                <h3 className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-3">Moneyline</h3>
                <div className="flex justify-between">
                  <div className="text-center flex-1">
                    <div className={`text-sm font-bold ${game.away_odds < 0 ? 'text-correct' : 'text-text-primary'}`}>
                      {game.away_odds > 0 ? `+${game.away_odds}` : game.away_odds}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">{game.away_team.split(' ').pop()}</div>
                  </div>
                  <div className="w-px bg-text-primary/10" />
                  <div className="text-center flex-1">
                    <div className={`text-sm font-bold ${game.home_odds < 0 ? 'text-correct' : 'text-text-primary'}`}>
                      {game.home_odds > 0 ? `+${game.home_odds}` : game.home_odds}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">{game.home_team.split(' ').pop()}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
