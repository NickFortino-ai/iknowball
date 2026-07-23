import { useEffect, useState } from 'react'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import { useGameIntel } from '../../hooks/useGames'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../../lib/teamLogos'
import LoadingSpinner from '../ui/LoadingSpinner'

function PitcherAvatar({ headshot, name }) {
  const [errored, setErrored] = useState(false)
  const initials = (name || '?').split(/\s+/).map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  if (headshot && !errored) {
    return (
      <img
        src={headshot}
        alt=""
        className="w-12 h-12 rounded-full object-cover bg-bg-secondary shrink-0"
        onError={() => setErrored(true)}
      />
    )
  }
  return (
    <div className="w-12 h-12 rounded-full bg-bg-secondary shrink-0 flex items-center justify-center text-sm text-text-muted font-bold">
      {initials}
    </div>
  )
}

function TeamLogo({ team, sportKey }) {
  const [src, setSrc] = useState(() => getTeamLogoUrl(team, sportKey))
  const [hidden, setHidden] = useState(false)
  if (!src || hidden) return null
  return <img src={src} alt="" className="w-12 h-12 object-contain mx-auto" onError={() => {
    const fallback = getTeamLogoFallbackUrl(team, sportKey)
    if (fallback && fallback !== src) setSrc(fallback)
    else setHidden(true)
  }} />
}

export default function GameDetailModal({ gameId, onClose }) {
  const { data, isLoading } = useGameIntel(gameId)

  useEffect(() => {
    if (!gameId) return
    lockScroll()
    return () => unlockScroll()
  }, [gameId])

  if (!gameId) return null

  const game = data?.game

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{
        paddingTop: 'max(1.5rem, calc(3.5rem + env(safe-area-inset-top) + 1rem))',
        paddingBottom: 'max(1.5rem, calc(3.5rem + env(safe-area-inset-bottom) + 1rem))',
      }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-primary/90 backdrop-blur-md border border-text-primary/20 w-full md:max-w-lg rounded-2xl p-6 max-h-full overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-10 h-10 flex items-center justify-center text-text-muted hover:text-text-primary text-xl leading-none rounded-full hover:bg-bg-secondary transition-colors"
        >
          &times;
        </button>

        <h2 className="font-display text-lg mb-4">Game Intel</h2>

        {isLoading ? (
          <LoadingSpinner />
        ) : !game ? (
          <p className="text-text-muted text-center">No data available</p>
        ) : (
          <div className="space-y-5">
            {/* Team records */}
            {(data.homeRecord || data.awayRecord) && (
              <div className="flex items-center justify-between px-2">
                <div className="text-center flex-1">
                  <TeamLogo team={game.away_team} sportKey={game.sports?.key} />
                  <div className="font-display text-base mt-1">{game.away_team}</div>
                  <div className="text-sm font-bold text-text-primary">{data.awayRecord || '—'}</div>
                  {data.awayLast10 && <div className="text-[10px] text-text-muted">L10: {data.awayLast10}</div>}
                </div>
                <div className="text-xs text-text-muted font-semibold">@</div>
                <div className="text-center flex-1">
                  <TeamLogo team={game.home_team} sportKey={game.sports?.key} />
                  <div className="font-display text-base mt-1">{game.home_team}</div>
                  <div className="text-sm font-bold text-text-primary">{data.homeRecord || '—'}</div>
                  {data.homeLast10 && <div className="text-[10px] text-text-muted">L10: {data.homeLast10}</div>}
                </div>
              </div>
            )}

            {/* Probable pitchers (MLB) */}
            {(data.awayPitcher || data.homePitcher) && (
              <div>
                <div className="text-xs text-text-muted uppercase tracking-wider mb-3">Probable Pitchers</div>
                <div className="space-y-3">
                  {data.awayPitcher && (
                    <div className="flex items-center gap-3">
                      <PitcherAvatar headshot={data.awayPitcher.headshot} name={data.awayPitcher.name} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-text-primary">{data.awayPitcher.name}</div>
                        <div className="text-xs text-text-muted">{game.away_team.split(' ').pop()}{data.awayPitcher.record ? ` · ${data.awayPitcher.record}` : ''}</div>
                        {data.awayPitcher.stats && (
                          <div className="text-xs text-text-secondary mt-0.5">{data.awayPitcher.stats}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {data.awayPitcher && data.homePitcher && <div className="h-px bg-text-primary/10" />}
                  {data.homePitcher && (
                    <div className="flex items-center gap-3">
                      <PitcherAvatar headshot={data.homePitcher.headshot} name={data.homePitcher.name} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-text-primary">{data.homePitcher.name}</div>
                        <div className="text-xs text-text-muted">{game.home_team.split(' ').pop()}{data.homePitcher.record ? ` · ${data.homePitcher.record}` : ''}</div>
                        {data.homePitcher.stats && (
                          <div className="text-xs text-text-secondary mt-0.5">{data.homePitcher.stats}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
